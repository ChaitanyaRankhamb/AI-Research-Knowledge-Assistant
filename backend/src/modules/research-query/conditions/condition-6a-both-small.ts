import { documentLoader } from "../langchain/document-loader";
import { researchGraphWorkflow } from "../langgraph/research-graph";
import type { ResearchConditionHandler } from "./condition-context";

const handleBothSmall: ResearchConditionHandler = async ({
  query,
  pastedText,
  pastedTextSizeBytes,
  document,
  conversationHistory,
  planApprovalStatus,
  userPlanEdits,
  researchPlan,
  largeContentThresholdBytes,
  formatResponse,
}) => {
  if (
    !document ||
    !pastedText ||
    document.size >= largeContentThresholdBytes ||
    pastedTextSizeBytes >= largeContentThresholdBytes
  ) {
    return null;
  }

  const extractedDocText = await documentLoader.extractRawText(document);
  const combinedContent = `=== DOCUMENT CONTENT (${document.originalname}) ===\n${extractedDocText}\n\n=== PASTED USER RESEARCH CONTEXT ===\n${pastedText}`;
  const docId = crypto.randomUUID();
  const graphResult = await researchGraphWorkflow.run({
    query: query || "",
    documentMode: "direct",
    document: {
      documentId: docId,
      fileName: `${document.originalname} + Pasted Text`,
      mimeType: "text/plain",
      sizeBytes: document.size + pastedTextSizeBytes,
      content: combinedContent,
    },
    conversationHistory,
    planApprovalStatus,
    userPlanEdits,
    researchPlan,
  });

  return formatResponse(
    "dual_direct_small",
    query || null,
    graphResult,
    planApprovalStatus,
    {
      documentId: docId,
      documentFile: document.originalname,
      pastedTextBytes: pastedTextSizeBytes,
    },
  );
};

export default handleBothSmall;
