import { createSystemRouter } from '../../../../../shared/routes/systemAdmin';
import { requireSuperAdmin, type AdminRequest } from '../../middleware/adminAuth';
import { sendSucc, sendErr }  from '../../../../../shared/miniapp/middleware/response';
import { getHealDailyLimit, setHealDailyLimit } from '../../../../../auth/RedisTokenStore';
import type { Response }      from 'express';

// 公共系统路由（metrics / containers / 容器控制 / nginx / 日志）
const router = createSystemRouter(requireSuperAdmin);

// ── mandis 专属：heal 限额配置 ───────────────────────────────────────────────

router.get('/config', async (_req: AdminRequest, res: Response) => {
  try { sendSucc(res, { healDailyLimit: await getHealDailyLimit() }); }
  catch (e) { sendErr(res, String(e), 500); }
});

router.patch('/config', requireSuperAdmin, async (req: AdminRequest, res: Response) => {
  const { healDailyLimit } = req.body as { healDailyLimit?: unknown };
  if (typeof healDailyLimit !== 'number' || !Number.isInteger(healDailyLimit) || healDailyLimit < 0) {
    sendErr(res, 'healDailyLimit must be a non-negative integer', 400);
    return;
  }
  try { await setHealDailyLimit(healDailyLimit); sendSucc(res, { healDailyLimit }); }
  catch (e) { sendErr(res, String(e), 500); }
});

export default router;
