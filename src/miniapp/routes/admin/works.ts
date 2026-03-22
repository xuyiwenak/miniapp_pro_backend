import { Router, Response } from "express";
import type { AdminRequest } from "../../middleware/adminAuth";
import { sendSucc, sendErr } from "../../middleware/response";
import { getWorkModel } from "../../../dbservice/model/GlobalInfoDBModel";
import { resolveImageUrl } from "../../../util/imageUploader";

const router = Router();
const OSS_PREFIX = "oss://";

/** GET /admin/works — 分页查询所有作品，支持状态/作者过滤 */
router.get("/", async (req: AdminRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const status = req.query.status as string | undefined;
  const authorId = req.query.authorId as string | undefined;

  const query: Record<string, unknown> = {};
  if (status && ["draft", "published"].includes(status)) query.status = status;
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
      const rawUrl = (cover as { url?: string } | null)?.url ?? "";
      const coverUrl = rawUrl.startsWith(OSS_PREFIX) ? resolveImageUrl(rawUrl) : rawUrl;
      return { ...w, coverUrl };
    });

    sendSucc(res, { total, page, limit, list });
  } catch {
    sendErr(res, "Failed to list works", 500);
  }
});

/** PATCH /admin/works/:workId/status — 修改作品状态（发布/转草稿） */
router.patch("/:workId/status", async (req: AdminRequest, res: Response) => {
  const { workId } = req.params;
  const { status } = req.body ?? {};

  if (!["draft", "published"].includes(status)) {
    sendErr(res, "Invalid status, must be 'draft' or 'published'", 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const result = await Work.updateOne({ workId }, { $set: { status } }).exec();
    if (result.matchedCount === 0) { sendErr(res, "Work not found", 404); return; }
    sendSucc(res, { workId, status });
  } catch {
    sendErr(res, "Failed to update work status", 500);
  }
});

/** DELETE /admin/works/:workId — 删除作品 */
router.delete("/:workId", async (req: AdminRequest, res: Response) => {
  const { workId } = req.params;

  try {
    const Work = getWorkModel();
    const result = await Work.deleteOne({ workId }).exec();
    if (result.deletedCount === 0) { sendErr(res, "Work not found", 404); return; }
    sendSucc(res, { workId });
  } catch {
    sendErr(res, "Failed to delete work", 500);
  }
});

export default router;
