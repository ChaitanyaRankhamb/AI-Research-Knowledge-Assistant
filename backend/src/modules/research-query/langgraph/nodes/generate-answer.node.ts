import {
  type ResearchStateType,
  type ChatMessage,
} from "../../research-state";
import { llmService, type LlmService } from "../../llm/llm.service";
import { buildPromptForState } from "../../prompts/research-prompts";
import { logWorkflowError, WorkflowError } from "../../../../utils/api-error-handler";

export async function generateAnswerNode(
  state: ResearchStateType,
  llm: LlmService = llmService,
): Promise<Partial<ResearchStateType>> {
  const incompleteSteps = state.researchPlan.filter(
    (step) => step.status !== "completed" || !step.result,
  );
  if (incompleteSteps.length > 0) {
    throw new Error(
      `[LangGraph] Cannot generate the final answer before all research tasks complete: ${incompleteSteps.map((step) => step.id).join(", ")}.`,
    );
  }

  console.log(
    `[LangGraph Node: generateAnswerNode] Generating answer for mode: "${state.documentMode}"...`,
  );

  const promptMessages = buildPromptForState(state);
  let answer: string;
  try {
    answer = await llm.generateResponse(promptMessages);
  } catch (error: unknown) {
    const formatted = logWorkflowError("generateAnswerNode", error, {
      query: state.query,
      documentMode: state.documentMode,
      completedStepsCount: state.researchPlan.length,
      searchResultsCount: state.searchResults?.length || 0,
      retrievedChunksCount: state.retrievedChunks?.length || 0,
    });
    throw new WorkflowError(formatted);
  }

  const userTurnText =
    state.query?.trim() ||
    (state.document?.fileName
      ? `[Uploaded and analyzed document: ${state.document.fileName}]`
      : "[Analyzed uploaded context]");

  const updatedHistory: ChatMessage[] = [
    ...(state.conversationHistory || []),
    { role: "user", content: userTurnText },
    { role: "assistant", content: answer },
  ];

  return {
    finalAnswer: answer,
    conversationHistory: updatedHistory,
  };
}
