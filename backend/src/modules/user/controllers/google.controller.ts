import { Request, Response, NextFunction } from "express";
import { handleGoogleLoginService } from "../services/google.service";
import { User } from "../../../entities/user/user";
import { AppError } from "../../../Error/appError";
import { setAuthCookies } from "../auth-cookie";

export interface googleResponse {
  status: number;
  message: string;
  data: {
    accessToken: string;
    refreshToken: string;
  };
}

export const googleCallbackController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user as User;

    if (!user) {
      throw new AppError("User not found from passport", 400);
    }

    const tokens = await handleGoogleLoginService(user);
    setAuthCookies(res, tokens);

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    return res.redirect(frontendUrl);
  } catch (error) {
    next(error);
  }
};
