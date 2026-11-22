import { Document } from "@langchain/core/documents";
import { documentLoader, DocumentLoader } from "./langchain/document-loader";
import { ingestionPipeline } from "./langchain/document-ingestion-pipeline";
import { vectorStoreService } from "./langchain/vector-store/vector-store.service";
import { textSplitterService } from "./langchain/text-splitter";
import { embeddingService } from "./langchain/embedding.service";

class ResearchQueryService {
  /**
   * 2 MB threshold in bytes
   * Defines the boundary between Direct LLM Context and Full Vector Ingestion Pipeline
   */
  private static readonly LARGE_CONTENT_THRESHOLD_BYTES =
    DocumentLoader.LARGE_DOCUMENT_THRESHOLD_BYTES; // 2 * 1024 * 1024 bytes (2 MB)

  public async processResearchQuery(
    query: string | undefined,
    pastedText: string | undefined,
    document: Express.Multer.File | undefined,
  ): Promise<unknown> {
    const cleanQuery = query?.trim();
    const cleanPastedText = pastedText?.trim();
    const pastedTextSizeBytes = cleanPastedText
      ? Buffer.byteLength(cleanPastedText, "utf-8")
      : 0;

    console.log("[ResearchQueryService] Processing request:", {
      hasQuery: Boolean(cleanQuery),
      hasDocument: Boolean(document),
      documentSize: document?.size,
      hasPastedText: Boolean(cleanPastedText),
      pastedTextBytes: pastedTextSizeBytes,
    });

    // -------------------------------------------------------------------------
    // Guard: Validate that at least one input is provided
    // -------------------------------------------------------------------------
    if (!cleanQuery && !document && !cleanPastedText) {
      console.log("Condition: Invalid request - No input provided.");
      throw new Error(
        "Please provide a search query, a document, or pasted text.",
      );
    }

    // -------------------------------------------------------------------------
    // Condition 1: Pure Query Only (No Document & No Pasted Text)
    // -> Ready for LangGraph workflow integration
    // -------------------------------------------------------------------------
    if (cleanQuery && !document && !cleanPastedText) {
      console.log(
        "Condition 1: Pure query only -> Direct search / reasoning mode.",
      );
      return {
        mode: "query_only",
        query: cleanQuery,
        message:
          "Query received. (LangGraph research workflow will be connected here).",
      };
    }

    // -------------------------------------------------------------------------
    // Condition 2: Uploaded Document is Small (< 2 MB)
    // -> Bypass LangChain chunking/embedding ingestion pipeline
    // -> Extract raw text directly via DocumentLoader for LLM context stuffing
    // -------------------------------------------------------------------------
    if (
      document &&
      document.size < ResearchQueryService.LARGE_CONTENT_THRESHOLD_BYTES
    ) {
      console.log(
        `Condition 2: Small document (${(document.size / 1024).toFixed(1)} KB) -> Direct text extraction (Bypassing Ingestion Pipeline).`,
      );

      const extractedText = await documentLoader.extractRawText(document);

      return {
        mode: "direct",
        fileName: document.originalname,
        fileSize: document.size,
        mimeType: document.mimetype,
        extractedCharacters: extractedText.length,
        textPreview:
          extractedText.length > 300
            ? `${extractedText.slice(0, 300)}...`
            : extractedText,
        query: cleanQuery || null,
        message: "Document text extracted directly for LLM context.",
      };
    }

    // -------------------------------------------------------------------------
    // Condition 3: Pasted Text is Small (< 2 MB)
    // -> Bypass LangChain chunking/embedding ingestion pipeline
    // -> Directly use pasted text as prompt context
    // -------------------------------------------------------------------------
    if (
      cleanPastedText &&
      !document &&
      pastedTextSizeBytes < ResearchQueryService.LARGE_CONTENT_THRESHOLD_BYTES
    ) {
      console.log(
        `Condition 3: Small pasted text (${(pastedTextSizeBytes / 1024).toFixed(1)} KB) -> Direct injection to prompt context.`,
      );

      return {
        mode: "direct_pasted_text",
        textLength: cleanPastedText.length,
        textSizeBytes: pastedTextSizeBytes,
        textPreview:
          cleanPastedText.length > 300
            ? `${cleanPastedText.slice(0, 300)}...`
            : cleanPastedText,
        query: cleanQuery || null,
        message: "Pasted text prepared directly for LLM context.",
      };
    }

    // -------------------------------------------------------------------------
    // Condition 4: Uploaded Document is Large (>= 2 MB)
    // -> Trigger LangChain Ingestion Pipeline:
    //    Loader -> Splitter -> Embedding -> Qdrant Vector Store
    // -> If query is present, retrieve top relevant chunks from Qdrant
    // -------------------------------------------------------------------------
    if (
      document &&
      document.size >= ResearchQueryService.LARGE_CONTENT_THRESHOLD_BYTES
    ) {
      console.log(
        `Condition 4: Large document (${(document.size / (1024 * 1024)).toFixed(2)} MB) -> Executing LangChain Ingestion Pipeline...`,
      );

      // Run full ingestion pipeline
      const ingestionResult = await ingestionPipeline.run(document);

      if (ingestionResult.status === "failed") {
        throw new Error(
          `Ingestion pipeline failed: ${ingestionResult.error || "Unknown error"}`,
        );
      }

      // If a query was provided with the document, verify Qdrant retrieval
      let retrievedChunks: Array<{
        content: string;
        page?: number;
        score?: number;
      }> = [];

      if (cleanQuery) {
        console.log(
          `[ResearchQueryService] Retrieving chunks matching query "${cleanQuery}" from Qdrant...`,
        );
        const searchMatches = await vectorStoreService.searchSimilar(
          cleanQuery,
          3,
          { documentId: ingestionResult.documentId },
        );

        retrievedChunks = searchMatches.map((chunk) => ({
          content: chunk.pageContent,
          page: chunk.metadata.page,
          score: (chunk.metadata.score as number) ?? undefined,
        }));
      }

      return {
        mode: "ingest",
        documentId: ingestionResult.documentId,
        fileName: ingestionResult.fileName,
        fileSize: ingestionResult.fileSize,
        mimeType: ingestionResult.mimeType,
        totalLoadedDocs: ingestionResult.totalLoadedDocs,
        totalChunks: ingestionResult.totalChunks,
        vectorStoreResult: ingestionResult.vectorStoreResult,
        query: cleanQuery || null,
        retrievedChunksCount: retrievedChunks.length,
        retrievedChunks,
        message:
          "Document successfully processed through LangChain Ingestion Pipeline into Qdrant.",
      };
    }

    // -------------------------------------------------------------------------
    // Condition 5: Pasted Text is Large (>= 2 MB)
    // -> Virtual Document Ingestion Pipeline:
    //    Wrap text -> Splitter -> Embedding -> Qdrant Vector Store
    // -------------------------------------------------------------------------
    if (
      cleanPastedText &&
      !document &&
      pastedTextSizeBytes >= ResearchQueryService.LARGE_CONTENT_THRESHOLD_BYTES
    ) {
      console.log(
        `Condition 5: Large pasted text (${(pastedTextSizeBytes / (1024 * 1024)).toFixed(2)} MB) -> Ingesting via Virtual Document...`,
      );

      const docId = crypto.randomUUID();

      // Wrap as virtual document
      const virtualDoc = new Document({
        pageContent: cleanPastedText,
        metadata: {
          source: "pasted-content",
          fileName: "Pasted Text",
          fileSize: pastedTextSizeBytes,
          mimeType: "text/plain",
        },
      });

      // Split into chunks
      const chunks = await textSplitterService.splitDocuments([virtualDoc]);

      // Embed chunks
      const embeddedChunks = await embeddingService.embedDocuments(chunks);

      // Store in Qdrant
      const storeResult = await vectorStoreService.storeChunks(
        docId,
        embeddedChunks,
      );

      return {
        mode: "ingest_pasted_text",
        documentId: docId,
        totalChunks: chunks.length,
        vectorStoreResult: storeResult,
        query: cleanQuery || null,
        message: "Large pasted text successfully ingested into Qdrant.",
      };
    }

    // -------------------------------------------------------------------------
    // Condition 6: Both Document AND Pasted Text are provided
    // -------------------------------------------------------------------------
    if (document && cleanPastedText) {
      console.log(
        "Condition 6: Both document and pasted text provided. Processing document first.",
      );
      // For now, process document via loader/pipeline
      const extractedText = await documentLoader.extractRawText(document);
      return {
        mode: "composite",
        documentFile: document.originalname,
        documentTextLength: extractedText.length,
        pastedTextLength: cleanPastedText.length,
        query: cleanQuery || null,
        message: "Composite document + pasted text received.",
      };
    }

    return {
      message: "Request processed.",
    };
  }
}

export const researchQueryService = new ResearchQueryService();
