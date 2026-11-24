import type {
  ChatMessage,
  PlanApprovalStatus,
  ResearchPlanStep,
  ResearchStateType,
} from "../research-state";

export interface ResearchConditionContext {
  query: string | undefined;
  pastedText: string | undefined;
  pastedTextSizeBytes: number;
  document: Express.Multer.File | undefined;
  conversationHistory: ChatMessage[];
  planApprovalStatus: PlanApprovalStatus;
  userPlanEdits: string | undefined;
  researchPlan: ResearchPlanStep[];
  executionId?: string;
  largeContentThresholdBytes: number;
  formatResponse: (
    mode: string,
    query: string | null,
    graphResult: ResearchStateType,
    planApprovalStatus: PlanApprovalStatus,
    extra?: Record<string, unknown>,
  ) => unknown;
}

export type ResearchConditionHandler = (
  context: ResearchConditionContext,
) => Promise<unknown | null>;
