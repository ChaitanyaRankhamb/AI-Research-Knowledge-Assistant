import { Document } from "@langchain/core/documents";
import { documentLoader, type DocumentMetadata } from "./document-loader";
import { textSplitterService, type ChunkMetadata } from "./text-splitter";
import {
  embeddingService,
  type EmbeddedDocumentChunk,
} from "./embedding.service";
import {
  vectorStoreService,
  type VectorStoreResult,
} from "./vector-store/vector-store.service";

/**
 * Result returned upon completion of the full ingestion pipeline.
 */
export interface IngestionPipelineResult {
  documentId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalLoadedDocs: number;
  totalChunks: number;
  status: "completed" | "failed";
  vectorStoreResult?: VectorStoreResult;
  error?: string;
}

/**
 * Full LangChain Ingestion Pipeline
 *
 * Orchestrates the 4 core steps of document ingestion:
 *   Step 1: Document Loading  -> Extract text & metadata into LangChain Documents
 *   Step 2: Text Splitting    -> Break documents into semantically coherent chunks
 *   Step 3: Embedding         -> Generate numerical vectors for each chunk
 *   Step 4: Vector Storing    -> Persist vectors & metadata in the vector database
 */
export class IngestionPipeline {
  /**
   * Main Pipeline Orchestrator:
   * Executes all 4 steps in sequential order.
   *
   * @param file Express.Multer.File received from the request
   * @param documentId Optional unique document identifier (or generated automatically)
   * @returns IngestionPipelineResult summarizing the entire operation
   */
  public async run(
    file: Express.Multer.File,
    documentId?: string,
  ): Promise<IngestionPipelineResult> {
    const docId = documentId || crypto.randomUUID();
    console.log(
      `[Ingestion Pipeline] Starting ingestion for "${file.originalname}" (ID: ${docId})...`,
    );

    try {
      // step 1 document loading
      const documents = await this.documentLoaderService(file);

      if (documents.length === 0) {
        return {
          documentId: docId,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          totalLoadedDocs: 0,
          totalChunks: 0,
          status: "failed",
          error: "No documents loaded",
        };
      }

      // step 2 text splitting
      const chunks = await this.textSplitterService(documents);

      if (chunks.length === 0) {
        return {
          documentId: docId,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          totalLoadedDocs: documents.length,
          totalChunks: 0,
          status: "failed",
          error: "No chunks loaded",
        };
      }

      // step 3 embeddings generation
      const embeddedChunks = await this.embeddingsGenerationService(chunks);

      if (embeddedChunks.length === 0) {
        return {
          documentId: docId,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          totalLoadedDocs: documents.length,
          totalChunks: chunks.length,
          status: "failed",
          error: "No embedded chunks loaded",
        };
      }

      // step 4 vector storage
      const vectorStoreResult = await this.vectorStorageService(
        docId,
        embeddedChunks,
      );

      if (!vectorStoreResult) {
        return {
          documentId: docId,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          totalLoadedDocs: documents.length,
          totalChunks: chunks.length,
          status: "failed",
          error: "Failed to store vectors in vector database",
        };
      }

      return {
        documentId: docId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        totalLoadedDocs: documents.length,
        totalChunks: chunks.length,
        status: "completed",
        vectorStoreResult: vectorStoreResult,
      };
    } catch (error) {
      console.error("[Ingestion Pipeline] Error:", error);
      return {
        documentId: docId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        totalLoadedDocs: 0,
        totalChunks: 0,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Step 1: Document Loader
   * Delegates to DocumentLoader to extract text from PDF, Word, or Text buffers.
   */
  public async documentLoaderService(
    file: Express.Multer.File,
  ): Promise<Document<DocumentMetadata>[]> {
    console.log("[Ingestion Pipeline] -> Document Loader: Loading Document...");
    return await documentLoader.loadDocument(file);
  }

  /**
   * Step 2: Text Splitter
   * Delegates to TextSplitterService to split documents into smaller chunks.
   */
  public async textSplitterService(
    documents: Document<DocumentMetadata>[],
  ): Promise<Document<ChunkMetadata>[]> {
    console.log(
      "[Ingestion Pipeline] -> Text Splitter: Splitting Text into Chunks...",
    );
    return await textSplitterService.splitDocuments(documents);
  }

  /**
   * Step 3: Embeddings Generation
   * Delegates to EmbeddingService to convert chunks into numerical vectors.
   */
  public async embeddingsGenerationService(
    chunks: Document<ChunkMetadata>[],
  ): Promise<EmbeddedDocumentChunk[]> {
    console.log(
      "[Ingestion Pipeline] -> Embeddings Generation: Generating Vector Embeddings...",
    );
    return await embeddingService.embedDocuments(chunks);
  }

  /**
   * Step 4: Vector Storage
   * Delegates to VectorStoreService to save embedded chunks into vector DB.
   */
  public async vectorStorageService(
    documentId: string,
    embeddedChunks: EmbeddedDocumentChunk[],
  ): Promise<VectorStoreResult> {
    console.log(
      "[Ingestion Pipeline] -> Vector Storage: Storing Vectors in Vector Database...",
    );
    return await vectorStoreService.storeChunks(documentId, embeddedChunks);
  }
}

export const ingestionPipeline = new IngestionPipeline();
