import { Router, Request, Response } from 'express';
import { getSessionModel, getPaymentModel } from '../../../dbservice/BegreatDBModel';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';

const router = Router();

const COMPLETED_STATUSES = ['completed', 'paid', 'invite_unlocked'];
const MAX_TREND_DAYS = 30;

/** 今日自然日起始时间（UTC+8） */
function todayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// GET /begreat-admin/dashboard/stats
// eslint-disable-next-line max-lines-per-function
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const Session = getSessionModel();
    const Payment = getPaymentModel();
    const dayStart = todayStart();

    const [
      todayNewUsers,
      todayCompleted,
      todayPaid,
      totalPaid,
      totalSessions,
      totalCompleted,
      todayRevenue,
      anomalyCount,
    ] = await Promise.all([
      // 今日去重 openId 数（按新建 session 算）
      Session.distinct('openId', { createdAt: { $gte: dayStart } }).then(r => r.length),
      Session.countDocuments({ status: { $in: COMPLETED_STATUSES }, createdAt: { $gte: dayStart } }),
      Session.countDocuments({ status: 'paid', createdAt: { $gte: dayStart } }),
      Session.countDocuments({ status: 'paid' }),
      Session.distinct('openId').then(r => r.length),
      Session.countDocuments({ status: { $in: COMPLETED_STATUSES } }),
      // 今日支付成功金额（分）
      Payment.aggregate<{ total: number }>([
        { $match: { status: 'success', paidAt: { $gte: dayStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).then(r => r[0]?.total ?? 0),
      // 掉单：支付成功但 session 未 paid
      Payment.aggregate<{ count: number }>([
        { $match: { status: 'success' } },
        {
          $lookup: {
            from: 'assessmentsessions',
            localField: 'sessionId',
            foreignField: 'sessionId',
            as: 'session',
          },
        },
        { $unwind: '$session' },
        { $match: { 'session.status': { $nin: ['paid'] } } },
        { $count: 'count' },
      ]).then(r => r[0]?.count ?? 0),
    ]);

    const conversionRate = totalCompleted > 0
      ? parseFloat(((totalPaid / totalCompleted) * 100).toFixed(2))
      : 0;

    sendSucc(res, {
      todayNewUsers,
      todayCompletedSessions: todayCompleted,
      todayPaidSessions:      todayPaid,
      todayRevenue,
      totalUsers:             totalSessions,
      totalPaidSessions:      totalPaid,
      conversionRate,
      anomalyCount,
    });
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[dashboard/stats]', err);
  }
});

// GET /begreat-admin/dashboard/trend?days=7
// eslint-disable-next-line max-lines-per-function
router.get('/trend', async (req: Request, res: Response) => {
  const rawDays = parseInt(String(req.query['days'] ?? '7'), 10);
  const days = isNaN(rawDays) || rawDays < 1 ? 7 : Math.min(rawDays, MAX_TREND_DAYS);

  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  since.setHours(0, 0, 0, 0);

  try {
    const Session = getSessionModel();
    const Payment = getPaymentModel();

    const [sessionRows, paymentRows] = await Promise.all([
      Session.aggregate<{ _id: string; newSessions: number; completedSessions: number; paidSessions: number }>([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+08:00' } },
            newSessions:       { $sum: 1 },
            completedSessions: { $sum: { $cond: [{ $in: ['$status', COMPLETED_STATUSES] }, 1, 0] } },
            paidSessions:      { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
          },
        },
      ]),
      Payment.aggregate<{ _id: string; revenue: number }>([
        { $match: { status: 'success', paidAt: { $gte: since } } },
        {
          $group: {
            _id:     { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: '+08:00' } },
            revenue: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    // 构建日期 → 数据映射
    const sessionMap = new Map(sessionRows.map(r => [r._id, r]));
    const revenueMap = new Map(paymentRows.map(r => [r._id, r.revenue]));

    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }); // YYYY-MM-DD
      const s = sessionMap.get(dateStr);
      result.push({
        date:               dateStr,
        newSessions:        s?.newSessions        ?? 0,
        completedSessions:  s?.completedSessions  ?? 0,
        paidSessions:       s?.paidSessions       ?? 0,
        revenue:            revenueMap.get(dateStr) ?? 0,
      });
    }

    sendSucc(res, result);
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[dashboard/trend]', err);
  }
});

export default router;
