import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

const envFile =
  process.env.NODE_ENV === "production"
    ? new URL("../../.env.production", import.meta.url)
    : new URL("../../.env", import.meta.url);

// Load environment variables from the appropriate .env file
dotenv.config({ path: fileURLToPath(envFile) });

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const JWT_ACCESS_EXPIRES_IN = "30m";
const JWT_REFRESH_EXPIRES_IN = "7d";

if (!JWT_ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET is not defined");
}

if (!JWT_REFRESH_SECRET) {
  throw new Error("JWT_REFRESH_SECRET is not defined");
}

export interface JwtPayload {
  userId: string;
  email: string;
}

/**
 * Generate Access Token (Short-lived)
 */
export const generateAccessToken = (payload: JwtPayload) => {
  return jwt.sign(payload, JWT_ACCESS_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  });
};

/**
 * Generate Refresh Token (Long-lived)
 */
export const generateRefreshToken = (payload: JwtPayload) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
};

/**
 * Verify Access Token
 */
export const verifyAccessToken = (token: string) => {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET) as JwtPayload;
  } catch (error) {
    throw new Error("Invalid or expired access token");
  }
};

/**
 * Verify Refresh Token
 */
export const verifyRefreshToken = (token: string) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }
};