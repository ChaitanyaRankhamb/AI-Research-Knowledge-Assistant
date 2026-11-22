import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { researchSessionController } from "./research-session.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", researchSessionController.list.bind(researchSessionController));

router.get(
  "/:sessionId",
  researchSessionController.get.bind(researchSessionController),
);

router.patch(
  "/:sessionId",
  researchSessionController.rename.bind(researchSessionController),
);

router.delete(
  "/:sessionId",
  researchSessionController.delete.bind(researchSessionController),
);

export default router;
