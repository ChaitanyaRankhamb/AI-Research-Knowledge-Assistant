import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { failureResponse, successResponse } from "../../utils/api-response";
import { researchSessionService } from "./research-session.service";

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(100).optional(),
});

const renameBodySchema = z.object({
  title: z.string().trim().min(1).max(80),
});

class ResearchSessionController {
  public async list(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.userId) {
      failureResponse(res, "Unauthorized - User ID missing", 401);
      return;
    }

    const parsedQuery = listQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      failureResponse(res, "Invalid session list query.", 400, parsedQuery.error.flatten());
      return;
    }

    try {
      const result = await researchSessionService.listSessions(
        req.userId,
        parsedQuery.data,
      );
      successResponse(res, "Research sessions loaded.", result);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async get(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.userId) {
      failureResponse(res, "Unauthorized - User ID missing", 401);
      return;
    }

    try {
      const result = await researchSessionService.getSession(
        req.userId,
        req.params.sessionId.toString(),
      );
      successResponse(res, "Research session loaded.", result);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async rename(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.userId) {
      failureResponse(res, "Unauthorized - User ID missing", 401);
      return;
    }

    const parsedBody = renameBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      failureResponse(res, "A session title between 1 and 80 characters is required.", 400);
      return;
    }

    try {
      const result = await researchSessionService.renameSession(
        req.userId,
        req.params.sessionId.toString(),
        parsedBody.data.title,
      );
      successResponse(res, "Research session renamed.", result);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async delete(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.userId) {
      failureResponse(res, "Unauthorized - User ID missing", 401);
      return;
    }

    try {
      await researchSessionService.deleteSession(
        req.userId,
        req.params.sessionId.toString(),
      );
      successResponse(res, "Research session deleted.", {
        id: req.params.sessionId.toString(),
      });
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const researchSessionController = new ResearchSessionController();
