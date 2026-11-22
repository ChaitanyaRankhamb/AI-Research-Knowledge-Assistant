import { Document } from "@langchain/core/documents";
import type { ChunkMetadata } from "./text-splitter";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import dotenv from "dotenv";

dotenv.config();

/**
 * Represents a document chunk paired with its generated vector embedding.
 */
export interface EmbeddedDocumentChunk {
  id: string; // Unique identifier for the chunk
  pageContent: string; // Text content of the chunk
  metadata: ChunkMetadata; // Associated citation and chunking metadata
  embedding: number[]; // High-dimensional vector representation
}

/**
 * Configuration options for the embedding model.
 */
export interface EmbeddingConfig {
  modelName: string; // Model identifier (e.g., "gemini-embedding-001", "text-embedding-004")
  dimensions?: number; // Vector dimensions
}

/**
 * Step 3: Embedding Service
 *
 * Converts textual document chunks into numerical vector embeddings
 * that capture their semantic meaning for similarity search.
 */
export class EmbeddingService {
  /**
   * Default embedding model identifier configured from environment or fallback
   */
  public static readonly DEFAULT_MODEL_NAME =
    process.env.GOOGLE_GEMINI_EMBEDDING_MODEL_NAME ||
    process.env.GOOGLE_GEMINI_EMBEDDING_MODEL ||
    "gemini-embedding-001";

  /**
   * Batch size for sending chunks to the embedding API.
   * Kept at 25 to respect Gemini free-tier rate limits (100 requests / min).
   */
  private static readonly EMBEDDING_BATCH_SIZE = 25;

  /**
   * Instantiates the GoogleGenerativeAIEmbeddings model with API key and configuration.
   */
  private getEmbeddingModel(
    config?: Partial<EmbeddingConfig>,
  ): GoogleGenerativeAIEmbeddings {
    const apiKey =
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "Google Gemini API key is missing. Please set GOOGLE_GEMINI_API_KEY in your .env file.",
      );
    }

    const model = config?.modelName || EmbeddingService.DEFAULT_MODEL_NAME;

    return new GoogleGenerativeAIEmbeddings({
      apiKey,
      model,
    });
  }

  /**
   * Step 3 Method: Generate embeddings for an array of document chunks.
   * Implements robust batching and retry logic to avoid rate limits and silent empty vector failures.
   *
   * @param chunks Array of chunked documents from TextSplitterService
   * @param config Optional embedding model configuration
   * @returns Array of chunks with their computed vector embeddings
   */
  public async embedDocuments(
    chunks: Document<ChunkMetadata>[],
    config?: Partial<EmbeddingConfig>,
  ): Promise<EmbeddedDocumentChunk[]> {
    if (!chunks || chunks.length === 0) {
      console.warn(
        "[Ingestion Pipeline: Step 3 - Embedding] No chunks provided to embed.",
      );
      return [];
    }

    console.log(
      `[Ingestion Pipeline: Step 3 - Embedding] Generating embeddings for ${chunks.length} chunk(s)...`,
    );

    const model = this.getEmbeddingModel(config);
    const allEmbeddings: number[][] = [];
    const batchSize = EmbeddingService.EMBEDDING_BATCH_SIZE;

    // Process in batches of 25 chunks to stay safely within API quota
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);
      const texts = batchChunks.map((chunk) => chunk.pageContent);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(chunks.length / batchSize);

      console.log(
        `[EmbeddingService] Embedding batch ${batchNum}/${totalBatches} (${texts.length} chunks)...`,
      );

      let batchEmbeddings: number[][] = [];
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          batchEmbeddings = await model.embedDocuments(texts);

          // Guard against LangChain silently returning empty arrays on quota failure
          const hasEmpty = batchEmbeddings.some(
            (vec) => !vec || vec.length === 0,
          );
          if (hasEmpty) {
            throw new Error(
              "Gemini API returned empty vectors (rate limit reached). Retrying...",
            );
          }

          break; // Success
        } catch (error: unknown) {
          attempts++;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.warn(
            `[EmbeddingService] Batch ${batchNum} attempt ${attempts}/${maxAttempts} failed: ${errorMsg}`,
          );

          if (attempts >= maxAttempts) {
            throw new Error(
              `Embedding batch ${batchNum} failed after ${maxAttempts} attempts: ${errorMsg}`,
            );
          }

          // Exponential backoff delay (2s, 4s...)
          await new Promise((resolve) => setTimeout(resolve, attempts * 2500));
        }
      }

      allEmbeddings.push(...batchEmbeddings);

      // Small delay between batches to respect Gemini free-tier RPM
      if (i + batchSize < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 20 * 1000));
      }
    }

    console.log(
      `[Ingestion Pipeline: Step 3 - Embedding] Successfully generated ${allEmbeddings.length} vector embeddings.`,
    );

    return chunks.map((chunk, index) => ({
      id: chunk.id || crypto.randomUUID(),
      pageContent: chunk.pageContent,
      metadata: chunk.metadata,
      embedding: allEmbeddings[index],
    }));
  }

  /**
   * Helper method to embed a single user query for semantic search retrieval.
   *
   * @param query User search query string
   * @param config Optional embedding model configuration
   * @returns Single numerical vector embedding
   */
  public async embedQuery(
    query: string,
    config?: Partial<EmbeddingConfig>,
  ): Promise<number[]> {
    const cleanQuery = query?.trim();
    if (!cleanQuery) {
      throw new Error("Cannot generate embedding for an empty query.");
    }

    console.log(
      `[Ingestion Pipeline: Step 3 - Embedding] Embedding query: "${cleanQuery}"`,
    );

    const model = this.getEmbeddingModel(config);
    const vector = await model.embedQuery(cleanQuery);

    if (!vector || vector.length === 0) {
      throw new Error("Gemini API returned an empty query vector.");
    }

    return vector;
  }
}

export const embeddingService = new EmbeddingService();
