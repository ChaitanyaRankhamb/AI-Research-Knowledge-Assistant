import type { ResearchStateType } from "../../research-state";

export function routeAfterResearchStep(
  state: ResearchStateType,
): "prepareResearchStepNode" | "generateAnswerNode" {
  return state.researchPlan.some((step) => step.status === "pending")
    ? "prepareResearchStepNode"
    : "generateAnswerNode";
}
