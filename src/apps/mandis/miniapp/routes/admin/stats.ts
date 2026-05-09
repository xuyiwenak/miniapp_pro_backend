import { Router, type Request, type Response } from 'express';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { getWorkModel, getFeedbackModel } from '../../../../../dbservice/model/GlobalInfoDBModel';
import { ComponentManager } from '../../../../../common/BaseComponent';
import type { PlayerComponent } from '../../../../../component/PlayerComponent';
import { getPlayerModel } from '../../../../../dbservice/model/ZoneDBModel';
import { gameLogger as logger } from '../../../../../util/logger';

const router = Router();

/** GET /admin/stats — 仪表盘统计数据 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const Work = getWorkModel();
    const Feedback = getFeedbackModel();

    const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
    const zoneId = playerComp?.getDefaultZoneId();

    const [totalWorks, publishedWorks, draftWorks, totalFeedback, pendingFeedback] =
      await Promise.all([
        Work.countDocuments(),
        Work.countDocuments({ status: 'published' }),
        Work.countDocuments({ status: 'draft' }),
        Feedback.countDocuments(),
        Feedback.countDocuments({ status: 'pending' }),
      ]);

    let totalUsers = 0;
    if (zoneId) {
      const Player = getPlayerModel(zoneId);
      totalUsers = await Player.countDocuments();
    }

    sendSucc(res, { totalUsers, totalWorks, publishedWorks, draftWorks, totalFeedback, pendingFeedback });
  } catch (err) {
    logger.error('admin:stats error', { error: (err as Error).message });
    sendErr(res, 'Failed to get stats', 500);
  }
});

export default router;
