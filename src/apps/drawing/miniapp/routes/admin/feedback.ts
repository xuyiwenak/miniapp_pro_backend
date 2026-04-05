import { Router, Response } from "express";
import type { AdminRequest } from "../../middleware/adminAuth";
import { sendSucc, sendErr } from "../../middleware/response";
import { getFeedbackModel } from "../../../../../dbservice/model/GlobalInfoDBModel";

const router = Router();

/** GET /admin/feedback — 分页查询所有反馈，支持状态过滤 */
router.get("/", async (req: AdminRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const status = req.query.status as string | undefined;

  const query: Record<string, unknown> = {};
  if (status && ["pending", "processing", "resolved"].includes(status)) query.status = status;

  try {
    const Feedback = getFeedbackModel();
    const [total, list] = await Promise.all([
      Feedback.countDocuments(query),
      Feedback.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    sendSucc(res, { total, page, limit, list });
  } catch {
    sendErr(res, "Failed to list feedback", 500);
  }
});

/** PATCH /admin/feedback/:id — 更新反馈状态和回复内容 */
router.patch("/:id", async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  const { status, reply } = req.body ?? {};

  const validStatuses = ["pending", "processing", "resolved"];
  if (status && !validStatuses.includes(status)) {
    sendErr(res, "Invalid status", 400);
    return;
  }

  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (typeof reply === "string") update.reply = reply.trim();

  if (Object.keys(update).length === 0) {
    sendErr(res, "Nothing to update", 400);
    return;
  }

  try {
    const Feedback = getFeedbackModel();
    const result = await Feedback.updateOne({ _id: id }, { $set: update }).exec();
    if (result.matchedCount === 0) { sendErr(res, "Feedback not found", 404); return; }
    sendSucc(res, { id, ...update });
  } catch {
    sendErr(res, "Failed to update feedback", 500);
  }
});

export default router;
