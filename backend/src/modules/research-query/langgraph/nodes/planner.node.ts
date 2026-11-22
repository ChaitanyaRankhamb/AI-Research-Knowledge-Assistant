import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  type ResearchPlanStep,
  type ResearchStateType,
  GeneratedResearchPlanSchema,
  type GeneratedResearchPlan,
} from "../../research-state";
import { llmService, type LlmService } from "../../llm/llm.service";
import { logWorkflowError } from "../../../../utils/api-error-handler";

export function createFallbackPlan(): ResearchPlanStep[] {
  const tasks = [
    {
      id: "step-1",
      title: "Define the research scope and core concepts",
      description:
        "Identify the primary question, key technical concepts, and research boundaries.",
      dependsOn: [],
    },
    {
      id: "step-2",
      title: "Gather factual evidence and data",
      description:
        "Collect primary facts, experimental evidence, and reported results.",
      dependsOn: [],
    },
    {
      id: "step-3",
      title: "Analyze findings and perspectives",
      description:
        "Evaluate how the evidence relates to the question and compare significant perspectives.",
      dependsOn: ["step-1", "step-2"],
    },
    {
      id: "step-4",
      title: "Assess limitations and implications",
      description:
        "Identify uncertainty, knowledge gaps, caveats, and practical implications.",
      dependsOn: ["step-3"],
    },
  ];

  const now = new Date().toISOString();
  return tasks.map((task) => ({
    ...task,
    status: "pending" as const,
    updatedAt: now,
  }));
}

/**
 * Normalizes raw task objects into strictly-sequenced ResearchPlanStep items
 * with sanitized dependencies and runtime metadata.
 */
export function sanitizePlanTasks(
  rawTasks: Array<{
    id?: string;
    title: string;
    description?: string;
    dependsOn?: string[];
  }>,
): ResearchPlanStep[] {
  const plan: ResearchPlanStep[] = [];
  const validIds = new Set<string>();
  const now = new Date().toISOString();

  for (const [index, item] of rawTasks.entries()) {
    const assignedId = `step-${index + 1}`;
    validIds.add(assignedId);

    const sanitizedDependsOn = (item.dependsOn || []).filter(
      (dep): dep is string =>
        typeof dep === "string" && validIds.has(dep) && dep !== assignedId,
    );

    plan.push({
      id: assignedId,
      title: item.title.trim(),
      description: item.description?.trim() || item.title.trim(),
      dependsOn: sanitizedDependsOn,
      status: "pending",
      updatedAt: now,
    });
  }

  return plan;
}

/**
 * Backward-compatible plan parser for string responses if needed.
 */
export function parsePlan(rawResponse: string): ResearchPlanStep[] | undefined {
  const cleanedJson = rawResponse
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    const parsed: unknown = JSON.parse(cleanedJson);
    if (!Array.isArray(parsed) || parsed.length < 3 || parsed.length > 6) {
      return undefined;
    }
    return sanitizePlanTasks(parsed as Parameters<typeof sanitizePlanTasks>[0]);
  } catch {
    return undefined;
  }
}

export async function plannerNode(
  state: ResearchStateType,
  llm: LlmService = llmService,
): Promise<Partial<ResearchStateType>> {
  console.log(
    `[LangGraph Node: plannerNode] Creating dependency-aware research tasks for "${state.query || "[Document Analysis]"}"...`,
  );

  const systemMessage = new SystemMessage(
    `You are an ace research planner. Decompose the research topic into 4 or 5 substantive research tasks.
Each task will be investigated by an AI analyst using uploaded document context, pasted text, and live web search before a final synthesis.
Independent tasks will be executed in parallel concurrently, while dependent tasks will wait for their prerequisite findings.
If the query involves both an uploaded document and general/external topics (e.g. official language/framework docs or best practices), assign tasks to inspect document specifics and search web documentation in parallel.

Make the tasks substantive, specific, and logically sequenced.
Do not include tasks about database setup, vector indexing, or generating the final answer.`,
  );

  const humanMessage = new HumanMessage(
    `Research topic / question:
${state.query || "Analyze the supplied document."}

Document mode: ${state.documentMode}
Document: ${state.document?.fileName || "none"}

Create the dependency-aware research plan.`,
  );

  let structuredPlan: GeneratedResearchPlan | undefined;
  try {
    structuredPlan = await llm.generateStructured(
      [systemMessage, humanMessage],
      GeneratedResearchPlanSchema,
    );
  } catch (error: unknown) {
    const formatted = logWorkflowError("plannerNode", error, {
      query: state.query,
      documentMode: state.documentMode,
      document: state.document?.fileName,
    });
    console.warn(
      "[LangGraph Node: plannerNode] Structured generation failed, falling back to standard plan:",
      formatted.message,
    );
  }

  let researchPlan: ResearchPlanStep[];
  if (structuredPlan?.tasks && structuredPlan.tasks.length >= 3) {
    researchPlan = sanitizePlanTasks(structuredPlan.tasks);
  } else {
    console.warn(
      "[LangGraph Node: plannerNode] The LLM returned an invalid research plan; using standard fallback.",
    );
    researchPlan = createFallbackPlan();
  }

  console.log(
    `[LangGraph Node: plannerNode] Initialized ${researchPlan.length} research task(s) with dependencies:`,
    researchPlan.map((s) => `${s.id} (dependsOn: [${s.dependsOn.join(", ")}]): ${s.title}`),
  );

  return {
    researchPlan,
    planApprovalStatus: "awaiting_approval",
  };
}
