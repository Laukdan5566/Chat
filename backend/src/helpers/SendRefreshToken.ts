import { CookieOptions, Response } from "express";

export const SendRefreshToken = (res: Response, token: string): void => {
  const backendUrl = process.env.BACKEND_URL || "";
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  };

  if (backendUrl.startsWith("https:") || process.env.REQUIRE_HTTPS === "true") {
    cookieOptions.sameSite = "none";
    cookieOptions.secure = true;
  }

  res.cookie("jrt", token, cookieOptions);
};
