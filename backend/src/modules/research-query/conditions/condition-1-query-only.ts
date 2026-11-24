import { researchGraphWorkflow } from "../langgraph/research-graph";
import type { ResearchConditionHandler } from "./condition-context";

const handleQueryOnly: ResearchConditionHandler = async ({
  query,
  document,
  pastedText,
  conversationHistory,
  planApprovalStatus,
  userPlanEdits,
  researchPlan,
  executionId,
  formatResponse,
}) => {
  // only when user sends only query. no document and no text.
  if (!query || document || pastedText) return null;

  console.log(
    `Condition 1: Pure query only -> Executing LangGraph research workflow (${planApprovalStatus})...`,
  );

  const graphResult = await researchGraphWorkflow.run({
    query,
    documentMode: "none",
    document: null,
    conversationHistory,
    planApprovalStatus,
    userPlanEdits,
    researchPlan,
    executionId,
  });

  return formatResponse(
    "query_only",
    query,
    graphResult,
    planApprovalStatus,
  );
};

export default handleQueryOnly;
