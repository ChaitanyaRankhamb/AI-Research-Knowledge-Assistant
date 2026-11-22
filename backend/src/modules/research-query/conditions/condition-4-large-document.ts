import { ingestionPipeline } from "../langchain/document-ingestion-pipeline";
import { researchGraphWorkflow } from "../langgraph/research-graph";
import type { ResearchConditionHandler } from "./condition-context";

const handleLargeDocument: ResearchConditionHandler = async ({
  query,
  document,
  conversationHistory,
  planApprovalStatus,
  userPlanEdits,
  researchPlan,
  largeContentThresholdBytes,
  formatResponse,
}) => {
  if (!document || document.size < largeContentThresholdBytes) return null;

  console.log(
    `Condition 4: Large document (${(document.size / (1024 * 1024)).toFixed(2)} MB) -> Running Ingestion Pipeline then LangGraph RAG (${planApprovalStatus})...`,
  );

  const ingestionResult = await ingestionPipeline.run(document);
  if (ingestionResult.status === "failed") {
    throw new Error(
      `Ingestion pipeline failed: ${ingestionResult.error || "Unknown error"}`,
    );
  }

  const graphResult = await researchGraphWorkflow.run({
    query: query || "",
    documentMode: "ingest",
    document: {
      documentId: ingestionResult.documentId,
      fileName: ingestionResult.fileName,
      mimeType: ingestionResult.mimeType,
      sizeBytes: ingestionResult.fileSize,
    },
    ingestionStatus: "completed",
    conversationHistory,
    planApprovalStatus,
    userPlanEdits,
    researchPlan,
  });

  return formatResponse(
    "ingest",
    query || null,
    graphResult,
    planApprovalStatus,
    {
      documentId: ingestionResult.documentId,
      fileName: ingestionResult.fileName,
      fileSize: ingestionResult.fileSize,
      mimeType: ingestionResult.mimeType,
      totalLoadedDocs: ingestionResult.totalLoadedDocs,
      totalChunks: ingestionResult.totalChunks,
      retrievedChunksCount: graphResult.retrievedChunks?.length || 0,
    },
  );
};

export default handleLargeDocument;
