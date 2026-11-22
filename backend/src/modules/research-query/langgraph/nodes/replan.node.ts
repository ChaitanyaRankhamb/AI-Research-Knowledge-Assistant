import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  type ResearchPlanStep,
  type ResearchStateType,
  GeneratedResearchPlanSchema,
  type GeneratedResearchPlan,
} from "../../research-state";
import { llmService, type LlmService } from "../../llm/llm.service";
import { sanitizePlanTasks } from "./planner.node.js";
import { logWorkflowError } from "../../../../utils/api-error-handler";

export async function replanNode(
  state: ResearchStateType,
  llm: LlmService = llmService,
): Promise<Partial<ResearchStateType>> {
  const currentPlan = state.researchPlan || [];
  const userEdits = state.userPlanEdits?.trim() || "Please refine the plan.";

  console.log(
    `[LangGraph Node: replanNode] Remaking plan based on user feedback: "${userEdits}" (iteration ${state.planIterationCount || 1})...`,
  );

  const formattedExistingPlan = currentPlan
    .map(
      (s) =>
        `- ${s.id}: ${s.title} (Objective: ${s.description || "N/A"}, DependsOn: [${(s.dependsOn || []).join(", ")}])`,
    )
    .join("\n");

  const systemMessage = new SystemMessage(
    `You are an expert research planner. The user has reviewed your research plan and provided feedback/edits.
Your task is to revise, remake, or adjust the research plan according to the user's requests while maintaining clear, logically ordered tasks and dependency relationships ("dependsOn").

Rules:
1. Incorporate the user's requested additions, removals, or focus changes faithfully.
2. Provide 3 to 6 task objects with id, title, description, and dependsOn.
3. Independent tasks should have dependsOn: [] so they can run concurrently in parallel.`,
  );

  const humanMessage = new HumanMessage(
    `Research topic:
${state.query || "Analyze the supplied document."}

Current Research Plan:
${formattedExistingPlan || "No previous plan"}

User Feedback & Requested Edits:
"${userEdits}"

Generate the revised, dependency-aware research plan.`,
  );

  let structuredPlan: GeneratedResearchPlan | undefined;
  try {
    structuredPlan = await llm.generateStructured(
      [systemMessage, humanMessage],
      GeneratedResearchPlanSchema,
    );
  } catch (error: unknown) {
    const formatted = logWorkflowError("replanNode", error, {
      query: state.query,
      userEdits,
      currentPlanLength: currentPlan.length,
      iterationCount: state.planIterationCount,
    });
    console.warn(
      "[LangGraph Node: replanNode] Structured replan failed, falling back to existing plan:",
      formatted.message,
    );
  }

  const finalPlan: ResearchPlanStep[] =
    structuredPlan?.tasks && structuredPlan.tasks.length >= 3
      ? sanitizePlanTasks(structuredPlan.tasks)
      : currentPlan.map((step) => ({
          ...step,
          status: "pending" as const,
          updatedAt: new Date().toISOString(),
        }));

  console.log(
    `[LangGraph Node: replanNode] Successfully remade ${finalPlan.length} research task(s):`,
    finalPlan.map((s) => `${s.id} (dependsOn: [${(s.dependsOn || []).join(", ")}]): ${s.title}`),
  );

  return {
    researchPlan: finalPlan,
    planApprovalStatus: "awaiting_approval",
    userPlanEdits: undefined, // Clear edits once processed
    planIterationCount: (state.planIterationCount || 1) + 1,
  };
}
