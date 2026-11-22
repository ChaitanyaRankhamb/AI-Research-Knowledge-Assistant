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
  createPlanVersion(data: CreateResearchPlanVersionData): Promise<ResearchPlanVersion>;
  updatePlanVersion(planVersion: ResearchPlanVersion): Promise<ResearchPlanVersion>;
  findById(id: string): Promise<ResearchPlanVersion | null>;
  findBySessionIdAndVersion(
    sessionId: string,
    version: number,
  ): Promise<ResearchPlanVersion | null>;
  findLatestBySessionId(sessionId: string): Promise<ResearchPlanVersion | null>;
  findAllBySessionId(sessionId: string): Promise<ResearchPlanVersion[]>;
  deleteBySessionId(sessionId: string): Promise<number>;
}
