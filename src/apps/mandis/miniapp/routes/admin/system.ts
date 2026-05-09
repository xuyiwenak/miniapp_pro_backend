import { type Request, type Response } from 'express';
import { createSystemRouter } from '../../../../../shared/routes/systemAdmin';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { getHealDailyLimit, setHealDailyLimit } from '../../../../../auth/RedisTokenStore';

const router = createSystemRouter(undefined, 'mandis');

// ── mandis 专属：heal 限额配置 ───────────────────────────────────────────────

router.get('/config', async (_req: Request, res: Response) => {
  try { sendSucc(res, { healDailyLimit: await getHealDailyLimit() }); }
  catch (e) { sendErr(res, String(e), 500); }
});

router.patch('/config', async (req: Request, res: Response) => {
  const { healDailyLimit } = req.body as { healDailyLimit?: unknown };
  if (typeof healDailyLimit !== 'number' || !Number.isInteger(healDailyLimit) || healDailyLimit < 0) {
    sendErr(res, 'healDailyLimit must be a non-negative integer', 400);
    return;
  }
  try { await setHealDailyLimit(healDailyLimit); sendSucc(res, { healDailyLimit }); }
  catch (e) { sendErr(res, String(e), 500); }
});

export default router;
