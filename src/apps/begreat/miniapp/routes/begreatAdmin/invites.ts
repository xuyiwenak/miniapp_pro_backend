import { Router, Request, Response } from 'express';
import { getInviteCodeModel, getInviteRewardModel, getSessionModel } from '../../../dbservice/BegreatDBModel';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';

const router = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100;

// GET /begreat-admin/invites/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [totalInviteCodes, totalUnlocked, topInviters] = await Promise.all([
      getInviteCodeModel().countDocuments(),
      // invite_unlocked 状态的 session 数即被邀请解锁数
      getSessionModel().countDocuments({ status: 'invite_unlocked' }),
      // 按 referrerId 聚合，取邀请成功（referrerCredited）最多的前10名
      getSessionModel().aggregate<{ _id: string; redeemCount: number }>([
        { $match: { referrerCredited: true } },
        { $group: { _id: '$referrerId', redeemCount: { $sum: 1 } } },
        { $sort: { redeemCount: -1 } },
        { $limit: 10 },
      ]),
    ]);

    // Top10 仅用于展示，转化率与总邀请成功需查全量
    const totalRedeemedAll = await getSessionModel().countDocuments({ referrerCredited: true });
    const conversionRate = totalInviteCodes > 0
      ? parseFloat(((totalRedeemedAll / totalInviteCodes) * 100).toFixed(2))
      : 0;

    sendSucc(res, {
      totalInviteCodes,
      totalRedeemed:  totalRedeemedAll,
      totalUnlocked,
      conversionRate,
      topInviters:    topInviters.map(r => ({ openId: r._id, redeemCount: r.redeemCount })),
    });
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[admin/invites/stats]', err);
  }
});

// GET /begreat-admin/invites
router.get('/', async (req: Request, res: Response) => {
  const page     = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query['pageSize'] ?? String(DEFAULT_PAGE_SIZE)), 10) || DEFAULT_PAGE_SIZE));
  const openId   = typeof req.query['openId'] === 'string' ? req.query['openId'] : undefined;

  try {
    const filter: Record<string, unknown> = {};
    if (openId) filter['openId'] = openId;

    const InviteCode = getInviteCodeModel();
    const InviteReward = getInviteRewardModel();

    const [total, codes] = await Promise.all([
      InviteCode.countDocuments(filter),
      InviteCode.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    // 批量查各邀请人的积分汇总
    const ownerIds = codes.map(c => c.openId);
    const rewards  = await InviteReward.find({ openId: { $in: ownerIds } }).lean();
    const rewardMap = new Map(rewards.map(r => [r.openId, r]));

    const data = codes.map(c => ({
      code:        c.code,
      openId:      c.openId,
      createdAt:   c.createdAt,
      totalInvited: rewardMap.get(c.openId)?.totalInvited ?? 0,
    }));

    sendSucc(res, { total, page, pageSize, data });
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[admin/invites]', err);
  }
});

export default router;
