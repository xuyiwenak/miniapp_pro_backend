import { Router, Response } from "express";
import { sendSucc, sendErr } from "../middleware/response";
import type { MiniappRequest } from "../middleware/auth";
import { getMessageStore } from "../messageStore";

const router = Router();

router.get("/unreadNum", (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }
  const store = getMessageStore();
  const n = store.getUnreadCount(userId);
  sendSucc(res, n);
});

router.get("/list", (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }
  const store = getMessageStore();
  const list = store.getSessionList(userId);
  sendSucc(res, list);
});

router.post("/read", (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }
  const targetUserId = (req.body?.userId ?? req.body?.data?.userId) as string | undefined;
  if (!targetUserId) {
    sendErr(res, "Missing userId", 400);
    return;
  }
  const store = getMessageStore();
  store.markRead(userId, targetUserId);
  sendSucc(res, {});
});

export default router;
