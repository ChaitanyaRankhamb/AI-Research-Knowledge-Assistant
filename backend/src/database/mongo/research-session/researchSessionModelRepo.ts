import { Types } from "mongoose";
import { ResearchSession } from "../../../entities/research-session/researchSession";
import { ResearchSessionId } from "../../../entities/research-session/researchSessionId";
import {
  CreateResearchSessionData,
  IResearchSessionRepository,
  PaginationOptions,
  ResearchSessionFilter,
} from "../../../entities/research-session/researchSessionRepo";
import { UserId } from "../../../entities/user/userId";
import { AppError } from "../../../Error/appError";
import {
  IResearchSession,
  ResearchSessionModel,
} from "./researchSessionModel";

/**
 * Maps a Mongoose ResearchSession document to a pure domain ResearchSession entity.
 */
function docToSession(doc: IResearchSession): ResearchSession {
  return new ResearchSession(
    new ResearchSessionId(doc._id.toString()),
    new UserId(doc.userId.toString()),
    doc.title,
    doc.initialQuery,
    doc.status,
    doc.currentPlanVersion,
    doc.pendingPlanVersionId ? doc.pendingPlanVersionId.toString() : null,
    doc.activePlanVersionId ? doc.activePlanVersionId.toString() : null,
    doc.messageCount,
    doc.completedAt,
    doc.createdAt,
    doc.updatedAt,
    doc.generatedName ?? null,
    doc.customTitle ?? null,
  );
}

/**
 * MongoDB Mongoose implementation of the ResearchSession repository.
 * Supports CRUD, pagination, and user-filtered retrieval for ChatGPT-style history.
 */
export class MongoResearchSessionRepository
  implements IResearchSessionRepository
{
  /**
   * Creates a new Research Session document in MongoDB.
   */
  async createSession(
    data: CreateResearchSessionData,
  ): Promise<ResearchSession> {
    const doc = await ResearchSessionModel.create({
      userId: new Types.ObjectId(data.userId),
      title: data.title,
      generatedName: data.generatedName ?? null,
      customTitle: data.customTitle ?? null,
      initialQuery: data.initialQuery,
      status: data.status ?? "planning",
      currentPlanVersion: data.currentPlanVersion ?? 0,
      pendingPlanVersionId: data.pendingPlanVersionId
        ? new Types.ObjectId(data.pendingPlanVersionId)
        : null,
      activePlanVersionId: data.activePlanVersionId
        ? new Types.ObjectId(data.activePlanVersionId)
        : null,
      messageCount: data.messageCount ?? 0,
    });

    return docToSession(doc);
  }

  /**
   * Persists changes to an existing Research Session domain entity.
   */
  async updateSession(session: ResearchSession): Promise<ResearchSession> {
    const doc = await ResearchSessionModel.findByIdAndUpdate(
      session.id.toString(),
      {
        title: session.getTitle(),
        generatedName: session.getGeneratedName(),
        customTitle: session.getCustomTitle(),
        status: session.getStatus(),
        currentPlanVersion: session.getCurrentPlanVersion(),
        pendingPlanVersionId: session.getPendingPlanVersionId()
          ? new Types.ObjectId(session.getPendingPlanVersionId()!)
          : null,
        activePlanVersionId: session.getActivePlanVersionId()
          ? new Types.ObjectId(session.getActivePlanVersionId()!)
          : null,
        messageCount: session.getMessageCount(),
        completedAt: session.getCompletedAt() ?? null,
      },
      { new: true },
    );

    if (!doc) {
      throw new AppError("Research session not found", 404);
    }

    return docToSession(doc);
  }

  /**
   * Finds a research session by ID.
   */
  async findById(id: string): Promise<ResearchSession | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    const doc = await ResearchSessionModel.findById(id);
    return doc ? docToSession(doc) : null;
  }

  /**
   * Queries sessions belonging to a specific user with filtering and pagination.
   * Useful for ChatGPT-style chat history listing.
   */
  async findByUserId(
    userId: string,
    filter?: ResearchSessionFilter,
    pagination?: PaginationOptions,
  ): Promise<{ sessions: ResearchSession[]; total: number }> {
    const query: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };

    if (filter?.status) {
      query.status = filter.status;
    }

    if (filter?.search) {
      const escapedSearch = filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { title: { $regex: escapedSearch, $options: "i" } },
        { customTitle: { $regex: escapedSearch, $options: "i" } },
        { generatedName: { $regex: escapedSearch, $options: "i" } },
        { initialQuery: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    const limit = pagination?.limit ?? 50;
    const skip =
      pagination?.skip ??
      (pagination?.page ? (pagination.page - 1) * limit : 0);
    const sortOrder = pagination?.sortOrder === "asc" ? 1 : -1;

    const [docs, total] = await Promise.all([
      ResearchSessionModel.find(query)
        .sort({ updatedAt: sortOrder })
        .skip(skip)
        .limit(limit),
      ResearchSessionModel.countDocuments(query),
    ]);

    return {
      sessions: docs.map(docToSession),
      total,
    };
  }

  /**
   * Deletes a research session by ID.
   */
  async deleteSession(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;

    const result = await ResearchSessionModel.findByIdAndDelete(id);
    return Boolean(result);
  }

  /**
   * Counts the total number of sessions for a user.
   */
  async countByUserId(userId: string): Promise<number> {
    return ResearchSessionModel.countDocuments({
      userId: new Types.ObjectId(userId),
    });
  }
}

export const researchSessionRepository = new MongoResearchSessionRepository();
