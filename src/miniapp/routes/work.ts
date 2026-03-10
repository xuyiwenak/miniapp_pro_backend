import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { sendSucc, sendErr } from "../middleware/response";
import type { MiniappRequest } from "../middleware/auth";
import { getWorkModel } from "../../dbservice/model/GlobalInfoDBModel";
import { buildHealingResponse } from "./healing";
import { logRequest, logRequestError } from "../../util/requestLogger";

const router = Router();

router.get("/list", async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  const status = (req.query?.status as string | undefined)?.trim() as "draft" | "published" | undefined;

  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }

  if (status && status !== "draft" && status !== "published") {
    sendErr(res, "Invalid status", 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const query: Record<string, unknown> = { authorId: userId };
    if (status) {
      query.status = status;
    }
    const works = await Work.find(query).sort({ createdAt: -1 }).lean().exec();

    const list = works.map((w) => {
      const cover = Array.isArray(w.images) && w.images.length > 0 ? w.images[0] : null;
      return {
        workId: w.workId,
        desc: w.desc,
        tags: w.tags ?? [],
        coverUrl: cover?.url ?? "/static/home/card0.png",
        status: w.status,
        createdAt: w.createdAt,
      };
    });

    sendSucc(res, list);
  } catch (err) {
    logRequestError("work.ts:list:error", "get work list failed", {
      req,
      requestBody: { status },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Get work list failed", 500);
  }
});

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

router.get("/detail", async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  const workId = (req.query?.workId as string)?.trim();

  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }
  if (!workId) {
    sendErr(res, "Missing workId", 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const work = await Work.findOne({ workId, authorId: userId }).lean().exec();
    if (!work) {
      sendErr(res, "Work not found", 404);
      return;
    }
    const healingInfo = buildHealingResponse(work, userId);
    sendSucc(res, { ...work, ...healingInfo });
  } catch (err) {
    logRequestError("work.ts:detail:error", "get work detail failed", {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Get work detail failed", 500);
  }
});

router.post("/publishDraft", async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  const body = (req.body?.data ?? req.body) as { workId?: string };
  const workId = body?.workId?.trim();

  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }
  if (!workId) {
    sendErr(res, "Missing workId", 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const work = await Work.findOne({ workId }).lean().exec();
    if (!work) {
      sendErr(res, "Work not found", 404);
      return;
    }
    if (work.authorId !== userId) {
      sendErr(res, "Forbidden", 403);
      return;
    }
    if (work.status === "published") {
      sendSucc(res, { workId, message: "Already published" });
      return;
    }

    await Work.updateOne({ workId }, { $set: { status: "published" } }).exec();
    sendSucc(res, { workId });
  } catch (err) {
    logRequestError("work.ts:publishDraft:error", "publish draft failed", {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Publish draft failed", 500);
  }
});

router.post("/delete", async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  const body = (req.body?.data ?? req.body) as { workId?: string };
  const workId = body?.workId?.trim();

  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }

  if (!workId) {
    sendErr(res, "Missing workId", 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const work = await Work.findOne({ workId }).lean().exec();
    if (!work) {
      sendErr(res, "Work not found", 404);
      return;
    }
    if (work.authorId !== userId) {
      sendErr(res, "Forbidden", 403);
      return;
    }

    await Work.deleteOne({ workId }).exec();
    sendSucc(res, { workId });
  } catch (err) {
    logRequestError("work.ts:delete:error", "delete work failed", {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Delete work failed", 500);
  }
});

export default router;

