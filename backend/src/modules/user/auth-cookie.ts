import type { CookieOptions, Response } from "express";

export const ACCESS_TOKEN_COOKIE_NAME = "accessToken";
export const ACCESS_TOKEN_COOKIE_MAX_AGE = 30 * 60 * 1000;
export const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";
export const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};

export const accessTokenCookieOptions: CookieOptions = {
  ...authCookieOptions,
  path: "/",
};

export const refreshTokenCookieOptions: CookieOptions = {
  ...authCookieOptions,
  path: "/",
};

export const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) => {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, {
    ...accessTokenCookieOptions,
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
  });
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, {
    ...refreshTokenCookieOptions,
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
  });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, accessTokenCookieOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, refreshTokenCookieOptions);
};
