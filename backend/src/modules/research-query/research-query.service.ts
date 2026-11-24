import { DocumentLoader } from "./langchain/document-loader";
import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  PlanApprovalStatus,
  ResearchPlanStep,
  ResearchStateType,
} from "./research-state";
import type {
  ResearchConditionContext,
  ResearchConditionHandler,
} from "./conditions/condition-context";
import handleQueryOnly from "./conditions/condition-1-query-only";
import handleSmallDocument from "./conditions/condition-2-small-document";
import handleSmallPastedText from "./conditions/condition-3-small-pasted-text";
import handleLargeDocument from "./conditions/condition-4-large-document";
import handleLargePastedText from "./conditions/condition-5-large-pasted-text";
import handleDocumentAndPastedText from "./conditions/condition-6-document-and-pasted-text";
import { fileService } from "./minio/file.service";
import { researchMessageRepository } from "../../database/mongo/research-message/researchMessageModelRepo";
import { researchPlanVersionRepository } from "../../database/mongo/research-plan/researchPlanVersionModelRepo";
import { researchSessionRepository } from "../../database/mongo/research-session/researchSessionModelRepo";
import { researchExecutionRepository } from "../../database/mongo/research-execution/researchExecutionModelRepo";
import { runInTransaction } from "../../database/mongo/transaction";
import type { ResearchPlanVersion } from "../../entities/research-plan/researchPlanVersion";
import type { ResearchSession } from "../../entities/research-session/researchSession";
import { UserId } from "../../entities/user/userId";
import { AppError } from "../../Error/appError";

export interface ProcessResearchQueryOptions {
  action?: "generate_plan" | "edit_plan" | "approve_plan" | "auto";
  userPlanEdits?: string;
  researchPlan?: ResearchPlanStep[];
  planApprovalStatus?: PlanApprovalStatus;
  sessionId?: string;
  executionId?: string;
  requestId?: string;
}

const researchConditions: ResearchConditionHandler[] = [
  handleQueryOnly,
  handleSmallDocument,
  handleSmallPastedText,
  handleLargeDocument,
  handleLargePastedText,
  handleDocumentAndPastedText,
];

class ResearchQueryService {
  private static readonly LARGE_CONTENT_THRESHOLD_BYTES =
    DocumentLoader.LARGE_DOCUMENT_THRESHOLD_BYTES;

  // format response to send it to conditions.  
  private formatResponse(
    mode: string,
    query: string | null,
    graphResult: ResearchStateType,
    planApprovalStatus: PlanApprovalStatus,
    extra: Record<string, unknown> = {},
  ) {
    const base = {
      mode,
      query,
      planApprovalStatus: graphResult.planApprovalStatus || planApprovalStatus,
      researchPlan: graphResult.researchPlan || [],
      planIterationCount: graphResult.planIterationCount || 1,
      conversationHistory: graphResult.conversationHistory || [],
      retrievedChunks: graphResult.retrievedChunks || [],
      searchResults: graphResult.searchResults || [],
      ...extra,
    };

    if (planApprovalStatus === "approved") {
      return {
        ...base,
        answer: graphResult.finalAnswer,
      };
    }

    return base;
  }

  /**
   * Saves each generated or revised plan as a new version and points the session
   * at the version waiting for user approval.
   */
  private async persistPlanVersion(
    session: ResearchSession,
    objective: string,
    steps: ResearchPlanStep[],
    executionId: string,
    changeSummary?: string,
  ): Promise<string> {
    if (steps.length === 0) {
      throw new AppError("Research workflow returned an empty plan.", 500);
    }

    const sessionId = session.getId().toString();

    return await runInTransaction(async (dbSession) => {
      const previousPendingPlanId = session.getPendingPlanVersionId();
      let previousPendingPlan: ResearchPlanVersion | null = null;

      if (previousPendingPlanId) {
        previousPendingPlan =
          await researchPlanVersionRepository.findById(
            previousPendingPlanId,
            dbSession,
          );
        if (
          !previousPendingPlan ||
          previousPendingPlan.getSessionId().toString() !== sessionId
        ) {
          throw new AppError("Pending research plan was not found.", 409);
        }
      }

      const version = session.getCurrentPlanVersion() + 1;
      const planVersion =
        await researchPlanVersionRepository.createPlanVersion(
          {
            sessionId,
            version,
            basedOnVersion: session.getCurrentPlanVersion() || null,
            createdBy: "ai",
            status: "pending_approval",
            plan: {
              title: objective.slice(0, 80) || "Research plan",
              objective,
              steps: steps.map((step) => ({
                stepId: step.id,
                title: step.title,
                description: step.description ?? "",
                dependsOn: step.dependsOn ?? [],
              })),
            },
            changeSummary: changeSummary || null,
          },
          dbSession,
        );

      if (
        previousPendingPlan &&
        previousPendingPlan.getStatus() !== "approved" &&
        previousPendingPlan.getStatus() !== "superseded"
      ) {
        previousPendingPlan.supersede();
        await researchPlanVersionRepository.updatePlanVersion(
          previousPendingPlan,
          dbSession,
        );
      }

      session.setPendingPlan(planVersion.getId().toString(), version);
      const planVersionId = planVersion.getId().toString();
      await researchExecutionRepository.setPlanVersion(
        executionId,
        planVersionId,
        dbSession,
      );
      await researchExecutionRepository.setExecutionStatus(
        executionId,
        "pending",
        null,
        dbSession,
      );
      await researchMessageRepository.createMessage(
        {
          sessionId,
          userId: session.getUserId().toString(),
          sequence: await researchMessageRepository.getNextSequence(
            sessionId,
            dbSession,
          ),
          role: "assistant",
          content: "I have prepared a research plan for your review.",
          executionId,
          planVersionId,
        },
        dbSession,
      );
      session.incrementMessageCount();
      await researchSessionRepository.updateSession(session, dbSession);

      return planVersionId;
    });
  }

