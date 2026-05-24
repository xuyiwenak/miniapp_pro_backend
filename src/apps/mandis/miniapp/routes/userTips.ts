import { Router, Response } from 'express';
import { sendSucc, sendErr } from '../../../../shared/miniapp/middleware/response';
import { authMiddleware, type MiniappRequest } from '../../../../shared/miniapp/middleware/auth';
import { getUserTipsModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import { gameLogger as logger } from '../../../../util/logger';

const router = Router();

const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

function getTodayCst(): string {
  const now = new Date(Date.now() + CST_OFFSET_MS);
  return now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

router.get('/today', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }

  try {
    const UserTips = getUserTipsModel();
    const today = getTodayCst();
    const doc = await UserTips.findOne({ userId, date: today, status: 'done' }).lean().exec();
    sendSucc(res, { content: doc?.content ?? '' });
  } catch (err) {
    logger.error('userTips:today error', { userId, error: (err as Error).message });
    sendErr(res, 'Get userTips failed', 500);
  }
});

export default router;
export { getTodayCst };
