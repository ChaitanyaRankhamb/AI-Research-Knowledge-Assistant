import * as z from "zod";
import type { ChunkMetadata } from "../text-splitter";

/**
 * Zod validation schema for a single vector document record in Qdrant.
 */
export const VectorDocumentRecordSchema = z.object({
  id: z.string().uuid().or(z.string()),
  documentId: z.string(), // Groups all chunks from the same uploaded file
  text: z.string(), // The text content of the chunk
  vector: z.array(z.number()), // Numerical embedding vector
  metadata: z.record(z.string(), z.unknown()), // Source, fileName, page, totalPages, chunkIndex, etc.
  createdAt: z.date().default(() => new Date()),
});

/**
 * TypeScript interface representing a single vector record in the database.
 */
export interface VectorDocumentRecord {
  id: string; // Unique primary key for the chunk (UUID string)
  documentId: string; // Identifies the parent uploaded document
  text: string; // Chunk text content
  vector: number[]; // High-dimensional numerical vector
  metadata: ChunkMetadata; // Rich citation & provenance metadata
  createdAt: Date; // Timestamp when chunk was indexed
}

/**
 * Filter parameters for querying vector chunks.
 */
export interface VectorSearchFilter {
  documentId?: string;
  fileName?: string;
  mimeType?: string;
  [key: string]: unknown;
}

/**
 * Represents the search result returned from similarity search.
 */
export interface VectorSearchResult {
  record: VectorDocumentRecord;
  score: number; // Similarity score (e.g., Cosine similarity 0.0 - 1.0)
}
