import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  type ResearchPlanStep,
  type ResearchStateType,
  type SearchResultItem,
  updatePlanSteps,
} from "../../research-state";
import { llmService, type LlmService } from "../../llm/llm.service";
import { tavilySearchService } from "../../search/tavily-search.service";
import { logWorkflowError, WorkflowError } from "../../../../utils/api-error-handler";

/**
 * Formats findings only from the prerequisite tasks that the current task depends on,
 * or all completed tasks if no explicit dependency is declared.
 */
function formatRelevantFindings(
  step: ResearchPlanStep,
  allSteps: ResearchPlanStep[],
): string {
  const targetIds =
    step.dependsOn && step.dependsOn.length > 0
      ? new Set(step.dependsOn)
      : new Set(allSteps.filter((s) => s.id !== step.id).map((s) => s.id));

  return allSteps
    .filter((s) => s.status === "completed" && s.result && targetIds.has(s.id))
    .map(
      (s) =>
        `### ${s.title} (${s.id})\nTask Objective: ${s.description || "Not specified"}\nFindings:\n${s.result}`,
    )
    .join("\n\n");
}

/**
 * Executes a single research task using the LLM with direct/retrieved evidence, live web search, and prerequisite findings.
 */
async function executeSingleTask(
  step: ResearchPlanStep,
  currentPlan: ResearchPlanStep[],
  state: ResearchStateType,
  llm: LlmService,
): Promise<{
  id: string;
  result: string;
  outputSnippet: string;
  searchResults: SearchResultItem[];
}> {
  console.log(
    `[LangGraph Node: executeConcurrentResearchStepsNode] Researching task "${step.title}" (${step.id}) [dependsOn: [${(step.dependsOn || []).join(", ")}]]...`,
  );

  // Perform targeted web search for documentation, current developments, or external knowledge
  const searchQuery = `${state.query || ""} ${step.title}`.trim();
  let webResults: SearchResultItem[] = [];
  try {
    webResults = await tavilySearchService.search(searchQuery, 3);
  } catch (err) {
    console.warn(`[Tavily] Search for "${searchQuery}" failed gracefully:`, err);
  }

  // if webEvidence are return then pass them in web evidence
  const webEvidence =
    webResults.length > 0
      ? `<web_evidence>\n${webResults
          .map(
            (r, i) =>
              `[Web Source #${i + 1}]: "${r.title}"\nURL: ${r.url}\nExcerpt:\n${r.content}`,
          )
          .join("\n\n")}\n</web_evidence>`
      : "";

// a message type used to define role, instructions and behavious of AI models.
  const systemMessage = new SystemMessage(
    `You are a careful, rigorous research analyst working through a research plan.
Synthesize and analyze information directly in clear, informative markdown text.
CRITICAL CONSTRAINT: Do NOT attempt to invoke external tools, function calls, or syntax such as "call:..." or "web_search(...)". Live web search and evidence collection has already been performed for you and is provided below.
Complete only the specified task using the provided document context, web search evidence, and prerequisite findings.
For document-based claims, ground findings strictly in supplied document context.
For external or web-based claims, reference the web source title and URL from the provided web evidence.
Return concise, substantive findings that can be synthesized into the final answer. Do not write the final user-facing answer yet.`,
  );

  // convert conversation messages into langchain message object & store them into historyMessages
  const historyMessages: BaseMessage[] = (state.conversationHistory || []).map(
    (turn) =>
      turn.role === "assistant"
        ? new AIMessage(turn.content)
        : turn.role === "system"
          ? new SystemMessage(turn.content)
          : new HumanMessage(turn.content),
  );

  const relevantFindings = formatRelevantFindings(step, currentPlan);

  const directContext =
    state.documentMode === "direct" && state.document?.content
      ? `<document_context fileName="${state.document.fileName}">\n${state.document.content}\n</document_context>`
      : "";

  const retrievedEvidence =
    state.documentMode === "ingest"
      ? `<retrieved_evidence>\n${(state.retrievedChunks || []).join("\n\n") || "No relevant evidence was retrieved."}\n</retrieved_evidence>`
      : "";

  const humanMessage = new HumanMessage(
    `Research question:
${state.query || "Analyze the supplied document."}

Current task (${step.id}): ${step.title}
Task objective: ${step.description || step.title}

${relevantFindings ? `Prerequisite task findings:\n${relevantFindings}\n` : ""}
${directContext}
${retrievedEvidence}
${webEvidence}

