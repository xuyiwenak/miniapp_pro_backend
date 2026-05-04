import type { Request, Response, NextFunction } from 'express';
import { sendErr } from './response';
import { loadUserIdByToken } from '../../../auth/RedisTokenStore';
import { gameLogger } from '../../../util/logger';

export type MiniappRequest = Request & { userId?: string };

export async function authMiddleware(
  req: MiniappRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    gameLogger.info(`[auth] 401 Unauthorized: ${req.method} ${req.path ?? req.url} (no Bearer token)`);
    sendErr(res, 'Unauthorized', 401);
    return;
  }
  const token = auth.slice(7).trim();
  const userId = await loadUserIdByToken(token);
  if (!userId) {
    gameLogger.info(`[auth] 401 Invalid/expired token: ${req.method} ${req.path ?? req.url}`);
    sendErr(res, 'Invalid or expired token', 401);
    return;
  }
  req.userId = userId;
  next();
}
