import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import documentUpload from "../../middlewares/document-upload.middleware";
import { researchQueryController } from "./research-query.controller";

const router = Router();

router.post(
  "/research-query",
  authMiddleware,
  documentUpload,
  researchQueryController.handleResearchQuery.bind(researchQueryController),
);

export default router;
