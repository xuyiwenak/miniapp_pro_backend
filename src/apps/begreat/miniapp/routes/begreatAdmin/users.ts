import { Router, Request, Response } from 'express';
import { getSessionModel, getPaymentModel, getInviteCodeModel } from '../../../dbservice/BegreatDBModel';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { gameLogger as logger } from '../../../../../util/logger';
import { parsePage } from '../../../../../util/pagination';

const router = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100;
type SessionResult = {
  personalityLabel?: string;
  topCareers?: { title: string; matchScore: number }[];
};

// GET /begreat-admin/users
// eslint-disable-next-line max-lines-per-function
router.get('/', async (req: Request, res: Response) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const openId     = typeof req.query['openId']    === 'string' ? req.query['openId']    : undefined;
  const startDate  = typeof req.query['startDate'] === 'string' ? req.query['startDate'] : undefined;
  const endDate    = typeof req.query['endDate']   === 'string' ? req.query['endDate']   : undefined;

  try {
    const Session = getSessionModel();

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter['$gte'] = new Date(startDate);
    if (endDate)   dateFilter['$lte'] = new Date(endDate);

    const matchStage: Record<string, unknown> = {};
    if (openId) matchStage['openId'] = openId;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id:           '$openId',
          firstSeenAt:   { $min: '$createdAt' },
          lastSeenAt:    { $max: '$createdAt' },
          sessionCount:  { $sum: 1 },
          paidCount:     { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
          latestStatus:  { $last: '$status' },
        },
      },
      ...(Object.keys(dateFilter).length > 0 ? [{ $match: { firstSeenAt: dateFilter } }] : []),
      { $sort: { lastSeenAt: -1 as const } },
    ];

    const countPipeline = [...pipeline, { $count: 'total' }];
    const dataPipeline  = [...pipeline, { $skip: (page - 1) * pageSize }, { $limit: pageSize }];

    const [countResult, data] = await Promise.all([
      Session.aggregate<{ total: number }>(countPipeline),
      Session.aggregate(dataPipeline),
    ]);

    const total = countResult[0]?.total ?? 0;
    const formatted = data.map(u => ({
      openId: u._id,
      firstSeenAt: u.firstSeenAt,
      lastSeenAt: u.lastSeenAt,
      sessionCount: u.sessionCount,
      paidCount: u.paidCount,
      latestStatus: u.latestStatus,
    }));

    sendSucc(res, { total, page, pageSize, data: formatted });
  } catch (err) {
    logger.error('[admin/users]', err);
    sendErr(res, 'Internal error', 500);
  }
});

// GET /begreat-admin/users/:openId/timeline
// eslint-disable-next-line max-lines-per-function
router.get('/:openId/timeline', async (req: Request, res: Response) => {
  const { openId } = req.params;

  try {
    // referredSessions：此用户邀请码被他人使用后完成的 session
    const [sessions, payments, inviteCodes, referredSessions] = await Promise.all([
      getSessionModel()
        .find({ openId })
        .select('sessionId status userProfile assessmentType result createdAt updatedAt paidAt grantedByAdmin grantReason')
        .lean(),
      getPaymentModel().find({ openId }).select('outTradeNo amount status paidAt createdAt').lean(),
      getInviteCodeModel().find({ openId }).select('code createdAt').lean(),
      getSessionModel()
        .find({ referrerId: openId, referrerCredited: true })
        .select('openId createdAt')
        .lean(),
    ]);

    type TimelineEvent = { type: string; timestamp: Date; detail: Record<string, unknown> };
    const events: TimelineEvent[] = [];

    for (const s of sessions) {
      events.push({
        type: 'session_start',
        timestamp: s.createdAt as Date,
        detail: {
          sessionId: s.sessionId,
          gender: (s.userProfile as { gender: string }).gender,
          age: (s.userProfile as { age: number }).age,
          assessmentType: s.assessmentType,
        },
      });

      if (s.status !== 'in_progress') {
        const result = s.result as SessionResult | undefined;
        events.push({
          type: 'session_complete',
          timestamp: (s.updatedAt as Date) ?? s.createdAt,
          detail: {
            sessionId: s.sessionId,
            personalityLabel: result?.personalityLabel,
            topCareers: result?.topCareers?.slice(0, 3).map(c => ({
              title: c.title,
              matchScore: c.matchScore,
            })),
          },
        });
      }

      if (s.grantedByAdmin && s.paidAt) {
        events.push({
          type: 'admin_grant',
          timestamp: s.paidAt as Date,
          detail: { sessionId: s.sessionId, grantReason: s.grantReason },
        });
      }
    }

    for (const p of payments) {
      events.push({ type: 'payment_created', timestamp: p.createdAt as Date, detail: { outTradeNo: p.outTradeNo, amount: p.amount } });
      if (p.status === 'success' && p.paidAt) {
        events.push({ type: 'payment_success', timestamp: p.paidAt as Date, detail: { outTradeNo: p.outTradeNo } });
      }
    }

    for (const c of inviteCodes) {
      events.push({ type: 'invite_code_generated', timestamp: c.createdAt as Date, detail: { code: c.code } });
    }

    for (const r of referredSessions) {
      events.push({ type: 'invite_redeemed', timestamp: r.createdAt as Date, detail: { redeemerOpenId: r.openId } });
    }

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    sendSucc(res, { openId, events });
  } catch (err) {
    logger.error('[admin/users/timeline]', err);
    sendErr(res, 'Internal error', 500);
  }
});

export default router;
