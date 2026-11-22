import {
  type ResearchStateType,
  updatePlanSteps,
} from "../../research-state";

export function prepareResearchStepNode(
  state: ResearchStateType,
): Partial<ResearchStateType> {
  const nextStep = state.researchPlan.find(
    (step) => step.status === "pending",
  );

  if (!nextStep) {
    throw new Error(
      "[LangGraph] No pending research task is available to execute.",
    );
  }

  console.log(
    `[LangGraph Node: prepareResearchStepNode] Starting task "${nextStep.title}" (${nextStep.id}).`,
  );

  return {
    researchPlan: updatePlanSteps(state.researchPlan, [
      { id: nextStep.id, status: "in_progress" },
    ]),
  };
}
