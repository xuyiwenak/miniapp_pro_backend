import { Router, type Response } from 'express';
import { requireSuperAdmin, type AdminRequest } from '../../middleware/adminAuth';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { ComponentManager } from '../../../../../common/BaseComponent';
import type { PlayerComponent } from '../../../../../component/PlayerComponent';
import { getPlayerModel } from '../../../../../dbservice/model/ZoneDBModel';
import { AccountLevel } from '../../../../../shared/enum/AccountLevel';
import { getHealDailyUsageBatch, setHealDailyUsage } from '../../../../../auth/RedisTokenStore';
import { gameLogger as logger } from '../../../../../util/logger';

const router = Router();

/** GET /admin/users — 分页查询用户列表，支持账号/昵称搜索和角色过滤 */
router.get('/', async (req: AdminRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const search = (req.query.search as string | undefined)?.trim();
  const levelParam = req.query.level as string | undefined;
  const level = levelParam ? parseInt(levelParam) : undefined;

  try {
    const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
    const zoneId = playerComp?.getDefaultZoneId();
    if (!zoneId) { sendErr(res, 'Server not ready', 503); return; }

    const Player = getPlayerModel(zoneId);
    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { account: { $regex: search, $options: 'i' } },
        { nickname: { $regex: search, $options: 'i' } },
      ];
    }
    if (level !== undefined && !isNaN(level)) {
      query.level = level;
    }

    const [total, list] = await Promise.all([
      Player.countDocuments(query),
      Player.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const userIds = list.map((u) => u.userId);
    const healUsageMap = await getHealDailyUsageBatch(userIds);
    const listWithUsage = list.map((u) => ({ ...u, healTodayUsage: healUsageMap[u.userId] ?? 0 }));

    sendSucc(res, { total, page, limit, list: listWithUsage });
  } catch (err) {
    logger.error('admin:users:list error', { page, limit, search, level, error: (err as Error).message });
    sendErr(res, 'Failed to list users', 500);
  }
});

/** GET /admin/users/:userId — 查询指定用户详情 */
router.get('/:userId', async (req: AdminRequest, res: Response) => {
  const { userId } = req.params;
  try {
    const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
    const zoneId = playerComp?.getDefaultZoneId();
    if (!zoneId) { sendErr(res, 'Server not ready', 503); return; }

    const Player = getPlayerModel(zoneId);
    const player = await Player.findOne({ userId }).select('-password').lean().exec();
    if (!player) { sendErr(res, 'User not found', 404); return; }

    sendSucc(res, player);
  } catch (err) {
    logger.error('admin:users:get error', { userId, error: (err as Error).message });
    sendErr(res, 'Failed to get user', 500);
  }
});

/** PATCH /admin/users/:userId/level — 修改用户角色（仅超级管理员） */
router.patch('/:userId/level', requireSuperAdmin, async (req: AdminRequest, res: Response) => {
  const { userId } = req.params;
  const level = parseInt(req.body?.level);

  if (!level || ![AccountLevel.SuperAdmin, AccountLevel.Admin, AccountLevel.User].includes(level)) {
    sendErr(res, 'Invalid level', 400);
    return;
  }
  if (userId === req.userId) {
    sendErr(res, 'Cannot change your own level', 400);
    return;
  }

  try {
    const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
    const zoneId = playerComp?.getDefaultZoneId();
    if (!zoneId) { sendErr(res, 'Server not ready', 503); return; }

    const Player = getPlayerModel(zoneId);
    const result = await Player.updateOne({ userId }, { $set: { level } }).exec();
    if (result.matchedCount === 0) { sendErr(res, 'User not found', 404); return; }

    sendSucc(res, { userId, level });
  } catch (err) {
    logger.error('admin:users:updateLevel error', { userId, level, error: (err as Error).message });
    sendErr(res, 'Failed to update user level', 500);
  }
});

/** PATCH /admin/users/:userId/heal-usage — 手动设置用户今日分析用量 */
router.patch('/:userId/heal-usage', async (req: AdminRequest, res: Response) => {
  const { userId } = req.params;
  const { usage } = req.body as { usage?: unknown };
  if (typeof usage !== 'number' || !Number.isInteger(usage) || usage < 0) {
    sendErr(res, 'usage must be a non-negative integer', 400);
    return;
  }
  try {
    await setHealDailyUsage(userId, usage);
    sendSucc(res, { userId, healTodayUsage: usage });
  } catch (err) {
    logger.error('admin:users:healUsage error', { userId, usage, error: (err as Error).message });
    sendErr(res, 'Failed to update heal usage', 500);
  }
});

/** DELETE /admin/users/:userId — 删除用户（仅超级管理员） */
router.delete('/:userId', requireSuperAdmin, async (req: AdminRequest, res: Response) => {
  const { userId } = req.params;
  if (userId === req.userId) { sendErr(res, 'Cannot delete yourself', 400); return; }

  try {
    const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
    const zoneId = playerComp?.getDefaultZoneId();
    if (!zoneId) { sendErr(res, 'Server not ready', 503); return; }

    const Player = getPlayerModel(zoneId);
    const result = await Player.deleteOne({ userId }).exec();
    if (result.deletedCount === 0) { sendErr(res, 'User not found', 404); return; }

    sendSucc(res, { userId });
  } catch (err) {
    logger.error('admin:users:delete error', { userId, error: (err as Error).message });
    sendErr(res, 'Failed to delete user', 500);
  }
});

export default router;
