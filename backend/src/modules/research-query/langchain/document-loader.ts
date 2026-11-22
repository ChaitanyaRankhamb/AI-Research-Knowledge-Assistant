import { Document } from "@langchain/core/documents";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export interface DocumentMetadata {
  source: string; //  it uses source to cite its references for the user.
  fileName: string; // original file name of the uploaded document
  fileSize: number; // file size in bytes
  mimeType: string;
  page?: number; // help from which page, the citation comes
  totalPages?: number; // Records the total page count of the original document
  [key: string]: unknown; // Allows chunking splitters to attach IDs without type conflicts
}

export class DocumentLoader {
  /**
   * Threshold for large documents: 2 MB (in bytes)
   */
  public static readonly LARGE_DOCUMENT_THRESHOLD_BYTES = 0.5 * 1024 * 1024; // 0.5 MB

  /**
   * Checks whether the uploaded file qualifies as a large document (> 0.5 MB)
   */
  public isLargeDocument(sizeInBytes: number): boolean {
    return sizeInBytes >= DocumentLoader.LARGE_DOCUMENT_THRESHOLD_BYTES;
  }

  /**
   * Step 1: Document Loader
   * Loads and extracts text content from an uploaded document buffer into
   * standard LangChain Document instances with rich metadata.
   *
   * @param file Express.Multer.File received from the upload middleware
   * @returns Array of LangChain Document instances
   */
  public async loadDocument(
    file: Express.Multer.File,
  ): Promise<Document<DocumentMetadata>[]> {
    if (!file || !file.buffer) {
      throw new Error("No document buffer provided for loading.");
    }

    const { mimetype, originalname, size, buffer } = file;

    console.log(
      `[Ingestion Pipeline: Step 1 - Document Loader] Loading 
      "${originalname}" 
      (${(size / (1024 * 1024)).toFixed(2)} MB, type: ${mimetype})`,
    );

    const baseMetadata: DocumentMetadata = {
      source: originalname,
      fileName: originalname,
      fileSize: size,
      mimeType: mimetype,
    };

    // 1. PDF Documents
    if (
      mimetype === "application/pdf" ||
      originalname.toLowerCase().endsWith(".pdf")
    ) {
      return await this.loadPdf(buffer, baseMetadata);
    }

    // 2. Word Documents (.docx, .doc)
    if (
      mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimetype === "application/msword" ||
      originalname.toLowerCase().endsWith(".docx") ||
      originalname.toLowerCase().endsWith(".doc")
    ) {
      return await this.loadWordDocument(buffer, baseMetadata);
    }

    // 3. Plain Text, Markdown, CSV, JSON
    if (
      mimetype.startsWith("text/") ||
      mimetype === "application/json" ||
      originalname.toLowerCase().endsWith(".txt") ||
      originalname.toLowerCase().endsWith(".md") ||
      originalname.toLowerCase().endsWith(".csv") ||
      originalname.toLowerCase().endsWith(".json")
    ) {
      return this.loadPlainText(buffer, baseMetadata);
    }

    // Fallback: Attempt UTF-8 plain text decoding
    return this.loadPlainText(buffer, baseMetadata);
  }

  /**
   * Direct Mode Extractor (< 0.5 MB)
   *
   * Extracts the full text from the uploaded document buffer directly into
   * a single formatted string, preserving page markers for LLM context injection.
   * This bypasses the text-splitter, embeddings, and vector store pipeline.
   *
   * @param file Express.Multer.File received from the upload middleware
   * @returns Formatted document text ready for LLM prompt context
   */
  public async extractRawText(file: Express.Multer.File): Promise<string> {
    console.log(
      `[Document Loader: Direct Mode] Extracting raw text from "${file.originalname}"...`,
    );

    const documents = await this.loadDocument(file);

    return documents
      .map((doc) => {
        const pageHeader = doc.metadata.page
          ? `--- [Page ${doc.metadata.page}${doc.metadata.totalPages ? ` of ${doc.metadata.totalPages}` : ""}] ---`
          : "";
        return pageHeader ? `${pageHeader}\n${doc.pageContent}` : doc.pageContent;
      })
      .join("\n\n");
  }

  /**
   * PDF Document Loader
   * Extracts text page-by-page to preserve pagination metadata for citation.
   */
  private async loadPdf(
    buffer: Buffer,
    baseMetadata: DocumentMetadata,
  ): Promise<Document<DocumentMetadata>[]> {
    // create a new parser instance for each PDF document
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const result = await parser.getText();
      const pages = result.pages || [];

      if (pages.length > 0) {
        return pages
          .filter((page) => page.text && page.text.trim().length > 0)
          .map(
            (page) =>
              new Document<DocumentMetadata>({
                pageContent: page.text.trim(),
                metadata: {
                  ...baseMetadata,
                  page: page.num,
                  totalPages: result.total,
                },
              }),
          );
      }

      // Fallback if pages array is not populated but total text exists
      if (result.text && result.text.trim().length > 0) {
        return [
          new Document<DocumentMetadata>({
            pageContent: result.text.trim(),
            metadata: {
              ...baseMetadata,
              page: 1,
              totalPages: 1,
            },
          }),
        ];
      }

      throw new Error(
        `Failed to extract text from PDF "${baseMetadata.fileName}". File might be empty or scanned images without OCR.`,
      );
    } finally {
      // it will destroy the parser instance to free up memory
      await parser.destroy();
    }
  }

  /**
   * Word Document Loader (.docx) using mammoth.
   * Converts to Markdown so headings, lists, tables, and emphasis survive,
   * then splits into page-sized Documents with the same citation metadata as PDFs.
   */
  private async loadWordDocument(
    buffer: Buffer,
    baseMetadata: DocumentMetadata,
  ): Promise<Document<DocumentMetadata>[]> {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value ? result.value.trim() : "";

    if (!text) {
      throw new Error(
        `Failed to extract text from Word document "${baseMetadata.fileName}". File might be empty.`,
      );
    }

    return [
      new Document<DocumentMetadata>({
        pageContent: text,
        metadata: baseMetadata,
      }),
    ];
  }

  /**
   * Plain text / Markdown / JSON Loader
   */
  private loadPlainText(
    buffer: Buffer,
    baseMetadata: DocumentMetadata,
  ): Document<DocumentMetadata>[] {
    const text = buffer.toString("utf-8").trim();

    if (!text) {
      throw new Error(`Document "${baseMetadata.fileName}" is empty.`);
    }

    return [
      new Document<DocumentMetadata>({
        pageContent: text,
        metadata: baseMetadata,
      }),
    ];
  }
}

export const documentLoader = new DocumentLoader();
