import { Document } from "@langchain/core/documents";
import { embeddingService } from "../langchain/embedding.service";
import { textSplitterService } from "../langchain/text-splitter";
import { vectorStoreService } from "../langchain/vector-store/vector-store.service";
import { researchGraphWorkflow } from "../langgraph/research-graph";
import type { ResearchConditionHandler } from "./condition-context";

const handleLargePastedText: ResearchConditionHandler = async ({
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
    pastedTextSizeBytes < largeContentThresholdBytes
  ) {
    return null;
  }

  console.log(
    `Condition 5: Large pasted text (${(pastedTextSizeBytes / (1024 * 1024)).toFixed(2)} MB) -> Ingesting Virtual Document and running LangGraph RAG (${planApprovalStatus})...`,
  );

  const docId = crypto.randomUUID();
  const virtualDoc = new Document({
    pageContent: pastedText,
    metadata: {
      source: "pasted-content",
      fileName: "Pasted Text",
      fileSize: pastedTextSizeBytes,
      mimeType: "text/plain",
    },
  });

  const chunks = await textSplitterService.splitDocuments([virtualDoc]);
  const embeddedChunks = await embeddingService.embedDocuments(chunks);
  await vectorStoreService.storeChunks(docId, embeddedChunks);

  const graphResult = await researchGraphWorkflow.run({
    query: query || "",
    documentMode: "ingest",
    document: {
      documentId: docId,
      fileName: "Pasted Text",
      mimeType: "text/plain",
      sizeBytes: pastedTextSizeBytes,
    },
    ingestionStatus: "completed",
    conversationHistory,
    planApprovalStatus,
    userPlanEdits,
    researchPlan,
    executionId,
  });

  return formatResponse(
    "ingest_pasted_text",
    query || null,
    graphResult,
    planApprovalStatus,
    {
      documentId: docId,
      textSizeBytes: pastedTextSizeBytes,
      totalChunks: chunks.length,
      retrievedChunksCount: graphResult.retrievedChunks?.length || 0,
    },
  );
};

export default handleLargePastedText;
