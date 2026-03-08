import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { sendSucc, sendErr } from "../middleware/response";
import type { MiniappRequest } from "../middleware/auth";
import { getWorkModel } from "../../dbservice/model/GlobalInfoDBModel";
import { logRequest, logRequestError } from "../../util/requestLogger";

const router = Router();

router.post("/publish", async (req: MiniappRequest, res: Response) => {
  const payload = (req.body?.data ?? req.body) as {
    desc?: string;
    tags?: string[];
    images?: { url: string; name: string; type: string }[];
    location?: string;
    status?: "draft" | "published";
  };

  logRequest("work.ts:publish:entry", "publish request", {
    req,
    params: req.params ?? {},
    requestBody: payload,
    extra: { hasAuthorization: !!req.headers.authorization },
  });

  const desc = payload?.desc?.trim() ?? "";
  const images = Array.isArray(payload?.images) ? payload.images : [];
  const tags = Array.isArray(payload?.tags) ? payload.tags : [];
  const status = payload?.status ?? "published";

  if (!desc && images.length === 0) {
    logRequest("work.ts:publish:validation", "missing desc and images", {
      req,
      requestBody: payload,
      statusCode: 400,
      extra: { descLength: desc.length, imagesLength: images.length },
    });
    sendErr(res, "desc or images is required", 400);
    return;
  }

  if (status !== "draft" && status !== "published") {
    logRequest("work.ts:publish:status", "invalid status", {
      req,
      requestBody: payload,
      statusCode: 400,
      extra: { status },
    });
    sendErr(res, "Invalid status", 400);
    return;
  }

  // 依赖上层 authMiddleware 已经校验并挂载 userId
  const authorId = req.userId;
  if (!authorId) {
    logRequest("work.ts:publish:author", "missing userId (unauthorized)", {
      req,
      requestBody: payload,
      statusCode: 401,
      extra: { hasUserId: !!authorId },
    });
    sendErr(res, "Unauthorized", 401);
    return;
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

    const responseBody = { workId: doc.workId, authorId };
    logRequest("work.ts:publish:success", "work published", {
      req,
      requestBody: payload,
      responseBody,
      statusCode: 200,
    });

    sendSucc(res, { workId: doc.workId });
  } catch (err) {
    logRequestError("work.ts:publish:dbError", "publish failed", {
      req,
      requestBody: payload,
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Publish work failed", 500);
  }
});

export default router;