  /**
   * Marks the session's pending plan approved before starting research execution.
   */
  private async approvePendingPlan(
    session: ResearchSession,
    userId: string,
  ): Promise<void> {
    const pendingPlanId = session.getPendingPlanVersionId();
    if (!pendingPlanId) {
      const activePlanVersionId = session.getActivePlanVersionId();
      if (activePlanVersionId) {
        const activePlan =
          await researchPlanVersionRepository.findById(activePlanVersionId);
        if (activePlan?.getStatus() === "approved") return;
      }
      throw new AppError(
        "No pending research plan is available to approve.",
        409,
      );
    }

    await runInTransaction(async (dbSession) => {
      const pendingPlan =
        await researchPlanVersionRepository.findById(pendingPlanId, dbSession);
      if (
        !pendingPlan ||
        pendingPlan.getSessionId().toString() !== session.getId().toString()
      ) {
        throw new AppError("Pending research plan was not found.", 409);
      }
      if (pendingPlan.getStatus() !== "pending_approval") {
        throw new AppError("Research plan is no longer awaiting approval.", 409);
      }

      pendingPlan.approve(new UserId(userId));
      await researchPlanVersionRepository.updatePlanVersion(
        pendingPlan,
        dbSession,
      );

      session.approvePlan(pendingPlanId);
      await researchSessionRepository.updateSession(session, dbSession);
    });
  }

  /**
   * Persists the generated assistant response and marks the session complete.
   */
  private async persistAssistantResponse(
    session: ResearchSession,
    userId: string,
    answer: string,
    executionId: string,
  ): Promise<void> {
    const sessionId = session.getId().toString();
    await runInTransaction(async (dbSession) => {
      const existingAnswer =
        await researchMessageRepository.findAssistantResponseByExecutionId(
          executionId,
          dbSession,
        );
      if (!existingAnswer) {
        await researchMessageRepository.createMessage(
          {
            sessionId,
            userId,
            sequence: await researchMessageRepository.getNextSequence(
              sessionId,
              dbSession,
            ),
            role: "assistant",
            content: answer,
            executionId,
          },
          dbSession,
        );

        session.incrementMessageCount();
      }
      session.completeSession();
      await researchSessionRepository.updateSession(session, dbSession);
      await researchExecutionRepository.setExecutionStatus(
        executionId,
        "completed",
        null,
        dbSession,
      );
    });
  }

