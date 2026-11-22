import { documentLoader } from "../langchain/document-loader";
import { researchGraphWorkflow } from "../langgraph/research-graph";
import type { ResearchConditionHandler } from "./condition-context";

const handleSmallDocument: ResearchConditionHandler = async ({
  query,
  document,
  conversationHistory,
  planApprovalStatus,
  userPlanEdits,
  researchPlan,
  largeContentThresholdBytes,
  formatResponse,
}) => {
  if (!document || document.size >= largeContentThresholdBytes) return null;

  console.log(
    `Condition 2: Small document (${(document.size / 1024).toFixed(1)} KB) -> Direct text extraction and LangGraph execution (${planApprovalStatus})...`,
  );

  const extractedText = await documentLoader.extractRawText(document);
  const docId = crypto.randomUUID();

  const graphResult = await researchGraphWorkflow.run({
    query: query || "",
    documentMode: "direct",
    document: {
      documentId: docId,
      fileName: document.originalname,
      mimeType: document.mimetype,
      sizeBytes: document.size,
      content: extractedText,
    },
    conversationHistory,
    planApprovalStatus,
    userPlanEdits,
    researchPlan,
  });

  return formatResponse(
    "direct",
    query || null,
    graphResult,
    planApprovalStatus,
    {
      documentId: docId,
      fileName: document.originalname,
      fileSize: document.size,
      mimeType: document.mimetype,
    },
  );
};

export default handleSmallDocument;
