import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { researchQueryService } from "./research-query.service";
import { failureResponse, successResponse } from "../../utils/api-response";
import { parseApiError } from "../../utils/api-error-handler";
import {
  ChatMessageSchema,
  ResearchPlanStepSchema,
} from "./research-state";
import { z } from "zod";

const parseJsonField = (value: unknown) => {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const UserRequestSchema = z.object({
  conversationHistory: z.preprocess(
    parseJsonField,
    z.array(ChatMessageSchema).optional(),
  ),
  researchPlan: z.preprocess(
    parseJsonField,
    z.array(ResearchPlanStepSchema).optional(),
  ),
  query: z.string().optional(),
  sessionId: z.string().trim().min(1).optional(),
  executionId: z.string().trim().min(1).optional(),
  requestId: z.string().trim().min(1).optional(),
  pastedText: z.string().optional(),
  userPlanEdits: z.string().optional(),
  action: z.enum(["generate_plan", "edit_plan", "approve_plan"]).optional(),
  planApproved: z.boolean().optional(),
});

const validateRequest = (req: Request) => {
  const validatedData = UserRequestSchema.parse(req.body);
  return validatedData;
};

class ResearchQueryController {
  public async handleResearchQuery(
    req: Request,
    res: Response,
  ): Promise<unknown> {
    const userId = req.userId;
    if (!userId) {
      return failureResponse(res, "Unauthorized - User ID missing", 401);
    }
    const validatedData = validateRequest(req);
    const { query, pastedText, userPlanEdits } = validatedData; // extract from validatedData

    const cleanUserEdits = userPlanEdits?.trim();

    // store user action
    const action =
      validatedData.action ??
      (validatedData.planApproved
        ? "approve_plan"
        : cleanUserEdits
          ? "edit_plan"
          : "generate_plan");
    const userPlanEditsValue =
      action === "edit_plan" ? cleanUserEdits : undefined;
    const requestId = validatedData.requestId ?? randomUUID();
    const executionId =
      (action === "edit_plan" ? requestId : validatedData.executionId) ??
      (action === "approve_plan" ? undefined : requestId);

    // call research query service to process request  
    try {
      const result = await researchQueryService.processResearchQuery(
        userId,
        query?.trim(),
        pastedText?.trim(),
        req.file,
        validatedData.conversationHistory,
        {                                  // pass them as optional
          action,
          userPlanEdits: userPlanEditsValue,
          researchPlan: validatedData.researchPlan,
          sessionId: validatedData.sessionId,
          executionId,
          requestId,
        },
      );
      return successResponse(
        res,
        "Research query processed successfully.",
        result,
      );
    } catch (error: unknown) {
      const parsed = parseApiError(error, "ResearchQueryController"); // parsing api related errors

      console.error("\n" + "!".repeat(80));
      console.error(`[ResearchQueryController] FAILED RESEARCH QUERY:`);
      console.error(`Service: ${parsed.service}`);
      console.error(
        `   HTTP Status: ${parsed.statusCode} ${parsed.isRateLimit ? "(RATE LIMIT / QUOTA EXCEEDED)" : ""}`,
      );
      console.error(`Message: ${parsed.message}`);

      if (parsed.details) {
        console.error(
          `Details: `,
          JSON.stringify(parsed.details, null, 2),
        );
      }

      if (error instanceof Error && error.stack) {
        console.error(`   Stack trace:`, error.stack);
      }

      console.error("!".repeat(80) + "\n");

      return failureResponse(res, parsed.message, parsed.statusCode, {
        service: parsed.service,
        node: parsed.node,
        isRateLimit: parsed.isRateLimit,
        statusCode: parsed.statusCode,
        details:
          parsed.details ||
          (error instanceof Error ? error.message : String(error)),
        executionId,
        requestId,
      });
    }
  }
}

export const researchQueryController = new ResearchQueryController();
