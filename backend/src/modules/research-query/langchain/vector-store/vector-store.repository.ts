import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";
import type {
  VectorDocumentRecord,
  VectorSearchFilter,
  VectorSearchResult,
} from "./vector-document.model";
import type { ChunkMetadata } from "../text-splitter";

dotenv.config();

/**
 * Step 4 (Data Access Layer): Qdrant Vector Store Repository
 *
 * Direct database integration with Qdrant for storing embeddings,
 * vector indexing, metadata filtering, and cosine similarity queries.
 */
export class VectorStoreRepository {
  private readonly client: QdrantClient;
  private readonly collectionName: string;
  private isCollectionInitialized = false;

  constructor() {
    const url = process.env.QDRANT_URL;
    if (!url) {
      throw new Error("QDRANT_URL is not set");
    }

    const apiKey = process.env.QDRANT_API_KEY;
    if (!apiKey) {
      throw new Error("QDRANT_API_KEY is not set");
    }

    this.client = new QdrantClient({
      url,
      apiKey,
      checkCompatibility: false,
    });

    const collectionName = process.env.QDRANT_COLLECTION_NAME;
    if (!collectionName) {
      throw new Error("QDRANT_COLLECTION_NAME is not set");
    }
    
    this.collectionName = collectionName;
  }

  public async ensureCollectionExists(vectorSize = 3072): Promise<void> {
    if (this.isCollectionInitialized) return;

    try {
      const exists = await this.client.collectionExists(this.collectionName);

      if (!exists) {
        console.log(
          `[VectorStoreRepository] Collection "${this.collectionName}" not found. Creating with dimension ${vectorSize}...`,
        );

        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: vectorSize,
            distance: "Cosine",
          },
        });

