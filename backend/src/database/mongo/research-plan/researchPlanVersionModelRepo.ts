import { ClientSession, Types } from "mongoose";
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
        dependsOn: s.dependsOn ?? [],
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
    session?: unknown,
  ): Promise<ResearchPlanVersion> {
    const clientSession = session as ClientSession | undefined;
    const doc = new ResearchPlanVersionModel({
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
          dependsOn: step.dependsOn ?? [],
        })),
      },
      changeSummary: data.changeSummary ?? null,
      approvedBy: data.approvedBy
        ? new Types.ObjectId(data.approvedBy)
        : null,
      approvedAt: data.approvedAt ?? null,
    });

    await doc.save({ session: clientSession });
    return docToPlanVersion(doc);
  }

  /**
   * Updates an existing plan version (e.g., approval, superseding, step modifications).
   */
  async updatePlanVersion(
    planVersion: ResearchPlanVersion,
    session?: unknown,
  ): Promise<ResearchPlanVersion> {
    const clientSession = session as ClientSession | undefined;
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
            dependsOn: s.dependsOn ?? [],
          })),
        },
        changeSummary: planVersion.getChangeSummary() ?? null,
        approvedBy: planVersion.getApprovedBy()
          ? new Types.ObjectId(planVersion.getApprovedBy()!.toString())
          : null,
        approvedAt: planVersion.getApprovedAt() ?? null,
      },
      { new: true, session: clientSession },
    );

    if (!doc) {
      throw new AppError("Research plan version not found", 404);
    }

    return docToPlanVersion(doc);
  }

  /**
   * Finds a plan version by its unique database ID.
   */
  async findById(
    id: string,
    session?: unknown,
  ): Promise<ResearchPlanVersion | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    const clientSession = session as ClientSession | undefined;
    const doc = await ResearchPlanVersionModel.findById(id).session(
      clientSession ?? null,
    );
    return doc ? docToPlanVersion(doc) : null;
  }

  /**
   * Finds a specific version of a plan in a session.
   */
  async findBySessionIdAndVersion(
    sessionId: string,
    version: number,
    session?: unknown,
  ): Promise<ResearchPlanVersion | null> {
    if (!Types.ObjectId.isValid(sessionId)) return null;

    const clientSession = session as ClientSession | undefined;
    const doc = await ResearchPlanVersionModel.findOne({
      sessionId: new Types.ObjectId(sessionId),
      version,
    }).session(clientSession ?? null);

    return doc ? docToPlanVersion(doc) : null;
  }

  /**
   * Finds the latest created plan version for a session.
   */
  async findLatestBySessionId(
    sessionId: string,
    session?: unknown,
  ): Promise<ResearchPlanVersion | null> {
    if (!Types.ObjectId.isValid(sessionId)) return null;

    const clientSession = session as ClientSession | undefined;
    const doc = await ResearchPlanVersionModel.findOne({
      sessionId: new Types.ObjectId(sessionId),
    })
      .sort({ version: -1 })
      .session(clientSession ?? null);

    return doc ? docToPlanVersion(doc) : null;
  }

  /**
   * Returns all plan versions belonging to a research session ordered by version ascending.
   */
  async findAllBySessionId(
    sessionId: string,
    session?: unknown,
  ): Promise<ResearchPlanVersion[]> {
    if (!Types.ObjectId.isValid(sessionId)) return [];

    const clientSession = session as ClientSession | undefined;
    const docs = await ResearchPlanVersionModel.find({
      sessionId: new Types.ObjectId(sessionId),
    })
      .sort({ version: 1 })
      .session(clientSession ?? null);

    return docs.map(docToPlanVersion);
  }

  /**
   * Deletes all plan versions for a session (used during session cascade delete).
   */
  async deleteBySessionId(
    sessionId: string,
    session?: unknown,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(sessionId)) return 0;

    const clientSession = session as ClientSession | undefined;
    const result = await ResearchPlanVersionModel.deleteMany(
      {
        sessionId: new Types.ObjectId(sessionId),
      },
      { session: clientSession },
    );

    return result.deletedCount;
  }
}

export const researchPlanVersionRepository =
  new MongoResearchPlanVersionRepository();
