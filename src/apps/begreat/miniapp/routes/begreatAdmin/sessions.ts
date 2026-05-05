import { Router, Request, Response } from 'express';
import { getSessionModel } from '../../../dbservice/BegreatDBModel';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { gameLogger as logger } from '../../../../../util/logger';

const router = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100;
const VALID_STATUSES    = ['in_progress', 'completed', 'paid', 'invite_unlocked'] as const;

// GET /begreat-admin/sessions
router.get('/', async (req: Request, res: Response) => {
  const page     = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query['pageSize'] ?? String(DEFAULT_PAGE_SIZE)), 10) || DEFAULT_PAGE_SIZE));
  const openId    = typeof req.query['openId']    === 'string' ? req.query['openId']    : undefined;
  const startDate = typeof req.query['startDate'] === 'string' ? req.query['startDate'] : undefined;
  const endDate   = typeof req.query['endDate']   === 'string' ? req.query['endDate']   : undefined;

  // 支持逗号分隔多状态
  const statusParam = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
  const statuses = statusParam
    ? statusParam.split(',').filter(s => (VALID_STATUSES as readonly string[]).includes(s))
    : [];

  try {
    const filter: Record<string, unknown> = {};
    if (openId)          filter['openId'] = openId;
    if (statuses.length) filter['status'] = { $in: statuses };
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter['$gte'] = new Date(startDate);
      if (endDate)   dateFilter['$lte'] = new Date(endDate);
      filter['createdAt'] = dateFilter;
    }

    const Session = getSessionModel();
    const [total, data] = await Promise.all([
      Session.countDocuments(filter),
      Session.find(filter)
        .select('sessionId openId status assessmentType userProfile result.personalityLabel createdAt paidAt inviteUnlockedAt grantedByAdmin')
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    sendSucc(res, { total, page, pageSize, data });
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[admin/sessions]', err);
  }
});

// GET /begreat-admin/sessions/:sessionId
router.get('/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const session = await getSessionModel()
      .findOne({ sessionId })
      .select('-answers -questionIds')
      .lean();

    if (!session) {
      sendErr(res, 'Session not found', 404);
      return;
    }
    sendSucc(res, session);
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[admin/sessions/:id]', err);
  }
});

// POST /begreat-admin/sessions/:sessionId/grant
router.post('/:sessionId/grant', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { grantReason } = req.body ?? {};

  if (!grantReason || typeof grantReason !== 'string' || !grantReason.trim()) {
    sendErr(res, 'grantReason is required', 400);
    return;
  }

  try {
    const Session = getSessionModel();
    const session = await Session.findOne({ sessionId }).lean();

    if (!session) {
      sendErr(res, 'Session not found', 404);
      return;
    }
    if (session.status === 'in_progress') {
      sendErr(res, 'Session not completed yet', 400);
      return;
    }
    if (session.status === 'paid') {
      sendSucc(res, { alreadyPaid: true });
      return;
    }

    await Session.updateOne(
      { sessionId },
      {
        $set: {
          status:         'paid',
          paidAt:         new Date(),
          grantedByAdmin: true,
          grantReason:    grantReason.trim(),
        },
      }
    );

    logger.info(`[admin/sessions/grant] sessionId=${sessionId} reason="${grantReason}"`);
    sendSucc(res, { granted: true });
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[admin/sessions/grant]', err);
  }
});

export default router;
