import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { minioClient, BUCKET_NAME } from "../../../config/minio.config";
import { UserId } from "../../../entities/user/userId";
import { userRepository } from "../../../database/mongo/user/userModelRepo";

dotenv.config();

export interface FileUploadResultData {
  bucketName: string;
  objectName: string;
  fileHash: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  isDuplicate: boolean;
  skipped: boolean;
}

export interface FileServiceResponse {
  success: boolean;
  message: string;
  data?: FileUploadResultData;
}

/**
 * Service class managing file interactions with MinIO object storage.
 * Follows class architecture and supports content-based deduplication before upload.
 */
export class FileService {
  private readonly client = minioClient;
  private readonly bucketName: string =
    BUCKET_NAME ??
    (() => {
      throw new Error(
        "MINIO_BUCKET_NAME is not defined in the environment variables.",
      );
    })();
  /**
   * Computes SHA-256 hash of a file buffer to uniquely identify its content.
   */
  public computeFileHash(buffer: Buffer): string {
    const hash = createHash("sha256");
    hash.update(buffer);
    return hash.digest("hex");
  }

  /**
   * Checks whether an object with a specific key exists in the MinIO bucket.
   */
  public async checkObjectExists(
    bucket: string,
    objectName: string,
  ): Promise<boolean> {
    try {
      await this.client.statObject(bucket, objectName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if an identical file (by hash) has already been stored for this user in MinIO.
   * Scans objects under the user's namespace prefix to verify deduplication.
   */
  public async findExistingFileByHash(
    bucket: string,
    userIdStr: string,
    fileHash: string,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const prefix = `${userIdStr}/${fileHash}_`;
      const stream = this.client.listObjectsV2(bucket, prefix, false);

      let foundObjectName: string | null = null;

      stream.on("data", (obj) => {
        if (obj && obj.name) {
          foundObjectName = obj.name;
        }
      });

      stream.on("error", (err) => {
        console.warn(
          `[FileService] Warning listing objects for prefix ${prefix}:`,
          err.message,
        );
        resolve(null);
      });

      stream.on("end", () => {
        resolve(foundObjectName);
      });
    });
  }

  /**
   * Uploads an uploaded document to MinIO cloud storage.
   * If the document already exists in the bucket (verified via content hash),
   * the upload is skipped to save bandwidth and storage.
   *
   * @param userId - ID of the user uploading the document
   * @param document - Express Multer file in memory
   * @returns FileServiceResponse containing upload status and object metadata
   */
  public async uploadDocument(
    userId: UserId | string,
    document: Express.Multer.File,
  ): Promise<FileServiceResponse> {
    try {
      const user = await userRepository.findUserById(userId.toString());
      if (!user) {
        return {
          success: false,
          message: "User not found. Upload aborted.",
        };
      }

      // 1. Validate file presence and buffer
      if (!document || !document.buffer || document.buffer.length === 0) {
        return {
          success: false,
          message: "No document provided or document buffer is empty.",
        };
      }

      const userIdStr =
        typeof userId === "string" ? userId : userId.toString();
      const originalName = document.originalname || "document";

      // 2. Generate SHA-256 hash for deduplication
      const fileHash = this.computeFileHash(document.buffer);
      if (!fileHash || fileHash.length !== 64) {
        return {
          success: false,
          message: "Invalid SHA-256 hash computed. Upload aborted.",
        };
      }

      // Sanitize filename to prevent directory traversal or invalid S3 characters
      const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const targetObjectName = `${userIdStr}/${fileHash}_${sanitizedName}`;

      // 3. Check if exact target object exists in MinIO bucket
      const exactExists = await this.checkObjectExists(
        this.bucketName,
        targetObjectName,
      );

      if (exactExists) {
        console.log(
          `[FileService] Document '${originalName}' (hash: ${fileHash}) already exists at '${targetObjectName}'. Skipping MinIO upload.`,
        );

        return {
          success: true,
          message: "Document already exists in MinIO storage. Upload skipped.",
          data: {
            bucketName: this.bucketName,
            objectName: targetObjectName,
            fileHash,
            originalName,
            sizeBytes: document.size,
            mimeType: document.mimetype,
            isDuplicate: true,
            skipped: true,
          },
        };
      }

      // 4. Check if any file with the same content hash exists for this user (deduplication)
      const existingHashObject = await this.findExistingFileByHash(
        this.bucketName,
        userIdStr,
        fileHash,
      );

      if (existingHashObject) {
        console.log(
          `[FileService] Identical document content (hash: ${fileHash}) already exists at '${existingHashObject}'. Skipping MinIO upload.`,
        );

        return {
          success: true,
          message:
            "Identical document content already exists in MinIO storage. Upload skipped.",
          data: {
            bucketName: this.bucketName,
            objectName: existingHashObject,
            fileHash,
            originalName,
            sizeBytes: document.size,
            mimeType: document.mimetype,
            isDuplicate: true,
            skipped: true,
          },
        };
      }

      // 5. Upload document buffer to MinIO bucket
      await this.client.putObject(
        this.bucketName,
        targetObjectName,
        document.buffer,
        document.size,
        {
          "Content-Type": document.mimetype || "application/octet-stream",
          "x-amz-meta-file-hash": fileHash,
          "x-amz-meta-original-name": encodeURIComponent(originalName),
          "x-amz-meta-user-id": userIdStr,
          "x-amz-meta-uploaded-at": new Date().toISOString(),
        },
      );

      console.log(
        `[FileService] Successfully uploaded document '${originalName}' to MinIO at '${targetObjectName}'.`,
      );

      return {
        success: true,
        message: "Document uploaded to MinIO storage successfully.",
        data: {
          bucketName: this.bucketName,
          objectName: targetObjectName,
          fileHash,
          originalName,
          sizeBytes: document.size,
          mimeType: document.mimetype,
          isDuplicate: false,
          skipped: false,
        },
      };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      console.error(
        `[FileService] Error uploading document to MinIO:`,
        errorMessage,
      );

      return {
        success: false,
        message: `MinIO upload error: ${errorMessage}`,
      };
    }
  }

  /**
   * Retrieves a readable stream for a document stored in MinIO.
   */
  public async getDocumentStream(objectName: string) {
    return this.client.getObject(this.bucketName, objectName);
  }

  /**
   * Deletes a document from MinIO.
   */
  public async deleteDocument(objectName: string): Promise<boolean> {
    try {
      await this.client.removeObject(this.bucketName, objectName);
      return true;
    } catch (err) {
      console.error(`[FileService] Error deleting object ${objectName}:`, err);
      return false;
    }
  }
}

// Export singleton instance conforming to project patterns
export const fileService = new FileService();
