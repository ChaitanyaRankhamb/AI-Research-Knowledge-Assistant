import { ResearchSession, ResearchStatus } from "./researchSession";
import { ResearchSessionId } from "./researchSessionId";

export interface CreateResearchSessionData {
  userId: string;
  title: string;
  generatedName?: string | null;
  customTitle?: string | null;
  initialQuery: string;
  status?: ResearchStatus;
  currentPlanVersion?: number;
  pendingPlanVersionId?: string | null;
  activePlanVersionId?: string | null;
  messageCount?: number;
}

export interface ResearchSessionFilter {
  userId?: string;
  status?: ResearchStatus;
  search?: string;
}

export interface PaginationOptions {
  limit?: number;
  skip?: number;
  page?: number;
  sortOrder?: "asc" | "desc";
}

/**
 * Interface defining operations for the Research Session Repository.
 * Abstracted to support Domain Driven Design and easy swapping or extending of storage layers.
 */
export interface IResearchSessionRepository {
  createSession(data: CreateResearchSessionData): Promise<ResearchSession>;
  updateSession(session: ResearchSession): Promise<ResearchSession>;
  findById(id: string): Promise<ResearchSession | null>;
  findByUserId(
    userId: string,
    filter?: ResearchSessionFilter,
    pagination?: PaginationOptions,
  ): Promise<{ sessions: ResearchSession[]; total: number }>;
  deleteSession(id: string): Promise<boolean>;
  countByUserId(userId: string): Promise<number>;
}
