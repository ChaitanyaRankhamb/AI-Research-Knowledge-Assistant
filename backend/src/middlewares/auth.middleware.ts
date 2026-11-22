import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type JwtPayload } from "../utils/jwt.utils";
import redisClient from "../config/redis.connection";
import { userRepository } from "../database/mongo/user/userModelRepo";
import { User } from "../entities/user/user";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from "../modules/user/auth-cookie";

// Globally augment Express Request to include authenticated user details
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: User;
    }
  }
}

export type AuthRequest = Request;

const getAuthenticatedUser = async (req: Request) => {
  const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE_NAME] as
    | string
    | undefined;
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as
    | string
    | undefined;
  if (!accessToken || !refreshToken) return null;

  let payload: JwtPayload;
  try {
    payload = verifyAccessToken(accessToken);
  } catch {
    return null;
  }

  if (typeof payload === "string" || !payload.userId) return null;

  const [isBlacklisted, storedRefreshToken] = await Promise.all([
    redisClient.get(`blacklist:${accessToken}`),
    redisClient.get(`refresh:${payload.userId}`),
  ]);
  if (isBlacklisted || storedRefreshToken !== refreshToken) return null;

  const user = await userRepository.findUserById(payload.userId);
  if (!user) return null;

  return { userId: payload.userId, user };
};

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authenticated = await getAuthenticatedUser(req);
    if (!authenticated) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    req.userId = authenticated.userId;
    req.user = authenticated.user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware.
 * Attaches user and userId if valid authentication cookies are provided,
 * but allows the request to continue unhindered if no token is present.
 */
export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authenticated = await getAuthenticatedUser(req);
    if (authenticated) {
      req.userId = authenticated.userId;
      req.user = authenticated.user;
    }
    next();
  } catch (error) {
    next(error);
  }
};
