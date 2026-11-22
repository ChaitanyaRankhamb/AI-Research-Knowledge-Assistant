import multer from "multer";
import type { RequestHandler } from "express";

const maxFileSize = 10 * 1024 * 1024; // maximum file size of 10 MB in bytes
const upload = multer({
  storage: multer.memoryStorage(), // store the file in memory
  limits: {
    fileSize: maxFileSize - 1,
    files: 1, // limit to one file at a time
  },
});

const parseDocument = upload.single("document");

const documentUpload: RequestHandler = (req, res, next) => {
  parseDocument(req, res, (error: unknown) => {
    // Handle Multer errors
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Document must be smaller than 10 MB." });
        return;
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        res
          .status(400)
          .json({
            error: "Upload exactly one file using the 'document' field.",
          });
        return;
      }

      res.status(400).json({ error: error.message });
      return;
    }

    // Handle other errors
    if (error) {
      next(error);
      return;
    }

    // If no errors, proceed to the next middleware or route handler
    console.log("Document upload successful:", req.file);
    next();
  });
};

export default documentUpload;