  public async processResearchQuery(
    userId: string,
    query: string | undefined,
    pastedText: string | undefined,
    document: Express.Multer.File | undefined,
    conversationHistory: ChatMessage[] = [],
    options?: ProcessResearchQueryOptions,
  ): Promise<unknown> {
    const cleanQuery = query?.trim();
    const cleanPastedText = pastedText?.trim();
    const userPlanEdits = options?.userPlanEdits?.trim();

    // store clean pasted text size in pastedTextSizeBytes in bytes
    const pastedTextSizeBytes = cleanPastedText
      ? Buffer.byteLength(cleanPastedText, "utf-8")
      : 0;

    // checking paln status
    const planApprovalStatus: PlanApprovalStatus =
      options?.action === "approve_plan" ||
      options?.planApprovalStatus === "approved"
        ? "approved"
        : options?.action === "edit_plan" ||
            Boolean(userPlanEdits) ||
            options?.planApprovalStatus === "edit_requested"
          ? "edit_requested"
          : "awaiting_approval";

    console.log("[ResearchQueryService] Processing request:", {
      hasQuery: Boolean(cleanQuery),
      hasDocument: Boolean(document),
      documentSize: document?.size,
      hasPastedText: Boolean(cleanPastedText),
      pastedTextBytes: pastedTextSizeBytes,
      historyLength: conversationHistory.length,
      planApprovalStatus,
      hasUserEdits: Boolean(userPlanEdits),
      existingPlanLength: options?.researchPlan?.length || 0,
    });

    const isPlanAction =
      options?.action === "approve_plan" || options?.action === "edit_plan";
    if (
      !cleanQuery &&
      !document &&
      !cleanPastedText &&
      !options?.researchPlan?.length &&
      !isPlanAction
    ) {
      console.log("Condition: Invalid request - No input provided.");
      throw new Error(
        "Please provide a search query, a document, or pasted text.",
      );
    }

    const isApprovalAction =
      options?.action === "approve_plan" || options?.action === "edit_plan";
    const userMessageContent =
      options?.action === "approve_plan"
        ? undefined
        : options?.action === "edit_plan"
          ? userPlanEdits
          : cleanQuery ||
            cleanPastedText ||
            (document ? `Uploaded document: ${document.originalname}` : undefined);

    let session: ResearchSession;

    if (options?.sessionId) {
      const existingSession = await researchSessionRepository.findById(
        options.sessionId,
      );
      if (
        !existingSession ||
        existingSession.getUserId().toString() !== userId
      ) {
        throw new AppError("Research session not found", 404);
      }
      session = existingSession;

      if (userMessageContent) {
        const sessionId = session.getId().toString();
        await runInTransaction(async (dbSession) => {
          await researchMessageRepository.createMessage(
            {
              sessionId,
              userId,
              sequence: await researchMessageRepository.getNextSequence(
                sessionId,
                dbSession,
              ),
              role: "user",
              content: userMessageContent,
              executionId: options?.executionId,
            },
            dbSession,
          );

          session.incrementMessageCount();
          if (!isApprovalAction) {
            session.updateStatus("planning");
          }
          await researchSessionRepository.updateSession(session, dbSession);
        });
      }
    } else {
      if (isApprovalAction) {
        throw new AppError(
          "A session ID is required to edit or approve a research plan.",
          400,
        );
      }

      const initialMessage =
        cleanQuery ||
        cleanPastedText ||
        (document ? `Uploaded document: ${document.originalname}` : "");
      const title = initialMessage.slice(0, 80) || "Research session";

      session = await runInTransaction(async (dbSession) => {
        const newSession = await researchSessionRepository.createSession(
          {
            userId,
            title,
            initialQuery: initialMessage || title,
          },
          dbSession,
        );

        if (userMessageContent) {
          const sessionId = newSession.getId().toString();
          await researchMessageRepository.createMessage(
            {
              sessionId,
              userId,
              sequence: await researchMessageRepository.getNextSequence(
                sessionId,
                dbSession,
              ),
              role: "user",
              content: userMessageContent,
              executionId: options?.executionId,
            },
            dbSession,
          );

          newSession.incrementMessageCount();
          newSession.updateStatus("planning");
          await researchSessionRepository.updateSession(newSession, dbSession);
        }

        return newSession;
      });
    }

    const isPlanEdit = options?.action === "edit_plan";
    let execution =
      options?.executionId && !isPlanEdit
        ? await researchExecutionRepository.findByExecutionId(
            options.executionId,
          )
        : null;

    const approvalPlanVersionId =
      session.getPendingPlanVersionId() ?? session.getActivePlanVersionId();
    if (
      !execution &&
      options?.action === "approve_plan" &&
      approvalPlanVersionId
    ) {
      execution = await researchExecutionRepository.findBySessionAndPlanVersion(
        session.getId().toString(),
        approvalPlanVersionId,
      );
    }

    if (execution && execution.sessionId.toString() !== session.getId().toString()) {
      throw new AppError("Research execution does not belong to this session.", 409);
    }

    if (!execution) {
      const generatedExecutionId = options?.executionId ?? randomUUID();
      const requestId =
        options?.requestId ?? generatedExecutionId;
      execution = await researchExecutionRepository.createOrFind({
        executionId: generatedExecutionId,
        requestId,
        sessionId: session.getId().toString(),
      });
    }

    const executionId = execution.executionId;
    let executionResearchPlan = options?.researchPlan || [];

    // if the user uploads a document, store it to minio and get the file path
    if (document) {
      console.log(
        `[ResearchQueryService] Document uploaded: ${document.originalname}, size: ${document.size} bytes`,
      );

      // call the file service to upload the document to minio
      const fileUploadResult = await fileService.uploadDocument(
        userId,
        document,
      );

      console.log(`[ResearchQueryService] File upload result: ${JSON.stringify(
        fileUploadResult,
        null,
        2,
      )}`);

      if (!fileUploadResult.success) {
        await researchExecutionRepository.setExecutionStatus(executionId, "failed", {
          message: fileUploadResult.message,
          occurredAt: new Date(),
        });
        throw new Error(
          `Failed to upload document to MinIO: ${fileUploadResult.message}`,
        );
      }
    }

    if (
      options?.action === "approve_plan" ||
      options?.planApprovalStatus === "approved"
    ) {
      await this.approvePendingPlan(session, userId);
      const activePlanVersionId = session.getActivePlanVersionId();
      if (!activePlanVersionId) {
        throw new AppError("Approved research plan could not be loaded.", 409);
      }
      const activePlanVersion =
        await researchPlanVersionRepository.findById(activePlanVersionId);
      if (!activePlanVersion) {
        throw new AppError("Approved research plan was not found.", 404);
      }
      if (execution.planVersionId?.toString() !== activePlanVersionId) {
        await researchExecutionRepository.setPlanVersion(
          executionId,
          activePlanVersionId,
        );
      }
      executionResearchPlan = activePlanVersion.getSteps().map((step) => ({
        id: step.stepId,
        title: step.title,
        description: step.description,
        dependsOn: step.dependsOn ?? [],
        status: "pending",
      }));
    } else if (
      options?.action === "edit_plan" &&
      executionResearchPlan.length === 0 &&
      session.getPendingPlanVersionId()
    ) {
      const pendingPlan = await researchPlanVersionRepository.findById(
        session.getPendingPlanVersionId()!,
      );
      if (pendingPlan) {
        executionResearchPlan = pendingPlan.getSteps().map((step) => ({
          id: step.stepId,
          title: step.title,
          description: step.description,
          dependsOn: step.dependsOn ?? [],
          status: "pending",
        }));
      }
    }

    await researchExecutionRepository.setExecutionStatus(
      executionId,
      planApprovalStatus === "approved" ? "processing" : "pending",
    );

    const context: ResearchConditionContext = {
      query: cleanQuery,
      pastedText: cleanPastedText,
      pastedTextSizeBytes,
      document,
      conversationHistory,
      planApprovalStatus,
      userPlanEdits,
      researchPlan: executionResearchPlan,
      executionId,
      largeContentThresholdBytes:
        ResearchQueryService.LARGE_CONTENT_THRESHOLD_BYTES,
      formatResponse: async (
        mode,
        responseQuery,
        graphResult,
        approvalStatus,
        extra,
      ) => {
        let planVersionId: string | undefined;

        if (approvalStatus === "approved") {
          const answer = graphResult.finalAnswer?.trim();
          if (!answer) {
            throw new AppError(
              "Research workflow completed without producing an answer.",
              500,
            );
          }
          await researchExecutionRepository.skipPendingEvents(executionId);
          await this.persistAssistantResponse(
            session,
            userId,
            answer,
            executionId,
          );
          planVersionId = session.getActivePlanVersionId() ?? undefined;
        } else {
          const currentExecution =
            await researchExecutionRepository.findByExecutionId(executionId);
          if (currentExecution?.planVersionId) {
            planVersionId = currentExecution.planVersionId.toString();
          } else {
            const objective =
              cleanQuery ||
              cleanPastedText ||
              session.getInitialQuery();
            planVersionId = await this.persistPlanVersion(
              session,
              objective,
              graphResult.researchPlan || [],
              executionId,
              userPlanEdits,
            );
          }
          await researchExecutionRepository.skipPendingEvent(
            executionId,
            approvalStatus === "edit_requested" ? "plannerNode" : "replanNode",
          );
        }

        return {
          ...this.formatResponse(
            mode,
            responseQuery,
            graphResult,
            approvalStatus,
            extra,
          ),
          sessionId: session.getId().toString(),
          planVersionId,
          executionId,
          requestId: execution.requestId,
        };
      },
    };

    try {
      for (const condition of researchConditions) {
        const response = await condition(context);
        if (response !== null) {
          if (planApprovalStatus !== "approved") {
            await researchExecutionRepository.setExecutionStatus(
              executionId,
              "pending",
            );
          }
          return response;
        }
      }
    } catch (error: unknown) {
      if (!(error instanceof AppError && error.statusCode === 409)) {
        await researchExecutionRepository.setExecutionStatus(
          executionId,
          "failed",
          {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : undefined,
            occurredAt: new Date(),
          },
        );
      }
      throw error;
    }

    return {
      message: "Request processed.",
      planApprovalStatus,
      sessionId: session.getId().toString(),
      executionId,
      requestId: execution.requestId,
    };
  }
}

export const researchQueryService = new ResearchQueryService();
