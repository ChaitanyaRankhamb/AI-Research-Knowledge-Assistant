import { Document } from "@langchain/core/documents";
import { documentLoader } from "../langchain/document-loader";
import { embeddingService } from "../langchain/embedding.service";
import { textSplitterService } from "../langchain/text-splitter";
import { vectorStoreService } from "../langchain/vector-store/vector-store.service";
import { researchGraphWorkflow } from "../langgraph/research-graph";
import type { ResearchConditionHandler } from "./condition-context";

const handleSmallDocumentLargePastedText: ResearchConditionHandler =
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
      document.size >= largeContentThresholdBytes ||
      pastedTextSizeBytes < largeContentThresholdBytes
    ) {
      return null;
    }

    const extractedDocText = await documentLoader.extractRawText(document);
    const pastedDocId = crypto.randomUUID();
    const virtualDoc = new Document({
      pageContent: pastedText,
      metadata: {
        source: "pasted-content",
        fileName: "Pasted Research Text",
        fileSize: pastedTextSizeBytes,
        mimeType: "text/plain",
      },
    });
    const chunks = await textSplitterService.splitDocuments([virtualDoc]);
    const embeddedChunks = await embeddingService.embedDocuments(chunks);
    await vectorStoreService.storeChunks(pastedDocId, embeddedChunks);

    const searchQuery = query
      ? `${query} ${extractedDocText.slice(0, 300)}`
      : extractedDocText.slice(0, 500);
    const matches = await vectorStoreService.searchSimilar(searchQuery, 5, {
      documentId: pastedDocId,
    });
    const retrievedChunks = matches.map(
      (match, index) =>
        `[Evidence #${index + 1}, Pasted Text Excerpt]:\n${match.pageContent}`,
    );

    const graphResult = await researchGraphWorkflow.run({
      query: query || "",
      documentMode: "ingest",
      document: {
        documentId: pastedDocId,
        fileName: "Pasted Research Text",
        mimeType: "text/plain",
        sizeBytes: pastedTextSizeBytes,
        content: `=== DOCUMENT CONTEXT (${document.originalname}) ===\n${extractedDocText}`,
      },
      retrievedChunks,
      ingestionStatus: "completed",
      conversationHistory,
      planApprovalStatus,
      userPlanEdits,
      researchPlan,
    });

    return formatResponse(
      "small_doc_direct_large_pasted_ingest",
      query || null,
      graphResult,
      planApprovalStatus,
      {
        pastedTextId: pastedDocId,
        documentFile: document.originalname,
        totalChunks: chunks.length,
        retrievedChunksCount: retrievedChunks.length,
      },
    );
  };

export default handleSmallDocumentLargePastedText;
