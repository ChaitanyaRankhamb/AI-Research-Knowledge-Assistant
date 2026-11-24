import { Document } from "@langchain/core/documents";
import { ingestionPipeline } from "../langchain/document-ingestion-pipeline";
import { embeddingService } from "../langchain/embedding.service";
import { textSplitterService } from "../langchain/text-splitter";
import { vectorStoreService } from "../langchain/vector-store/vector-store.service";
import { researchGraphWorkflow } from "../langgraph/research-graph";
import type { ResearchConditionHandler } from "./condition-context";

const handleBothLarge: ResearchConditionHandler = async ({
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
    !document ||
    !pastedText ||
    document.size < largeContentThresholdBytes ||
    pastedTextSizeBytes < largeContentThresholdBytes
  ) {
    return null;
  }

  const ingestionResult = await ingestionPipeline.run(document);
  if (ingestionResult.status === "failed") {
    throw new Error(
      `Ingestion pipeline failed for ${document.originalname}: ${ingestionResult.error || "Unknown error"}`,
    );
  }

  const virtualDoc = new Document({
    pageContent: pastedText,
    metadata: {
      source: "pasted-content",
      fileName: "Pasted Research Text",
      fileSize: pastedTextSizeBytes,
      mimeType: "text/plain",
    },
  });
  const pastedChunks = await textSplitterService.splitDocuments([virtualDoc]);
  const embeddedPastedChunks =
    await embeddingService.embedDocuments(pastedChunks);
  await vectorStoreService.storeChunks(
    ingestionResult.documentId,
    embeddedPastedChunks,
  );

  const graphResult = await researchGraphWorkflow.run({
    query: query || "",
    documentMode: "ingest",
    document: {
      documentId: ingestionResult.documentId,
      fileName: `${ingestionResult.fileName} + Pasted Text`,
      mimeType: "multipart/mixed",
      sizeBytes: ingestionResult.fileSize + pastedTextSizeBytes,
    },
    ingestionStatus: "completed",
    conversationHistory,
    planApprovalStatus,
    userPlanEdits,
    researchPlan,
    executionId,
  });

  return formatResponse(
    "dual_large_ingest",
    query || null,
    graphResult,
    planApprovalStatus,
    {
      documentId: ingestionResult.documentId,
      documentFile: ingestionResult.fileName,
      totalDocumentChunks: ingestionResult.totalChunks,
      totalPastedChunks: pastedChunks.length,
      retrievedChunksCount: graphResult.retrievedChunks?.length || 0,
    },
  );
};

export default handleBothLarge;
