import { Router, Response } from 'express';
import type { AdminRequest } from '../../middleware/adminAuth';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { getWorkModel } from '../../../../../dbservice/model/GlobalInfoDBModel';
import { resolveImageUrl, deleteFromStorage } from '../../../../../util/imageUploader';
import { gameLogger as logger } from '../../../../../util/logger';

const router = Router();
const OSS_PREFIX = 'oss://';

/** GET /admin/works — 分页查询所有作品，支持状态/作者过滤 */
router.get('/', async (req: AdminRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const status = req.query.status as string | undefined;
  const authorId = req.query.authorId as string | undefined;

  const query: Record<string, unknown> = {};
  if (status && ['draft', 'published'].includes(status)) query.status = status;
  if (authorId) query.authorId = authorId;

  try {
    const Work = getWorkModel();
    const [total, works] = await Promise.all([
      Work.countDocuments(query),
      Work.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const list = works.map((w) => {
      const cover = Array.isArray(w.images) && w.images.length > 0 ? w.images[0] : null;
      const rawUrl = (cover as { url?: string } | null)?.url ?? '';
      const coverUrl = rawUrl.startsWith(OSS_PREFIX) ? resolveImageUrl(rawUrl) : rawUrl;
      const wRec = w as Record<string, unknown>;
      const healing = wRec.healing as { status?: string } | undefined;
      const healingAnalyzed = !!(healing?.status) && healing.status !== 'none';
      return { ...w, coverUrl, healingAnalyzed };
    });

    sendSucc(res, { total, page, limit, list });
  } catch (err) {
    logger.error('admin:works:list error', { page, limit, status, authorId, error: (err as Error).message });
    sendErr(res, 'Failed to list works', 500);
  }
});

/** PATCH /admin/works/:workId/status — 修改作品状态（发布/转草稿） */
router.patch('/:workId/status', async (req: AdminRequest, res: Response) => {
  const { workId } = req.params;
  const { status } = req.body ?? {};

  if (!['draft', 'published'].includes(status)) {
    sendErr(res, "Invalid status, must be 'draft' or 'published'", 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const result = await Work.updateOne({ workId }, { $set: { status } }).exec();
    if (result.matchedCount === 0) { sendErr(res, 'Work not found', 404); return; }
    sendSucc(res, { workId, status });
  } catch (err) {
    logger.error('admin:works:updateStatus error', { workId, status, error: (err as Error).message });
    sendErr(res, 'Failed to update work status', 500);
  }
});

/** PATCH /admin/works/:workId/featured — 切换首页展示 */
router.patch('/:workId/featured', async (req: AdminRequest, res: Response) => {
  const { workId } = req.params;
  const { featured } = req.body ?? {};

  if (typeof featured !== 'boolean') {
    sendErr(res, 'featured must be a boolean', 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const result = await Work.updateOne({ workId }, { $set: { featured } }).exec();
    if (result.matchedCount === 0) { sendErr(res, 'Work not found', 404); return; }
    sendSucc(res, { workId, featured });
  } catch (err) {
    logger.error('admin:works:featured error', { workId, featured, error: (err as Error).message });
    sendErr(res, 'Failed to update featured', 500);
  }
});

/** DELETE /admin/works/:workId — 删除作品（含异步清理 OSS 文件） */
router.delete('/:workId', async (req: AdminRequest, res: Response) => {
  const { workId } = req.params;

  try {
    const Work = getWorkModel();
    const work = await Work.findOne({ workId }).lean().exec();
    if (!work) { sendErr(res, 'Work not found', 404); return; }

    await Work.deleteOne({ workId }).exec();
    sendSucc(res, { workId });

    // 异步清理 OSS / 本地文件
    const workRec = work as Record<string, unknown>;
    const imageUrls = (workRec.images as { url?: string }[] | undefined)
      ?.map((img) => img?.url)
      .filter(Boolean) as string[] | undefined;
    if (imageUrls?.length) {
      void Promise.allSettled(imageUrls.map((url) => deleteFromStorage(url))).then((results) => {
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            logger.error(`[admin] deleteFromStorage failed workId=${workId} url=${imageUrls[i]}`, r.reason);
          }
        });
      });
    }
  } catch (err) {
    logger.error('admin:works:delete error', { workId, error: (err as Error).message });
    sendErr(res, 'Failed to delete work', 500);
  }
});

export default router;
