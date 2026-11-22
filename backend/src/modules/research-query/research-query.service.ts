import { DocumentLoader } from "./langchain/document-loader";
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
    changeSummary?: string,
  ): Promise<string> {
    if (steps.length === 0) {
      throw new AppError("Research workflow returned an empty plan.", 500);
    }

    const sessionId = session.getId().toString();
    const previousPendingPlanId = session.getPendingPlanVersionId();
    let previousPendingPlan: ResearchPlanVersion | null = null;

    if (previousPendingPlanId) {
      previousPendingPlan =
        await researchPlanVersionRepository.findById(previousPendingPlanId);
      if (
        !previousPendingPlan ||
        previousPendingPlan.getSessionId().toString() !== sessionId
      ) {
        throw new AppError("Pending research plan was not found.", 409);
      }
    }

    const version = session.getCurrentPlanVersion() + 1;
    const planVersion = await researchPlanVersionRepository.createPlanVersion({
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
        })),
      },
      changeSummary: changeSummary || null,
    });

    if (
      previousPendingPlan &&
      previousPendingPlan.getStatus() !== "approved" &&
      previousPendingPlan.getStatus() !== "superseded"
    ) {
      previousPendingPlan.supersede();
      await researchPlanVersionRepository.updatePlanVersion(
        previousPendingPlan,
      );
    }

    session.setPendingPlan(planVersion.getId().toString(), version);
    const planVersionId = planVersion.getId().toString();
    await researchMessageRepository.createMessage({
      sessionId,
      userId: session.getUserId().toString(),
      sequence: await researchMessageRepository.getNextSequence(sessionId),
      role: "assistant",
      content: "I have prepared a research plan for your review.",
      planVersionId,
    });
    session.incrementMessageCount();
    await researchSessionRepository.updateSession(session);

    return planVersionId;
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
      throw new AppError(
        "No pending research plan is available to approve.",
        409,
      );
    }

    const pendingPlan =
      await researchPlanVersionRepository.findById(pendingPlanId);
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
    await researchPlanVersionRepository.updatePlanVersion(pendingPlan);

    session.approvePlan(pendingPlanId);
    await researchSessionRepository.updateSession(session);
  }

  /**
   * Persists the generated assistant response and marks the session complete.
   */
  private async persistAssistantResponse(
    session: ResearchSession,
    userId: string,
    answer: string,
  ): Promise<void> {
    const sessionId = session.getId().toString();
    await researchMessageRepository.createMessage({
      sessionId,
      userId,
      sequence: await researchMessageRepository.getNextSequence(sessionId),
      role: "assistant",
      content: answer,
    });

    session.incrementMessageCount();
    session.completeSession();
    await researchSessionRepository.updateSession(session);
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

    //
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

    // log conversation history
    console.log(
      `conversation history: ${JSON.stringify(
        conversationHistory.map((obj) => ({
          role: obj.role,
          content: obj.content,
        })),
        null,
        2,
      )}`,
    );

    if (
      !cleanQuery &&
      !document &&
      !cleanPastedText &&
      !options?.researchPlan?.length
    ) {
      console.log("Condition: Invalid request - No input provided.");
      throw new Error(
        "Please provide a search query, a document, or pasted text.",
      );
    }

    const isApprovalAction =
      options?.action === "approve_plan" || options?.action === "edit_plan";
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

      session = await researchSessionRepository.createSession({
        userId,
        title,
        initialQuery: initialMessage || title,
      });
    }

    const userMessageContent =
      options?.action === "approve_plan"
        ? undefined
        : options?.action === "edit_plan"
          ? userPlanEdits
          : cleanQuery ||
            cleanPastedText ||
            (document ? `Uploaded document: ${document.originalname}` : undefined);

    if (userMessageContent) {
      const sessionId = session.getId().toString();
      await researchMessageRepository.createMessage({
        sessionId,
        userId,
        sequence: await researchMessageRepository.getNextSequence(sessionId),
        role: "user",
        content: userMessageContent,
      });

      session.incrementMessageCount();
      if (!isApprovalAction) {
        session.updateStatus("planning");
      }
      await researchSessionRepository.updateSession(session);
    }

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
    }

    const context: ResearchConditionContext = {
      query: cleanQuery,
      pastedText: cleanPastedText,
      pastedTextSizeBytes,
      document,
      conversationHistory,
      planApprovalStatus,
      userPlanEdits,
      researchPlan: options?.researchPlan || [],
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
          await this.persistAssistantResponse(session, userId, answer);
          planVersionId = session.getActivePlanVersionId() ?? undefined;
        } else {
          const objective =
            cleanQuery ||
            cleanPastedText ||
            session.getInitialQuery();
          planVersionId = await this.persistPlanVersion(
            session,
            objective,
            graphResult.researchPlan || [],
            userPlanEdits,
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
        };
      },
    };

    for (const condition of researchConditions) {
      const response = await condition(context);
      if (response !== null) return response;
    }

    return {
      message: "Request processed.",
      planApprovalStatus,
      sessionId: session.getId().toString(),
    };
  }
}

export const researchQueryService = new ResearchQueryService();
