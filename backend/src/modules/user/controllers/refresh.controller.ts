import { Request, Response, NextFunction } from "express";
import { refreshService } from "../services/refresh.service";
import {
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE_NAME,
  setAuthCookies,
} from "../auth-cookie";
import { AppError } from "../../../Error/appError";

/**
 * Controller to handle token refresh requests.
 * The refresh token is stored in an HTTP-only cookie and rotated on use.
 */
export const refreshController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
    if (!refreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: "Refresh token missing",
      });
    }

    const tokens = await refreshService(refreshToken);
    setAuthCookies(res, tokens);

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }
    return next(error);
  }
};
