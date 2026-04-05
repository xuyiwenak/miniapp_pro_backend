import type { Response } from "express";

export function sendSucc(res: Response, data?: unknown): void {
  res.status(200).json({
    code: 200,
    success: true,
    ...(data !== undefined && { data }),
  });
}

export function sendErr(
  res: Response,
  message: string,
  code: number = 400
): void {
  res.status(200).json({
    code,
    success: false,
    message,
  });
}
