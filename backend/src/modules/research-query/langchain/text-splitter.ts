import { Document } from "@langchain/core/documents";
import type { DocumentMetadata } from "./document-loader";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

/**
 * Metadata attached to each split chunk, extending the original DocumentMetadata.
 */
export interface ChunkMetadata extends DocumentMetadata {
  chunkIndex: number; // 1-based order index of this chunk in the document
  totalChunks: number; // Total number of chunks produced from the document
  characterCount: number; // Character count of this chunk
}

/**
 * Configuration options for the text splitter.
 */
export interface TextSplitterConfig {
  chunkSize: number; // Maximum size of each text chunk (in characters)
  chunkOverlap: number; // Overlapping character count between consecutive chunks
  separators?: string[]; // Optional custom hierarchy of separators
}

/**
 * Step 2: Text Splitter / Chunking Service
 *
 * Breaks large documents into smaller, semantically coherent chunks
 * suitable for embedding models and vector retrieval.
 */
export class TextSplitterService {
  /**
   * Default chunk size in characters.
   * Suitable for standard LLM context windows and embedding models.
   */
  public static readonly DEFAULT_CHUNK_SIZE = 4000; 

  /**
   * Default overlap in characters.
   * Ensures semantic continuity between adjacent chunks so context is not lost at boundaries.
   */
  public static readonly DEFAULT_CHUNK_OVERLAP = 200;

  /**
   * Creates an instance of RecursiveCharacterTextSplitter configured with options or defaults.
   */
  private createSplitter(
    config?: Partial<TextSplitterConfig>,
  ): RecursiveCharacterTextSplitter {
    const chunkSize =
      config?.chunkSize ?? TextSplitterService.DEFAULT_CHUNK_SIZE;
    const chunkOverlap =
      config?.chunkOverlap ?? TextSplitterService.DEFAULT_CHUNK_OVERLAP;

    if (chunkOverlap >= chunkSize) {
      throw new Error(
        `chunkOverlap (${chunkOverlap}) must be strictly smaller than chunkSize (${chunkSize}).`,
      );
    }

    return new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: config?.separators,
    });
  }

  /**
   * Step 2 Method: Split raw loaded documents into chunks.
   *
   * @param documents Array of raw documents from DocumentLoader
   * @param config Optional custom chunk size and overlap
   * @returns Array of chunked LangChain Documents with ChunkMetadata
   */
  public async splitDocuments(
    documents: Document<DocumentMetadata>[],
    config?: Partial<TextSplitterConfig>,
  ): Promise<Document<ChunkMetadata>[]> {
    if (!documents || documents.length === 0) {
      console.warn(
        "[Ingestion Pipeline: Step 2 - Text Splitter] No documents provided to split.",
      );
      return [];
    }

    console.log(
      `[Ingestion Pipeline: Step 2 - Text Splitter] Splitting ${documents.length} document(s)...`,
    );

    const splitter = this.createSplitter(config);
    const rawSplits = await splitter.splitDocuments(documents); // it will split the document into chunks.
    const totalChunks = rawSplits.length;

    console.log(
      `[Ingestion Pipeline: Step 2 - Text Splitter] Successfully created ${totalChunks} chunk(s).`,
    );

     return rawSplits.map((split, index) => {
      const metadata: ChunkMetadata = {
        ...(split.metadata as DocumentMetadata), // 1. Preserve original metadata
        chunkIndex: index + 1,                   // 2. Add 1-based sequential position
        totalChunks,                             // 3. Total chunk count
        characterCount: split.pageContent.length,// 4. Chunk character length
      };

      return new Document<ChunkMetadata>({       // 5. Wrap in strongly-typed Document
        pageContent: split.pageContent,
        metadata,
      });
    });
  }

  /**
   * Helper method to split raw text string directly without Document wrapper.
   *
   * @param text Raw text string
   * @param config Optional custom chunk size and overlap
   * @returns Array of chunked text strings
   */
  public async splitText(
    text: string,
    config?: Partial<TextSplitterConfig>,
  ): Promise<string[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    console.log(
      `[Ingestion Pipeline: Step 2 - Text Splitter] Splitting raw text string (${text.length} characters)...`,
    );

    const splitter = this.createSplitter(config);
    return await splitter.splitText(text);
  }
}

export const textSplitterService = new TextSplitterService();
