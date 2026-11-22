import { Document } from "@langchain/core/documents";
import type { EmbeddedDocumentChunk } from "../embedding.service";
import { embeddingService } from "../embedding.service";
import type { ChunkMetadata } from "../text-splitter";
import {
  VectorStoreRepository,
  vectorStoreRepository,
} from "./vector-store.repository";
import type {
  VectorDocumentRecord,
  VectorSearchFilter,
} from "./vector-document.model";

/**
 * Result returned after storing chunks in the vector database.
 */
export interface VectorStoreResult {
  documentId: string;
  storedChunksCount: number;
  success: boolean;
}

/**
 * Step 4 (Service Layer): Vector Store Service
 *
 * Coordinates business logic for indexing embedded chunks into Qdrant,
 * applying metadata filters, and executing semantic similarity search queries.
 */
export class VectorStoreService {
  private readonly repository: VectorStoreRepository;

  constructor(repository: VectorStoreRepository = vectorStoreRepository) {
    this.repository = repository;
  }

  /**
   * Step 4 Method: Stores embedded chunks into Qdrant vector database.
   *
   * @param documentId Unique identifier of the uploaded document
   * @param embeddedChunks Array of chunks with embeddings from EmbeddingService
   * @returns Summary result of the storage operation
   */
  public async storeChunks(
    documentId: string,
    embeddedChunks: EmbeddedDocumentChunk[],
  ): Promise<VectorStoreResult> {
    if (!embeddedChunks || embeddedChunks.length === 0) {
      console.warn(
        `[VectorStoreService] No chunks provided to store for documentId: "${documentId}".`,
      );
      return {
        documentId,
        storedChunksCount: 0,
        success: false,
      };
    }

    console.log(
      `[Ingestion Pipeline: Step 4 - Vector Store Service] Storing ${embeddedChunks.length} chunk(s) for document "${documentId}"...`,
    );

    const records: VectorDocumentRecord[] = embeddedChunks.map((chunk) => ({
      id: chunk.id || crypto.randomUUID(),
      documentId,
      text: chunk.pageContent,
      vector: chunk.embedding,
      metadata: chunk.metadata,
      createdAt: new Date(),
    }));

    await this.repository.saveChunks(records);

    return {
      documentId,
      storedChunksCount: records.length,
      success: true,
    };
  }

  /**
   * Retrieves semantically relevant document chunks matching a user research query.
   *
   * 1. Embeds the user query text using the embedding model.
   * 2. Executes cosine similarity vector search in Qdrant.
   * 3. Reconstructs and returns LangChain Documents with citation metadata.
   *
   * @param query User research query
   * @param topK Number of relevant chunks to retrieve (default: 5)
   * @param filter Optional filter parameters (e.g. limit to documentId)
   * @returns Array of LangChain Documents reconstructed from vector search
   */
  public async searchSimilar(
    query: string,
    topK: number,
    filter?: VectorSearchFilter,
  ): Promise<Document<ChunkMetadata>[]> {
    const cleanQuery = query?.trim();
    if (!cleanQuery) {
      throw new Error("Search query cannot be empty.");
    }

    console.log(
      `[VectorStoreService] Searching similar chunks for query: "${cleanQuery}" (topK: ${topK})...`,
    );

    // 1. Generate query vector embedding
    const queryVector = await embeddingService.embedQuery(cleanQuery);

    // 2. Perform ANN cosine similarity search in Qdrant
    return await this.searchSimilarByVector(queryVector, topK, filter);
  }

  /**
   * Performs similarity search directly with a pre-computed vector embedding.
   *
   * @param queryVector High-dimensional vector representation
   * @param topK Number of nearest neighbors to retrieve
   * @param filter Optional metadata filter (e.g. limit to documentId)
   * @returns Array of matching LangChain Documents
   */
  public async searchSimilarByVector(
    queryVector: number[],
    topK: number,
    filter?: VectorSearchFilter,
  ): Promise<Document<ChunkMetadata>[]> {
    const searchResults = await this.repository.searchByVector(
      queryVector,
      topK,
      filter,
    );

    return searchResults.map((result) => {
      const enrichedMetadata: ChunkMetadata = {
        ...result.record.metadata,
        score: result.score,
      };

      
      return new Document<ChunkMetadata>({
        pageContent: result.record.text, // stored text of the similar chunk
        metadata: enrichedMetadata, // metadata of the similar chunk
      });
    });
  }

  /**
   * Removes all vector chunks associated with a document from Qdrant.
   *
   * @param documentId Unique identifier of the document
   */
  public async deleteDocumentChunks(documentId: string): Promise<boolean> {
    console.log(
      `[VectorStoreService] Deleting all chunks for documentId: "${documentId}"`,
    );

    return await this.repository.deleteByDocumentId(documentId);
  }
}

export const vectorStoreService = new VectorStoreService();
