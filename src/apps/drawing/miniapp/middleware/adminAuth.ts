import type { Request, Response, NextFunction } from "express";
import { sendErr } from "../../../../shared/miniapp/middleware/response";
import { loadUserIdByToken } from "../../../../auth/RedisTokenStore";
import { ComponentManager } from "../../../../common/BaseComponent";
import type { PlayerComponent } from "../../../../component/PlayerComponent";
import { getPlayerModel } from "../../../../dbservice/model/ZoneDBModel";
import { AccountLevel } from "../../../../shared/enum/AccountLevel";
import { gameLogger } from "../../../../util/logger";

export type AdminRequest = Request & { userId?: string; userLevel?: AccountLevel };

/** 验证 Bearer token 并校验账号等级 <= Admin (2)，否则返回 401/403 */
export async function adminAuthMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // 统一从 Authorization: Bearer <token> 读取登录态
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    sendErr(res, "Unauthorized", 401);
    return;
  }
  const token = auth.slice(7).trim();
  const userId = await loadUserIdByToken(token);
  if (!userId) {
    sendErr(res, "Invalid or expired token", 401);
    return;
  }

  const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>("PlayerComponent");
  if (!playerComp) {
    sendErr(res, "Server not ready", 503);
    return;
  }
  const zoneId = playerComp.getDefaultZoneId();
  if (!zoneId) {
    sendErr(res, "Server not ready", 503);
    return;
  }

  try {
    const Player = getPlayerModel(zoneId);
    // 账号等级约定：数值越小权限越高（SuperAdmin=1, Admin=2, ...）
    const player = await Player.findOne({ userId }).select("level").lean().exec();
    if (!player) {
      sendErr(res, "User not found", 404);
      return;
    }
    if (player.level > AccountLevel.Admin) {
      sendErr(res, "Forbidden: admin only", 403);
      return;
    }
    req.userId = userId;
    req.userLevel = player.level;
    // 鉴权成功后把 user 信息挂到 req，供后续路由复用
    next();
  } catch (err) {
    gameLogger.error("adminAuthMiddleware exception", err);
    sendErr(res, "Internal server error", 500);
  }
}

/** 仅超级管理员 (level=1) 可通过 */
export function requireSuperAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.userLevel !== AccountLevel.SuperAdmin) {
    sendErr(res, "Forbidden: super admin only", 403);
    return;
  }
  next();
}
