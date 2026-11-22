import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { researchSessionNameService } from "./research-session-name.service";
import { failureResponse, successResponse } from "../../utils/api-response";

const requestSchema = z.object({
  sessionId: z.string().trim().min(1),
});

class ResearchSessionNameController {
  public async handleGenerateName(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.userId) {
      failureResponse(res, "Unauthorized - User ID missing", 401);
      return;
    }

    const parsedRequest = requestSchema.safeParse(req.body);
    if (!parsedRequest.success) {
      failureResponse(res, "A valid sessionId is required.", 400);
      return;
    }

    try {
      const generatedName = await researchSessionNameService.generateName(
        req.userId,
        parsedRequest.data.sessionId,
      );
      successResponse(res, "Research session name generated.", {
        generatedName,
      });
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const researchSessionNameController =
  new ResearchSessionNameController();