        console.log(
          `[VectorStoreRepository] Collection "${this.collectionName}" created successfully.`,
        );
      } else {
        // Verify that the collection actually has a valid vector configuration
        const info = await this.client.getCollection(this.collectionName);
        const vectorsConfig = info?.config?.params?.vectors;

        if (!vectorsConfig || Object.keys(vectorsConfig).length === 0) {
          console.warn(
            `[VectorStoreRepository] Collection "${this.collectionName}" exists but has empty vector configuration. Recreating with dimension ${vectorSize}...`,
          );

          await this.client.recreateCollection(this.collectionName, {
            vectors: {
              size: vectorSize,
              distance: "Cosine",
            },
          });
        }
      }

      this.isCollectionInitialized = true;
    } catch (error) {
      console.error(
        `[VectorStoreRepository] Failed to verify or create collection "${this.collectionName}":`,
        error,
      );
      throw error;
    }
  }

  /**
   * Persists an array of vector records into Qdrant.
   *
   * @param records Array of VectorDocumentRecord items to insert
   */
  public async saveChunks(records: VectorDocumentRecord[]): Promise<void> {
    if (!records || records.length === 0) {
      return;
    }

    // Guard: Verify no record contains an empty vector
    const emptyVectorChunk = records.find(
      (r) => !r.vector || r.vector.length === 0,
    );
    if (emptyVectorChunk) {
      throw new Error(
        `Cannot store chunk "${emptyVectorChunk.id}" into Qdrant: vector array is empty. The embedding model failed to generate a vector.`,
      );
    }

    const vectorSize = records[0].vector.length;
    await this.ensureCollectionExists(vectorSize);

    console.log(
      `[VectorStoreRepository] Upserting ${records.length} chunk(s) (dimension: ${vectorSize}) into collection "${this.collectionName}"...`,
    );

    // create point schema
    const points = records.map((record) => ({
      id: record.id,
      vector: record.vector,
      payload: {
        documentId: record.documentId,
        text: record.text,
        ...record.metadata,
        createdAt: record.createdAt.toISOString(),
      },
    }));

    // store points into collection of qdrant
    await this.client.upsert(this.collectionName, {
      wait: true,
      points,
    });

    console.log(
      `[VectorStoreRepository] Successfully saved ${records.length} point(s) in Qdrant.`,
    );
  }

  /**
   * Performs an approximate nearest neighbor (ANN) cosine similarity search against stored vectors.
   *
   * @param queryEmbedding Vector representation of the search query
   * @param topK Number of nearest matching chunks to return
   * @param filter Optional metadata filter (e.g. limit to a specific documentId)
   * @returns Array of matching results ranked by similarity score
   */
  public async searchByVector(
    queryEmbedding: number[],
    topK: number,
    filter?: VectorSearchFilter,
  ): Promise<VectorSearchResult[]> {
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error("Search query vector cannot be empty.");
    }

    await this.ensureCollectionExists(queryEmbedding.length);

    console.log(
      `[VectorStoreRepository] Searching top ${topK} matches in "${this.collectionName}"...`,
    );

    // array used to filter qdrant points similar to query
    const mustConditions: Array<{ key: string; match: { value: unknown } }> =
      [];

    if (filter?.documentId) {
      mustConditions.push({
        key: "documentId",
        match: { value: filter.documentId },
      });
    }

    if (filter?.fileName) {
      mustConditions.push({
        key: "fileName",
        match: { value: filter.fileName },
      });
    }

    const qdrantFilter =
      mustConditions.length > 0 ? { must: mustConditions } : undefined;

    const response = await this.client.query(this.collectionName, {
      query: queryEmbedding,
      limit: topK,
      filter: qdrantFilter,
      with_payload: true, // tells qdrant to return metadata along with matching points/vectors
    });

    // store return points 
    const points = response.points || [];

    return points.map((point) => {
      const payload = (point.payload || {}) as Record<string, unknown>;

      // create metadata of the point
      const metadata: ChunkMetadata = {
        source: String(payload.source || payload.fileName || "unknown"),
        fileName: String(payload.fileName || "unknown"),
        fileSize: Number(payload.fileSize || 0),
        mimeType: String(payload.mimeType || "text/plain"),
        page: payload.page !== undefined ? Number(payload.page) : undefined,
        totalPages:
          payload.totalPages !== undefined
            ? Number(payload.totalPages)
            : undefined,
        chunkIndex: Number(payload.chunkIndex || 1),
        totalChunks: Number(payload.totalChunks || 1),
        characterCount: Number(payload.characterCount || 0),
      };

      const record: VectorDocumentRecord = {
        id: String(point.id),
        documentId: String(payload.documentId || ""),
        text: String(payload.text || ""),
        vector: [], // Vector data omitted from search result payload to save memory
        metadata,
        createdAt: payload.createdAt
          ? new Date(String(payload.createdAt))
          : new Date(),
      };

      // return record and similarity point score
      return {
        record,
        score: point.score,
      };
    });
  }

  /**
   * Retrieves all chunks belonging to a specific parent document.
   *
   * @param documentId Unique identifier of the uploaded document
   */
  public async findByDocumentId(
    documentId: string,
  ): Promise<VectorDocumentRecord[]> {
    await this.ensureCollectionExists();

    const result = await this.client.scroll(this.collectionName, {
      filter: {
        must: [
          {
            key: "documentId",
            match: { value: documentId },
          },
        ],
      },
      with_payload: true,
      with_vector: false,
      limit: 1000,
    });

    return (result.points || []).map((point) => {
      const payload = (point.payload || {}) as Record<string, unknown>;

      const metadata: ChunkMetadata = {
        source: String(payload.source || "unknown"),
        fileName: String(payload.fileName || "unknown"),
        fileSize: Number(payload.fileSize || 0),
        mimeType: String(payload.mimeType || "text/plain"),
        page: payload.page !== undefined ? Number(payload.page) : undefined,
        totalPages:
          payload.totalPages !== undefined
            ? Number(payload.totalPages)
            : undefined,
        chunkIndex: Number(payload.chunkIndex || 1),
        totalChunks: Number(payload.totalChunks || 1),
        characterCount: Number(payload.characterCount || 0),
      };

      return {
        id: String(point.id),
        documentId: String(payload.documentId || documentId),
        text: String(payload.text || ""),
        vector: [],
        metadata,
        createdAt: payload.createdAt
          ? new Date(String(payload.createdAt))
          : new Date(),
      };
    });
  }

  /**
   * Deletes all vector records associated with a specific document.
   *
   * @param documentId Unique identifier of the document to remove
   */
  public async deleteByDocumentId(documentId: string): Promise<boolean> {
    await this.ensureCollectionExists();

    console.log(
      `[VectorStoreRepository] Deleting chunks for documentId "${documentId}" from Qdrant...`,
    );

    await this.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [
          {
            key: "documentId",
            match: { value: documentId },
          },
        ],
      },
    });

    return true;
  }

  /**
   * Returns the total count of vector records stored in the collection.
   */
  public async count(): Promise<number> {
    await this.ensureCollectionExists();
    const result = await this.client.count(this.collectionName);
    return result.count;
  }
}

export const vectorStoreRepository = new VectorStoreRepository();
