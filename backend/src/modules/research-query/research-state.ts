import { Annotation, StateSchema } from "@langchain/langgraph";
import * as z from "zod";

export const StepStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const ResearchPlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  dependsOn: z.array(z.string()).default([]), // Step IDs that must complete before this step runs
  status: StepStatusSchema.default("pending"),
  outputSnippet: z.string().optional(),
  result: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type ResearchPlanStep = z.infer<typeof ResearchPlanStepSchema>;

/**
 * Structured output schema for LLM research plan decomposition.
 * Used dynamically by plannerNode and replanNode via llmService.generateStructured().
 */
export const GeneratedResearchPlanSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string().describe("Step ID, e.g. 'step-1', 'step-2'"),
        title: z.string().describe("Clear, concise title for this research task"),
        description: z
          .string()
          .describe("One sentence explaining the objective of this task"),
        dependsOn: z
          .array(z.string())
          .default([])
          .describe(
            "Prerequisite step IDs that must complete first. Use [] for independent tasks.",
          ),
      }),
    )
    .min(3)
    .max(6)
    .describe("Ordered list of 3 to 6 dependency-aware research tasks"),
});
export type GeneratedResearchPlan = z.infer<typeof GeneratedResearchPlanSchema>;

export const SearchResultItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  score: z.number().optional(),
});
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const PlanApprovalStatusSchema = z.enum([
  "awaiting_approval",
  "edit_requested",
  "approved",
]);
export type PlanApprovalStatus = z.infer<typeof PlanApprovalStatusSchema>;

/**
 * Utility helper to update plan steps immutably by step ID.
 */
export function updatePlanSteps(
  existingPlan: ResearchPlanStep[] = [],
  updates: (Partial<ResearchPlanStep> & { id: string })[],
): ResearchPlanStep[] {
  const stepMap = new Map((existingPlan || []).map((step) => [step.id, { ...step }]));
  const now = new Date().toISOString();

  for (const update of updates) {
    const current = stepMap.get(update.id);
    if (current) {
      stepMap.set(update.id, {
        ...current,
        ...update,
        dependsOn: update.dependsOn ?? current.dependsOn ?? [],
        updatedAt: now,
      });
    } else {
      stepMap.set(update.id, {
        id: update.id,
        title: update.title || `Task ${update.id}`,
        description: update.description,
        dependsOn: update.dependsOn || [],
        status: update.status || "pending",
        outputSnippet: update.outputSnippet,
        result: update.result,
        updatedAt: now,
      });
    }
  }

  return Array.from(stepMap.values());
}

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

const DocumentSchema = z.object({
  documentId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().nonnegative(),
  storagePath: z.string().optional(),
  content: z.string().optional(),
});

// define state scheme and store it into ResearchState
export const ResearchState = Annotation.Root({
  // Required for every request
  query: Annotation<string>(),

  // Optional uploaded document
  document: Annotation<z.infer<typeof DocumentSchema> | null>(),

  documentMode: Annotation<"none" | "direct" | "ingest">(),

  ingestionStatus: Annotation<
    "not_required" | "pending" | "completed" | "failed"
  >(),

  vectorStoreRef: Annotation<string | undefined>(),

  // Human-in-the-Loop
  planApprovalStatus: Annotation<PlanApprovalStatus>(),
  userPlanEdits: Annotation<string | undefined>(),
  planIterationCount: Annotation<number>(),

  // Research workflow
  conversationHistory: Annotation<ChatMessage[]>(),
  researchPlan: Annotation<ResearchPlanStep[]>(),
  searchResults: Annotation<SearchResultItem[]>(),
  retrievedChunks: Annotation<string[]>(),
  finalAnswer: Annotation<string>(),
});

export type ResearchStateType = typeof ResearchState.State;