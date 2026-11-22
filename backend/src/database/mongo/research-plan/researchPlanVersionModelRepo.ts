import { Types } from "mongoose";
import { ResearchPlanVersion } from "../../../entities/research-plan/researchPlanVersion";
import { ResearchPlanVersionId } from "../../../entities/research-plan/researchPlanVersionId";
import {
  CreateResearchPlanVersionData,
  IResearchPlanVersionRepository,
} from "../../../entities/research-plan/researchPlanRepo";
import { ResearchSessionId } from "../../../entities/research-session/researchSessionId";
import { UserId } from "../../../entities/user/userId";
import { AppError } from "../../../Error/appError";
import {
  IResearchPlanVersion,
  ResearchPlanVersionModel,
} from "./researchPlanVersionModel";

/**
 * Maps a Mongoose ResearchPlanVersion document to a domain ResearchPlanVersion entity.
 */
function docToPlanVersion(doc: IResearchPlanVersion): ResearchPlanVersion {
  return new ResearchPlanVersion(
    new ResearchPlanVersionId(doc._id.toString()),
    new ResearchSessionId(doc.sessionId.toString()),
    doc.version,
    doc.basedOnVersion,
    doc.createdBy,
    doc.status,
    {
      title: doc.plan.title,
      objective: doc.plan.objective,
      steps: (doc.plan.steps || []).map((s) => ({
        stepId: s.stepId,
        title: s.title,
        description: s.description,
      })),
    },
    doc.changeSummary,
    doc.approvedBy ? new UserId(doc.approvedBy.toString()) : null,
    doc.approvedAt,
    doc.createdAt,
    doc.updatedAt,
  );
}

/**
 * MongoDB Mongoose implementation of the ResearchPlanVersion repository.
 */
export class MongoResearchPlanVersionRepository
  implements IResearchPlanVersionRepository
{
  /**
   * Persists a new version of the research plan.
   */
  async createPlanVersion(
    data: CreateResearchPlanVersionData,
  ): Promise<ResearchPlanVersion> {
    const doc = await ResearchPlanVersionModel.create({
      sessionId: new Types.ObjectId(data.sessionId),
      version: data.version,
      basedOnVersion: data.basedOnVersion ?? null,
      createdBy: data.createdBy,
      status: data.status ?? "draft",
      plan: {
        title: data.plan.title,
        objective: data.plan.objective,
        steps: data.plan.steps.map((step) => ({
          stepId: step.stepId,
          title: step.title,
          description: step.description,
        })),
      },
      changeSummary: data.changeSummary ?? null,
      approvedBy: data.approvedBy
        ? new Types.ObjectId(data.approvedBy)
        : null,
      approvedAt: data.approvedAt ?? null,
    });

    return docToPlanVersion(doc);
  }

  /**
   * Updates an existing plan version (e.g., approval, superseding, step modifications).
   */
  async updatePlanVersion(
    planVersion: ResearchPlanVersion,
  ): Promise<ResearchPlanVersion> {
    const doc = await ResearchPlanVersionModel.findByIdAndUpdate(
      planVersion.id.toString(),
      {
        status: planVersion.getStatus(),
        plan: {
          title: planVersion.getPlan().title,
          objective: planVersion.getPlan().objective,
          steps: planVersion.getSteps().map((s) => ({
            stepId: s.stepId,
            title: s.title,
            description: s.description,
          })),
        },
        changeSummary: planVersion.getChangeSummary() ?? null,
        approvedBy: planVersion.getApprovedBy()
          ? new Types.ObjectId(planVersion.getApprovedBy()!.toString())
          : null,
        approvedAt: planVersion.getApprovedAt() ?? null,
      },
      { new: true },
    );

    if (!doc) {
      throw new AppError("Research plan version not found", 404);
    }

    return docToPlanVersion(doc);
  }

  /**
   * Finds a plan version by its unique database ID.
   */
  async findById(id: string): Promise<ResearchPlanVersion | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    const doc = await ResearchPlanVersionModel.findById(id);
    return doc ? docToPlanVersion(doc) : null;
  }

  /**
   * Finds a specific version of a plan in a session.
   */
  async findBySessionIdAndVersion(
    sessionId: string,
    version: number,
  ): Promise<ResearchPlanVersion | null> {
    if (!Types.ObjectId.isValid(sessionId)) return null;

    const doc = await ResearchPlanVersionModel.findOne({
      sessionId: new Types.ObjectId(sessionId),
      version,
    });

    return doc ? docToPlanVersion(doc) : null;
  }

  /**
   * Finds the latest created plan version for a session.
   */
  async findLatestBySessionId(
    sessionId: string,
  ): Promise<ResearchPlanVersion | null> {
    if (!Types.ObjectId.isValid(sessionId)) return null;

    const doc = await ResearchPlanVersionModel.findOne({
      sessionId: new Types.ObjectId(sessionId),
    }).sort({ version: -1 });

    return doc ? docToPlanVersion(doc) : null;
  }

  /**
   * Returns all plan versions belonging to a research session ordered by version ascending.
   */
  async findAllBySessionId(
    sessionId: string,
  ): Promise<ResearchPlanVersion[]> {
    if (!Types.ObjectId.isValid(sessionId)) return [];

    const docs = await ResearchPlanVersionModel.find({
      sessionId: new Types.ObjectId(sessionId),
    }).sort({ version: 1 });

    return docs.map(docToPlanVersion);
  }

  /**
   * Deletes all plan versions for a session (used during session cascade delete).
   */
  async deleteBySessionId(sessionId: string): Promise<number> {
    if (!Types.ObjectId.isValid(sessionId)) return 0;

    const result = await ResearchPlanVersionModel.deleteMany({
      sessionId: new Types.ObjectId(sessionId),
    });

    return result.deletedCount;
  }
}

export const researchPlanVersionRepository =
  new MongoResearchPlanVersionRepository();
