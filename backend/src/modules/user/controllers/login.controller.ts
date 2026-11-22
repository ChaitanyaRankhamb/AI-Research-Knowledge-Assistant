import { Request, Response, NextFunction } from "express";
import { loginService } from "../services/login.service";
import { loginValidation } from "../../../validations/user.login.validation";
import { setAuthCookies } from "../auth-cookie";

/**
 * Controller to handle user login requests and set tokens
 */
export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // extract email from req body
    const { email } = req.body;

    // validate email
    const validation = await loginValidation(email);

    console.log("validated Email", validation);

    // take user and access token form service
    const { user, accessToken, refreshToken } = await loginService(
      validation.email,
    );

    setAuthCookies(res, { accessToken, refreshToken });

    // send response to frontend
    res.status(200).json({
      success: true,
      message: "Logged in successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    // error handling middleware return the error
    next(error);
  }
};