Investigate and provide substantive findings for this task in markdown text. Do not output tool or function calls.`,
  );

  let result: string;
  try {
    result = await llm.generateResponse([
      systemMessage,
      ...historyMessages,
      humanMessage,
    ]);
  } catch (error: unknown) {
    const formatted = logWorkflowError(`executeTask:${step.id}`, error, {
      stepId: step.id,
      stepTitle: step.title,
      query: state.query,
      dependsOn: step.dependsOn,
    });
    throw new WorkflowError(formatted);
  }

  // Fallback retry if model returned empty content
  if (!result || !result.trim()) {
    console.warn(
      `[LangGraph Node: executeConcurrentResearchStepsNode] Task "${step.title}" (${step.id}) returned empty output; executing direct fallback prompt...`,
    );
    try {
      result = await llm.generateResponse([
        new SystemMessage(
          "You are an expert technical researcher. Provide thorough, detailed research findings directly in plain markdown text. Do not output any tool calls or function calls.",
        ),
        new HumanMessage(
          `Provide substantive research findings for: ${step.title}.\nObjective: ${step.description || step.title}\nContext/Evidence:\n${webEvidence || "Analyze standard framework documentation and best practices."}`,
        ),
      ]);
    } catch (fallbackError) {
      console.warn(
        `[LangGraph] Fallback prompt for "${step.title}" failed:`,
        fallbackError,
      );
    }
  }

  if (!result || !result.trim()) {
    throw new Error(
      `[LangGraph] Research task "${step.title}" returned an empty result.`,
    );
  }

  const outputSnippet =
    result.length > 400 ? `${result.slice(0, 397)}...` : result;

  console.log(
    `[LangGraph Node: executeConcurrentResearchStepsNode] Completed task "${step.title}" (${step.id}).`,
  );

  return {
    id: step.id,
    result,
    outputSnippet,
    searchResults: webResults,
  };
}

/**
 * Executes a list of tasks with controlled concurrency to prevent exceeding API burst rate limits.
 */
async function executeTasksWithConcurrency<T, R>(
  items: T[],
  concurrencyLimit: number,
  taskFn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      try {
        const val = await taskFn(items[idx]);
        results[idx] = { status: "fulfilled", value: val };
      } catch (err) {
        results[idx] = { status: "rejected", reason: err };
      }
    }
  }

  const poolSize = Math.max(1, Math.min(concurrencyLimit, items.length));
  const workers = Array.from({ length: poolSize }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Concurrent DAG Execution Node:
 * Identifies independent pending steps and executes them concurrently with controlled concurrency.
 * Runs in topological dependency waves until all steps are completed.
 */
export async function executeConcurrentResearchStepsNode(
  state: ResearchStateType,
  llm: LlmService = llmService,
): Promise<Partial<ResearchStateType>> {
  let workingPlan: ResearchPlanStep[] = (state.researchPlan || []).map((s) => ({
    ...s,
    status: s.status || "pending",
  }));

  const allSearchResults: SearchResultItem[] = [...(state.searchResults || [])];

  console.log(
    `[LangGraph Node: executeConcurrentResearchStepsNode] Starting DAG execution for ${workingPlan.length} research task(s)...`,
  );

  let waveIndex = 1;

  while (workingPlan.some((s) => s.status !== "completed")) {
    const completedIds = new Set(
      workingPlan.filter((s) => s.status === "completed").map((s) => s.id),
    );

    // Find all pending steps whose dependencies are ALL completed
    let readySteps = workingPlan.filter(
      (s) =>
        s.status === "pending" &&
        (s.dependsOn || []).every((depId) => completedIds.has(depId)),
    );

    // Guard against circular or invalid dependencies: take first pending if none are ready
    if (readySteps.length === 0) {
      const remainingPending = workingPlan.find((s) => s.status === "pending");
      if (!remainingPending) {
        break; // All steps done
      }
      console.warn(
        `[LangGraph Node: executeConcurrentResearchStepsNode] No strictly ready tasks found; resolving dependency stall on ${remainingPending.id}.`,
      );
      readySteps = [remainingPending];
    }

    console.log(
      `[LangGraph Wave ${waveIndex}] Executing ${readySteps.length} task(s) concurrently in parallel:`,
      readySteps.map((s) => s.id),
    );

    // Mark current wave as in_progress
    workingPlan = updatePlanSteps(
      workingPlan,
      readySteps.map((s) => ({ id: s.id, status: "in_progress" as const })),
    );

    // Execute independent steps with controlled concurrency (max 2 parallel workers) to avoid API burst rate limits
    const settledResults = await executeTasksWithConcurrency(
      readySteps,
      2,
      (step) => executeSingleTask(step, workingPlan, state, llm),
    );

    const failures = settledResults.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );

    if (failures.length > 0) {
      const firstError = failures[0].reason;
      logWorkflowError("executeConcurrentResearchStepsNode", firstError, {
        waveIndex,
        readyStepIds: readySteps.map((s) => s.id),
        failedStepCount: failures.length,
        totalSteps: workingPlan.length,
      });
      throw firstError;
    }

    const waveResults = (
      settledResults as PromiseFulfilledResult<
        Awaited<ReturnType<typeof executeSingleTask>>
      >[]
    ).map((r) => r.value);

    for (const res of waveResults) {
      if (res.searchResults && res.searchResults.length > 0) {
        allSearchResults.push(...res.searchResults);
      }
    }

    // Mark completed with results
    workingPlan = updatePlanSteps(
      workingPlan,
      waveResults.map((res) => ({
        id: res.id,
        status: "completed" as const,
        result: res.result,
        outputSnippet: res.outputSnippet,
      })),
    );

    waveIndex++;
  }

  // Deduplicate search results by URL or title
  const seenUrls = new Set<string>();
  const dedupedSearchResults: SearchResultItem[] = [];
  for (const item of allSearchResults) {
    const key = item.url || item.title;
    if (key && !seenUrls.has(key)) {
      seenUrls.add(key);
      dedupedSearchResults.push(item);
    }
  }

  console.log(
    `[LangGraph Node: executeConcurrentResearchStepsNode] All ${workingPlan.length} research tasks completed across ${waveIndex - 1} wave(s). Collected ${dedupedSearchResults.length} web search source(s).`,
  );

  return {
    researchPlan: workingPlan,
    searchResults: dedupedSearchResults,
  };
}

// Backward-compatible export
export const executeResearchStepNode = executeConcurrentResearchStepsNode;
