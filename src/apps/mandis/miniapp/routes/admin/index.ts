import { Router, Request, Response } from 'express';
import { mandisAdminJwtAuth } from '../mandisAdmin/auth';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
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

// 所有 /mandis-admin/* 路由都需要 JWT 管理员身份
router.use(mandisAdminJwtAuth);

/** GET /mandis-admin/me — 获取当前管理员信息 */
router.get('/me', (req: Request, res: Response) => {
  if (!req.mandisAdmin) {
    sendErr(res, 'Unauthorized', 401);
    return;
  }
  logger.debug(`[mandis-admin] me: ${req.mandisAdmin.username}`);
  sendSucc(res, {
    adminId:  req.mandisAdmin.adminId,
    username: req.mandisAdmin.username,
  });
});

router.use('/stats',    statsRouter);
router.use('/users',    usersRouter);
router.use('/works',    worksRouter);
router.use('/feedback', feedbackRouter);
router.use('/system',   systemRouter);

export default router;
