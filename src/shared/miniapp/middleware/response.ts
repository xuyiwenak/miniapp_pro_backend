import type { Response } from 'express';

export function sendSucc(res: Response, data?: unknown): void {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
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
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.status(code).json({
    code,
    success: false,
    message,
  });
}
