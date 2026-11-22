import { ingestionPipeline } from "../langchain/document-ingestion-pipeline";
import { researchGraphWorkflow } from "../langgraph/research-graph";
import type { ResearchConditionHandler } from "./condition-context";

const handleLargeDocumentSmallPastedText: ResearchConditionHandler =
  async ({
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
      document.size < largeContentThresholdBytes ||
      pastedTextSizeBytes >= largeContentThresholdBytes
    ) {
      return null;
    }

    const ingestionResult = await ingestionPipeline.run(document);
    if (ingestionResult.status === "failed") {
      throw new Error(
        `Ingestion pipeline failed for ${document.originalname}: ${ingestionResult.error || "Unknown error"}`,
      );
    }

    const augmentedQuery = query
      ? `${query}\n\nContext Notes:\n${pastedText}`
      : pastedText;
    const graphResult = await researchGraphWorkflow.run({
      query: augmentedQuery,
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
      "large_doc_ingest_small_pasted_direct",
      query || null,
      graphResult,
      planApprovalStatus,
      {
        documentId: ingestionResult.documentId,
        documentFile: ingestionResult.fileName,
        pastedTextBytes: pastedTextSizeBytes,
        totalChunks: ingestionResult.totalChunks,
        retrievedChunksCount: graphResult.retrievedChunks?.length || 0,
      },
    );
  };

export default handleLargeDocumentSmallPastedText;
