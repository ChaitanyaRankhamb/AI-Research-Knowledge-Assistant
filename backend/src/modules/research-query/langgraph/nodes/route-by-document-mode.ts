import type { ResearchStateType } from "../../research-state";

export function routeByDocumentMode(
  state: ResearchStateType,
): "retrievalNode" | "prepareResearchStepNode" {
  console.log(
    `[LangGraph Router] Evaluating documentMode: "${state.documentMode}"`,
  );

  switch (state.documentMode) {
    case "ingest":
      return "retrievalNode";
    case "direct": // calls prepareResearchStepNode, skips retrievalNode
    case "none": // calls prepareResearchStepNode, skips retrievalNode
    default:
      return "prepareResearchStepNode";
  }
}
