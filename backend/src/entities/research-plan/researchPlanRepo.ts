import {
  IResearchPlanStep,
  PlanCreatedBy,
  PlanStatus,
  ResearchPlanVersion,
} from "./researchPlanVersion";

export interface CreateResearchPlanVersionData {
  sessionId: string;
  version: number;
  basedOnVersion?: number | null;
  createdBy: PlanCreatedBy;
  status?: PlanStatus;
  plan: {
    title: string;
    objective: string;
    steps: IResearchPlanStep[];
  };
  changeSummary?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
}

/**
 * Interface defining operations for the Research Plan Version Repository.
 */
export interface IResearchPlanVersionRepository {
  createPlanVersion(
    data: CreateResearchPlanVersionData,
    session?: unknown,
  ): Promise<ResearchPlanVersion>;
  updatePlanVersion(
    planVersion: ResearchPlanVersion,
    session?: unknown,
  ): Promise<ResearchPlanVersion>;
  findById(id: string, session?: unknown): Promise<ResearchPlanVersion | null>;
  findBySessionIdAndVersion(
    sessionId: string,
    version: number,
    session?: unknown,
  ): Promise<ResearchPlanVersion | null>;
  findLatestBySessionId(
    sessionId: string,
    session?: unknown,
  ): Promise<ResearchPlanVersion | null>;
  findAllBySessionId(
    sessionId: string,
    session?: unknown,
  ): Promise<ResearchPlanVersion[]>;
  deleteBySessionId(sessionId: string, session?: unknown): Promise<number>;
}
