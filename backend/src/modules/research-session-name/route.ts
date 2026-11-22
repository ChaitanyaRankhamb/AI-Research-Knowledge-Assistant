import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { researchSessionNameController } from "./research-session-name.controller";

const router = Router();

router.post(
  "/research-session-name",
  authMiddleware,
  researchSessionNameController.handleGenerateName,
);

export default router;
