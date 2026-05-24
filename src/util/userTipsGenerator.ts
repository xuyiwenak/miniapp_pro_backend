import { getUserTipsModel } from '../dbservice/model/GlobalInfoDBModel';
import type { TipsSourceType } from '../entity/userTips.entity';
import { generateUserTipsContent } from './qwenVlAnalyzer';
import { resolveImageUrl } from './imageUploader';
import { getTodayCst } from '../apps/mandis/miniapp/routes/userTips';
import { gameLogger as logger } from './logger';

const OSS_PREFIX = 'oss://';

/**
 * 作品发布后异步触发今日回响生成。
 * fire-and-forget：调用方不 await，失败只记日志不影响主流程。
 */
export async function triggerUserTipsGeneration(params: {
  userId: string;
  workId: string;
  imageUrl: string;  // 原始存储 URL（oss:// 或 https://）
  desc: string;
  sourceType: TipsSourceType;
}): Promise<void> {
  const { userId, workId, imageUrl, desc, sourceType } = params;
  const date = getTodayCst();
  const UserTips = getUserTipsModel();

  // 已有记录（done 或 generating）则跳过，防重复触发
  const existing = await UserTips.findOne({ userId, date }).lean().exec();
  if (existing) {
    logger.info('userTips: skip, already exists', { userId, date, status: existing.status });
    return;
  }

  // 占位，防并发：unique 索引保证只有一条能插入成功
  try {
    await UserTips.create({ userId, date, sourceWorkId: workId, sourceType, status: 'generating', content: '' });
  } catch (err) {
    // duplicate key — 另一个并发请求已经插入，跳过
    logger.info('userTips: concurrent insert skipped', { userId, date });
    return;
  }

  // 把 oss:// 转成可访问的签名 URL 再传给 Qwen
  const resolvedUrl = imageUrl.startsWith(OSS_PREFIX) ? resolveImageUrl(imageUrl) : imageUrl;

  try {
    const content = await generateUserTipsContent(resolvedUrl, desc, workId);
    await UserTips.updateOne({ userId, date }, { $set: { status: 'done', content } }).exec();
    logger.info('userTips: generated', { userId, date, workId, length: content.length });
  } catch (err) {
    await UserTips.updateOne({ userId, date }, { $set: { status: 'failed' } }).exec();
    logger.error('userTips: generation failed', { userId, date, workId, error: (err as Error).message });
  }
}
