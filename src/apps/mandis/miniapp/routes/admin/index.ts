import { Router, Response } from 'express';
import { adminAuthMiddleware, type AdminRequest } from '../../middleware/adminAuth';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { ComponentManager } from '../../../../../common/BaseComponent';
import type { PlayerComponent } from '../../../../../component/PlayerComponent';
import { getPlayerModel } from '../../../../../dbservice/model/ZoneDBModel';
import { gameLogger as logger } from '../../../../../util/logger';
import statsRouter from './stats';
import usersRouter from './users';
import worksRouter from './works';
import feedbackRouter from './feedback';
import systemRouter from './system';

const router = Router();

// 禁用所有 admin API 响应的 HTTP 缓存（防止 304）
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Expires', '0');
  res.set('Pragma', 'no-cache');
  next();
});

// 所有 /admin/* 路由都需要管理员身份
router.use(adminAuthMiddleware);

/** GET /admin/me — 获取当前管理员信息 */
router.get('/me', async (req: AdminRequest, res: Response) => {
  try {
    const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
    const zoneId = playerComp?.getDefaultZoneId();
    if (!zoneId) { sendErr(res, 'Server not ready', 503); return; }

    const Player = getPlayerModel(zoneId);
    const player = await Player.findOne({ userId: req.userId }).select('-password').lean().exec();
    if (!player) { sendErr(res, 'User not found', 404); return; }

    sendSucc(res, {
      userId: player.userId,
      account: player.account,
      nickname: player.nickname,
      level: player.level,
    });
  } catch (err) {
    logger.error('admin:me error', { userId: req.userId, error: (err as Error).message });
    sendErr(res, 'Failed to get admin info', 500);
  }
});

router.use('/stats', statsRouter);
router.use('/users', usersRouter);
router.use('/works', worksRouter);
router.use('/feedback', feedbackRouter);
router.use('/system', systemRouter);

export default router;
