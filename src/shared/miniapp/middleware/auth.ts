import type { Request, Response, NextFunction } from 'express';
import { sendErr } from './response';
import { loadUserIdByToken } from '../../../auth/RedisTokenStore';
import { gameLogger } from '../../../util/logger';
import { readWebSessionToken } from '../webSession';

export type MiniappRequest = Request & { authToken?: string; userId?: string };

function readBearerToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return undefined;
  return authorization.slice(7).trim() || undefined;
}

export async function authMiddleware(
  req: MiniappRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readBearerToken(req) ?? readWebSessionToken(req);
  if (!token) {
    gameLogger.info(`[auth] 401 Unauthorized: ${req.method} ${req.path ?? req.url} (no session)`);
    sendErr(res, 'Unauthorized', 401);
    return;
  }
  const userId = await loadUserIdByToken(token);
  if (!userId) {
    gameLogger.info(`[auth] 401 Invalid/expired token: ${req.method} ${req.path ?? req.url}`);
    sendErr(res, 'Invalid or expired token', 401);
    return;
  }
  req.authToken = token;
  req.userId = userId;
  next();
}
