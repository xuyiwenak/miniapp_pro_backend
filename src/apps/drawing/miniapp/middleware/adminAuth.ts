import type { Request, Response, NextFunction } from 'express';
import { sendErr } from '../../../../shared/miniapp/middleware/response';
import { loadUserIdByToken } from '../../../../auth/RedisTokenStore';
import { ComponentManager } from '../../../../common/BaseComponent';
import type { PlayerComponent } from '../../../../component/PlayerComponent';
import { getPlayerModel } from '../../../../dbservice/model/ZoneDBModel';
import { AccountLevel } from '../../../../shared/enum/AccountLevel';
import { gameLogger } from '../../../../util/logger';

export type AdminRequest = Request & { userId?: string; userLevel?: AccountLevel };

async function extractUserId(req: AdminRequest, res: Response): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) { sendErr(res, 'Unauthorized', 401); return null; }
  const userId = await loadUserIdByToken(auth.slice(7).trim());
  if (!userId) { sendErr(res, 'Invalid or expired token', 401); return null; }
  return userId;
}

function resolveZoneId(res: Response): string | null {
  const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
  if (!playerComp) { sendErr(res, 'Server not ready', 503); return null; }
  const zoneId = playerComp.getDefaultZoneId();
  if (!zoneId) { sendErr(res, 'Server not ready', 503); return null; }
  return zoneId;
}

/** 验证 Bearer token 并校验账号等级 <= Admin (2)，否则返回 401/403 */
export async function adminAuthMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = await extractUserId(req, res);
  if (!userId) return;
  const zoneId = resolveZoneId(res);
  if (!zoneId) return;
  try {
    const Player = getPlayerModel(zoneId);
    const player = await Player.findOne({ userId }).select('level').lean().exec();
    if (!player) { sendErr(res, 'User not found', 404); return; }
    if (player.level > AccountLevel.Admin) { sendErr(res, 'Forbidden: admin only', 403); return; }
    req.userId = userId;
    req.userLevel = player.level;
    next();
  } catch (err) {
    gameLogger.error('adminAuthMiddleware exception', err);
    sendErr(res, 'Internal server error', 500);
  }
}

/** 仅超级管理员 (level=1) 可通过 */
export function requireSuperAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.userLevel !== AccountLevel.SuperAdmin) {
    sendErr(res, 'Forbidden: super admin only', 403);
    return;
  }
  next();
}
