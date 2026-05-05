import { Router, Request, Response } from 'express';
import { getPaymentModel, getSessionModel } from '../../../dbservice/BegreatDBModel';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { gameLogger as logger } from '../../../../../util/logger';

const router = Router();

const DEFAULT_PAGE_SIZE  = 20;
const MAX_PAGE_SIZE      = 100;
const VALID_PAY_STATUSES = ['pending', 'success', 'failed'] as const;

// GET /begreat-admin/payments
// eslint-disable-next-line max-lines-per-function
router.get('/', async (req: Request, res: Response) => {
  const page     = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query['pageSize'] ?? String(DEFAULT_PAGE_SIZE)), 10) || DEFAULT_PAGE_SIZE));
  const openId    = typeof req.query['openId']    === 'string' ? req.query['openId']    : undefined;
  const startDate = typeof req.query['startDate'] === 'string' ? req.query['startDate'] : undefined;
  const endDate   = typeof req.query['endDate']   === 'string' ? req.query['endDate']   : undefined;
  const statusParam = typeof req.query['status']  === 'string' ? req.query['status']    : undefined;
  const statuses = statusParam
    ? statusParam.split(',').filter(s => (VALID_PAY_STATUSES as readonly string[]).includes(s))
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

    const Payment = getPaymentModel();
    const [total, data] = await Promise.all([
      Payment.countDocuments(filter),
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    sendSucc(res, { total, page, pageSize, data });
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[admin/payments]', err);
  }
});

// GET /begreat-admin/payments/anomalies
// 掉单：支付成功但对应 session 不是 paid 状态（invite_unlocked 不算掉单）
// eslint-disable-next-line max-lines-per-function
router.get('/anomalies', async (_req: Request, res: Response) => {
  try {
    type AnomalyRow = {
      outTradeNo:    string;
      sessionId:     string;
      openId:        string;
      amount:        number;
      paidAt:        Date;
      createdAt:     Date;
      sessionStatus: string;
    };

    const rows = await getPaymentModel().aggregate<AnomalyRow>([
      { $match: { status: 'success' } },
      {
        $lookup: {
          from:         'assessmentsessions',
          localField:   'sessionId',
          foreignField: 'sessionId',
          as:           'session',
        },
      },
      { $unwind: { path: '$session', preserveNullAndEmptyArrays: false } },
      { $match: { 'session.status': { $nin: ['paid', 'invite_unlocked'] } } },
      {
        $project: {
          _id:           0,
          outTradeNo:    1,
          sessionId:     1,
          openId:        1,
          amount:        1,
          paidAt:        1,
          createdAt:     1,
          sessionStatus: '$session.status',
        },
      },
      { $sort: { paidAt: -1 } },
    ]);

    sendSucc(res, { total: rows.length, data: rows });
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[admin/payments/anomalies]', err);
  }
});

// POST /begreat-admin/payments/fix-anomaly
// eslint-disable-next-line max-lines-per-function
router.post('/fix-anomaly', async (req: Request, res: Response) => {
  const { sessionId, outTradeNo, reason } = req.body ?? {};

  if (!sessionId || typeof sessionId !== 'string') {
    sendErr(res, 'sessionId is required', 400);
    return;
  }
  if (!outTradeNo || typeof outTradeNo !== 'string') {
    sendErr(res, 'outTradeNo is required', 400);
    return;
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    sendErr(res, 'reason is required', 400);
    return;
  }

  try {
    const payment = await getPaymentModel().findOne({ outTradeNo }).lean();

    if (!payment) {
      sendErr(res, 'Payment record not found', 404);
      return;
    }
    if (payment.status !== 'success') {
      sendErr(res, 'Payment is not in success status', 400);
      return;
    }
    if (payment.sessionId !== sessionId) {
      sendErr(res, 'Payment record does not match session', 400);
      return;
    }

    const session = await getSessionModel().findOne({ sessionId }).lean();
    if (!session) {
      sendErr(res, 'Session not found', 404);
      return;
    }
    if (session.status === 'paid') {
      sendSucc(res, { alreadyFixed: true });
      return;
    }

    await getSessionModel().updateOne(
      { sessionId },
      {
        $set: {
          status:         'paid',
          paidAt:         payment.paidAt ?? new Date(),
          grantedByAdmin: true,
          grantReason:    `[掉单修复] ${reason.trim()}`,
        },
      }
    );

    logger.info(`[admin/payments/fix-anomaly] fixed sessionId=${sessionId} outTradeNo=${outTradeNo}`);
    sendSucc(res, { fixed: true });
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[admin/payments/fix-anomaly]', err);
  }
});

export default router;
