import { Request, Response, NextFunction } from "express";
import { logoutService } from "../services/logout.service";
import { clearAuthCookies } from "../auth-cookie";
import { AuthRequest } from "../../../middlewares/auth.middleware";

/**
 * Controller to handle user logout requests
 */
export const logoutController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.userId;

    if (userId) {
      await logoutService(userId);
    }

    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    return next(error);
  }
};
