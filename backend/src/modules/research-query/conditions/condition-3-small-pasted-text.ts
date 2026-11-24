import { researchGraphWorkflow } from "../langgraph/research-graph";
import type { ResearchConditionHandler } from "./condition-context";

const handleSmallPastedText: ResearchConditionHandler = async ({
  query,
  pastedText,
  pastedTextSizeBytes,
  document,
  conversationHistory,
  planApprovalStatus,
  userPlanEdits,
  researchPlan,
  executionId,
  largeContentThresholdBytes,
  formatResponse,
}) => {
  if (
    !pastedText ||
    document ||
    pastedTextSizeBytes >= largeContentThresholdBytes
  ) {
    return null;
  }

  console.log(
    `Condition 3: Small pasted text (${(pastedTextSizeBytes / 1024).toFixed(1)} KB) -> Direct prompt injection and LangGraph execution (${planApprovalStatus})...`,
  );

  const docId = crypto.randomUUID();
  const graphResult = await researchGraphWorkflow.run({
    query: query || "",
    documentMode: "direct",
    document: {
      documentId: docId,
      fileName: "Pasted Text",
      mimeType: "text/plain",
      sizeBytes: pastedTextSizeBytes,
      content: pastedText,
    },
    conversationHistory,
    planApprovalStatus,
    userPlanEdits,
    researchPlan,
    executionId,
  });

  return formatResponse(
    "direct_pasted_text",
    query || null,
    graphResult,
    planApprovalStatus,
    {
      documentId: docId,
      textSizeBytes: pastedTextSizeBytes,
    },
  );
};

export default handleSmallPastedText;
