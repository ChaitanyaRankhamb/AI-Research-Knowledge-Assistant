import { novu } from "../config/novu.config";
import { AppError } from "../Error/appError";
import { User } from "../entities/user/user";

const APP_NAME = "AI Research & Knowledge Assistant";
const VERIFICATION_EXPIRY_MINUTES = 15;

export const sendVerificationNotification = async (
  user: User,
  verificationCode: number,
) => {
  const workflowId = process.env.NOVU_WORKFLOW_ID;

  if (!workflowId) {
    throw new AppError("Novu verification workflow is not configured.", 500);
  }

  if (!novu) {
    throw new AppError("Novu notification service is not configured.", 503);
  }

  try {
    await novu.trigger({
      workflowId,
      to: {
        subscriberId: user.id.toString(),
        email: user.getEmail(),
        firstName: user.getUsername() || "User",
      },
      payload: {
        username: user.getUsername() || "User",
        verificationCode,
        appName: APP_NAME,
        expirationMinutes: VERIFICATION_EXPIRY_MINUTES,
      },
    });
  } catch (error) {
    console.error("[Novu] Failed to trigger verification workflow:", error);
    throw new AppError(
      "Failed to send verification email. Please try again.",
      502,
    );
  }
};
