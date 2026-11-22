import { userRepository } from "../../../database/mongo/user/userModelRepo";
import { AppError } from "../../../Error/appError";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  type JwtPayload,
} from "../../../utils/jwt.utils";
import redisClient from "../../../config/redis.connection";

/**
 * Handles token refresh logic
 * 1. Verifies the provided refresh token
 * 2. Checks if it matches the one in Redis
 * 3. Generates new tokens and updates Redis
 */
export const refreshService = async (refreshToken: string) => {
  let decoded: JwtPayload;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid refresh token", 401);
  }

  const user = await userRepository.findUserById(decoded.userId);
  const storedToken = await redisClient.get(`refresh:${decoded.userId}`);
  if (!user || storedToken !== refreshToken) {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const accessToken = generateAccessToken({
    userId: user.id.toString(),
    email: user.getEmail(),
  });
  const newRefreshToken = generateRefreshToken({
    userId: user.id.toString(),
    email: user.getEmail(),
  });

  await redisClient.set(`refresh:${user.id}`, newRefreshToken, {
    EX: 7 * 24 * 60 * 60,
  });

  return { accessToken, refreshToken: newRefreshToken };
};
