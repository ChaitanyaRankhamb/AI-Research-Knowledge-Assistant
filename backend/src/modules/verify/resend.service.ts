import { userRepository } from "../../database/mongo/user/userModelRepo";
import { AppError } from "../../Error/appError";
import { generateVerifyExpiry } from "../../utils/generateVerifyExpiry";
import { generateVerifyCode } from "../../utils/generateVerifyCode";
import { sendVerificationNotification } from "../../utils/sendVerificationNotification";

export const resendService = async (email: string) => {
  // 1. Find user by email
  const user = await userRepository.findUserByEmail(email);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  // 2. Check if user is already verified
  if (user.isEmailVerified()) {
    throw new AppError("Email is already verified", 400);
  }

  // 3. Generate a new verification code and expiry
  // generate random 6 digit number
  const verifyCode = await generateVerifyCode();

  // apply the verification expiry (15 minutes)
  const verifyExpiry = await generateVerifyExpiry();

  // 4. Update the user entity with new verification data
  user.setVerification(verifyCode, verifyExpiry);

  // 5. Update the user record in the database
  await userRepository.updateUser(user);

  // 6. Trigger the configured Novu workflow to send the verification code
  await sendVerificationNotification(user, verifyCode);

  return {
    message: "A new verification code has been sent to your email",
  };
};
