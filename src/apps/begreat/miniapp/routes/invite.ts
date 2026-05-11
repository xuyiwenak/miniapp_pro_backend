import { Router, Response } from 'express';
import { sendSucc, sendErr } from '../../../../shared/miniapp/middleware/response';
import { authMiddleware, type MiniappRequest } from '../../../../shared/miniapp/middleware/auth';
import {
  getInviteCodeModel,
  getInviteRewardModel,
  getSessionModel,
} from '../../dbservice/BegreatDBModel';
import { gameLogger as logger } from '../../../../util/logger';

const router = Router();

/** 6 位邀请码字符集（去除易混淆字符 0/O/1/I） */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * GET /invite/my-code
 * 获取（或首次创建）当前用户的邀请码
 */
router.get('/my-code', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const openId = req.userId ?? '';
  try {
    const InviteCodes = getInviteCodeModel();

    // 生成唯一邀请码候选（碰撞重试最多 5 次）
    let code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateCode();
      const exists = await InviteCodes.findOne({ code: candidate }).lean().exec();
      if (!exists) { code = candidate; break; }
    }
    if (!code) {
      sendErr(res, 'Failed to generate invite code', 500);
      return;
    }

    // 原子 upsert：并发请求只有第一个会插入，后续返回已有记录
    const record = await InviteCodes.findOneAndUpdate(
      { openId },
      { $setOnInsert: { code, openId } },
      { upsert: true, new: true },
    ).lean().exec();

    if (!record) { sendErr(res, 'Internal error', 500); return; }
    sendSucc(res, { code: record.code });
  } catch (err) {
    logger.error('[invite/my-code]', err);
    sendErr(res, 'Internal error', 500);
  }
});

/**
 * GET /invite/stats
 * 查询当前用户的邀请积分和累计邀请数
 */
router.get('/stats', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const openId = req.userId ?? '';
  try {
    const InviteRewards = getInviteRewardModel();
    const reward = await InviteRewards.findOne({ openId }).lean().exec();
    sendSucc(res, {
      credits:      reward?.freeUnlockCredits ?? 0,
      totalInvited: reward?.totalInvited ?? 0,
    });
  } catch (err) {
    logger.error('[invite/stats]', err);
    sendErr(res, 'Internal error', 500);
  }
});

/**
 * POST /invite/claim-unlock/:sessionId
 * 消费 1 个邀请积分，将指定 60 题 session 解锁为 invite_unlocked 层
 */
router.post('/claim-unlock/:sessionId', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const { sessionId } = req.params;
  const openId = req.userId ?? '';

  try {
    const Sessions      = getSessionModel();
    const InviteRewards = getInviteRewardModel();

    const session = await Sessions.findOne({ sessionId, openId }).lean().exec();
    if (!session) { sendErr(res, 'Session not found', 404); return; }
    if (session.assessmentType !== 'BFI2') {
      sendErr(res, 'Invite unlock only applies to full 60-question assessment', 400);
      return;
    }
    if (session.status !== 'completed') {
      if (session.status === 'invite_unlocked' || session.status === 'paid') {
        sendErr(res, 'Report already unlocked', 400);
      } else {
        sendErr(res, 'Assessment not completed yet', 400);
      }
      return;
    }

    // 原子扣减积分（credits >= 1 才允许）
    const updated = await InviteRewards.findOneAndUpdate(
      { openId, freeUnlockCredits: { $gte: 1 } },
      { $inc: { freeUnlockCredits: -1 } },
      { new: true }
    ).lean().exec();

    if (!updated) {
      sendErr(res, 'Insufficient invite credits', 403);
      return;
    }

    await Sessions.updateOne(
      { sessionId },
      { $set: { status: 'invite_unlocked', inviteUnlockedAt: new Date() } }
    );

    logger.info('[invite/claim-unlock] unlocked:', sessionId, 'by:', openId);
    sendSucc(res, { credits: updated.freeUnlockCredits });
  } catch (err) {
    logger.error('[invite/claim-unlock]', err);
    sendErr(res, 'Internal error', 500);
  }
});

export default router;

/**
 * 工具函数（供 assessment complete 调用）：
 * 根据邀请码查找邀请人 openId
 */
export async function resolveInviteCode(code: string): Promise<string | null> {
  try {
    const InviteCodes = getInviteCodeModel();
    const record = await InviteCodes.findOne({ code: code.toUpperCase() }).lean().exec();
    return record?.openId ?? null;
  } catch {
    return null;
  }
}

/**
 * 工具函数（供 assessment complete 调用）：
 * 给邀请人 +1 积分。幂等键：referredSessionId，防重复回调。
 */
export async function creditInviter(inviterOpenId: string, referredSessionId: string): Promise<void> {
  try {
    const InviteRewards = getInviteRewardModel();
    const Sessions      = getSessionModel();

    // 幂等：通过 $setOnInsert 实现；referrerCredited 标记防止重复结算
    await InviteRewards.findOneAndUpdate(
      { openId: inviterOpenId },
      {
        $inc: { freeUnlockCredits: 1, totalInvited: 1 },
        $setOnInsert: { openId: inviterOpenId },
      },
      { upsert: true }
    );
    // 标记 session 已结算，防止服务器重启后重复结算
    await Sessions.updateOne({ sessionId: referredSessionId }, { $set: { referrerCredited: true } });
    logger.info('[invite/credit]', inviterOpenId, 'credited for session', referredSessionId);
  } catch (err) {
    logger.error('[invite/credit] error:', err);
  }
}
