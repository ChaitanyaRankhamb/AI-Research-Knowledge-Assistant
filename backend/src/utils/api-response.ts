import { Response } from "express";

export const successResponse = (
  res: Response,
  message: string,
  data: unknown = null,
  statusCode = 200,
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const failureResponse = (
  res: Response,
  message: string,
  statusCode = 400,
  errors: unknown = null,
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};