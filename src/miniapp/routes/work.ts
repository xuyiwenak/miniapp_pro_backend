import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { sendSucc, sendErr } from "../middleware/response";
import { getUserIdByToken } from "../middleware/auth";
import { getWorkModel } from "../../dbservice/model/GlobalInfoDBModel";

const router = Router();

router.post("/publish", async (req: Request, res: Response) => {
  const payload = (req.body?.data ?? req.body) as {
    desc?: string;
    tags?: string[];
    images?: { url: string; name: string; type: string }[];
    location?: string;
    status?: "draft" | "published";
  };

  const desc = payload?.desc?.trim() ?? "";
  const images = Array.isArray(payload?.images) ? payload.images : [];
  const tags = Array.isArray(payload?.tags) ? payload.tags : [];
  const status = payload?.status ?? "published";

  if (!desc && images.length === 0) {
    sendErr(res, "desc or images is required", 400);
    return;
  }

  if (status !== "draft" && status !== "published") {
    sendErr(res, "Invalid status", 400);
    return;
  }

  // 可选：从 Authorization 头中解析 userId 作为 authorId
  let authorId: string | null = null;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    const uid = getUserIdByToken(token);
    if (uid) {
      authorId = uid;
    }
  }

  try {
    const Work = getWorkModel();
    const workId = uuidv4();
    const doc = await Work.create({
      workId,
      authorId,
      desc,
      images,
      tags,
      location: payload.location,
      status,
    });

    sendSucc(res, { workId: doc.workId });
  } catch (err) {
    sendErr(res, "Publish work failed", 500);
  }
});

export default router;

