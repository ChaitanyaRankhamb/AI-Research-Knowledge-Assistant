import { Types } from "mongoose";

export const RESEARCH_EXECUTION_EVENT_NAMES = [
  "plannerNode",
  "replanNode",
  "retrievalNode",
  "executeConcurrentResearchStepsNode",
  "generateAnswerNode",
] as const;

export type ResearchExecutionEventName =
  (typeof RESEARCH_EXECUTION_EVENT_NAMES)[number];

export type ResearchExecutionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";

export interface ResearchExecutionError {
  message: string;
  name?: string;
  service?: string;
  statusCode?: number;
  occurredAt: Date;
}

export interface ResearchExecutionSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface ResearchExecutionStepData {
  id: string;
  title: string;
  description?: string;
  dependsOn?: string[];
  status?: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
  outputSnippet?: string;
}

export interface RecoverableResearchPlanStep
  extends Omit<ResearchExecutionStepData, "dependsOn"> {
  dependsOn: string[];
  status: "pending" | "in_progress" | "completed" | "failed";
}

export interface ResearchExecutionStep {
  stepId: string;
  title: string;
  description?: string;
  dependsOn: string[];
  status: ResearchExecutionStatus;
  attemptCount: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  result?: string;
  outputSnippet?: string;
  searchResults: ResearchExecutionSearchResult[];
  error?: ResearchExecutionError | null;
  idempotencyKey: string;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  heartbeatAt?: Date | null;
}

export interface ResearchExecutionEvent {
  eventId: ResearchExecutionEventName;
  name: ResearchExecutionEventName;
  status: ResearchExecutionStatus;
  attemptCount: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  result?: Record<string, unknown> | null;
  error?: ResearchExecutionError | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  heartbeatAt?: Date | null;
  steps: ResearchExecutionStep[];
}

export interface ResearchExecution {
  executionId: string;
  requestId: string;
  sessionId: Types.ObjectId;
  planVersionId: Types.ObjectId | null;
  status: ResearchExecutionStatus;
  error?: ResearchExecutionError | null;
  events: ResearchExecutionEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export function createInitialResearchExecutionEvents(): ResearchExecutionEvent[] {
  return RESEARCH_EXECUTION_EVENT_NAMES.map((name) => ({
    eventId: name,
    name,
    status: "pending",
    attemptCount: 0,
    result: null,
    error: null,
    steps: [],
  }));
}

export function toResearchExecutionError(
  error: unknown,
): ResearchExecutionError {
  const errorValue =
    error instanceof Error ? error : new Error(String(error));
  const details =
    typeof error === "object" && error !== null
      ? (error as {
          service?: unknown;
          statusCode?: unknown;
        })
      : undefined;

  return {
    message: errorValue.message,
    name: errorValue.name,
    service:
      typeof details?.service === "string" ? details.service : undefined,
    statusCode:
      typeof details?.statusCode === "number"
        ? details.statusCode
        : undefined,
    occurredAt: new Date(),
  };
}

export function restoreResearchPlanSteps(
  plan: ResearchExecutionStepData[],
  persistedSteps: ResearchExecutionStep[],
  now = Date.now(),
): RecoverableResearchPlanStep[] {
  const persistedById = new Map(
    persistedSteps.map((step) => [step.stepId, step]),
  );

  return plan.map((step) => {
    const persisted = persistedById.get(step.id);
    if (!persisted) {
      return { ...step, dependsOn: step.dependsOn ?? [], status: "pending" };
    }

    if (
      persisted.status === "processing" &&
      persisted.leaseExpiresAt &&
      persisted.leaseExpiresAt.getTime() > now
    ) {
      throw new Error(
        `Research step "${step.id}" is already claimed by another active execution.`,
      );
    }

    if (persisted.status === "completed") {
      return {
        ...step,
        dependsOn: step.dependsOn ?? [],
        status: "completed",
        result: persisted.result,
        outputSnippet: persisted.outputSnippet,
      };
    }

    return {
      ...step,
      dependsOn: step.dependsOn ?? [],
      status: "pending",
      result: undefined,
      outputSnippet: undefined,
    };
  });
}
