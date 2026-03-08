import { Router, Request, Response } from "express";
import { sendSucc, sendErr } from "../middleware/response";
import { getWorkModel } from "../../dbservice/model/GlobalInfoDBModel";
import type { IWork } from "../../entity/work.entity";
import { logRequest, logRequestError } from "../../util/requestLogger";

const router = Router();

const CARDS = [
  { url: "/static/home/card0.png", desc: "少年,星空与梦想", tags: [{ text: "AI绘画", theme: "primary" }, { text: "版权素材", theme: "success" }] },
  { url: "/static/home/card1.png", desc: "仰望星空的少女", tags: [{ text: "AI绘画", theme: "primary" }, { text: "版权素材", theme: "success" }] },
  { url: "/static/home/card3.png", desc: "仰望星空的少年", tags: [{ text: "AI绘画", theme: "primary" }, { text: "版权素材", theme: "success" }] },
  { url: "/static/home/card2.png", desc: "少年,星空与梦想", tags: [{ text: "AI绘画", theme: "primary" }, { text: "版权素材", theme: "success" }] },
  { url: "/static/home/card4.png", desc: "多彩的天空", tags: [{ text: "AI绘画", theme: "primary" }, { text: "版权素材", theme: "success" }] },
];

const SWIPERS = new Array(6).fill("/static/home/swiper0.png");

router.get("/cards", async (_req: Request, res: Response) => {
  try {
    const Work = getWorkModel();
    const works = (await Work.find({ status: "published" })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec()) as IWork[];

    const list =
      works.length > 0
        ? works.map((w) => {
            const cover = w.images?.[0];
            const baseTags =
              Array.isArray(w.tags) && w.tags.length > 0
                ? w.tags
                : ["AI绘画", "版权素材"];

            const tags = baseTags.map((text, index) => {
              let theme: "primary" | "success" | "default" = "default";
              if (index === 0) {
                theme = "primary";
              } else if (index === 1) {
                theme = "success";
              }
              return { text, theme };
            });

            return {
              workId: w.workId,
              url: cover?.url ?? "/static/home/card0.png",
              desc: w.desc,
              tags,
            };
          })
        : CARDS;

    sendSucc(res, list);
  } catch {
    // 查询异常时回退到静态卡片
    sendSucc(res, CARDS);
  }
});

router.get("/swipers", (_req: Request, res: Response) => {
  sendSucc(res, SWIPERS);
});

/** 根据 workId 获取单条已发布作品详情（无需登录） */
router.get("/workDetail", async (req: Request, res: Response) => {
  const workId = (req.query?.workId as string)?.trim();

  logRequest("home.ts:workDetail:entry", "workDetail request", {
    req,
    params: req.params ?? {},
    requestBody: { workId: workId || undefined },
    extra: { query: req.query },
  });

  if (!workId) {
    logRequest("home.ts:workDetail:validation", "missing workId", {
      req,
      requestBody: { workId },
      statusCode: 400,
    });
    sendErr(res, "Missing workId", 400);
    return;
  }
  try {
    const Work = getWorkModel();
    const work = (await Work.findOne({ workId, status: "published" }).lean().exec()) as IWork | null;
    if (!work) {
      logRequest("home.ts:workDetail:notFound", "work not found", {
        req,
        requestBody: { workId },
        statusCode: 404,
      });
      sendErr(res, "Work not found", 404);
      return;
    }
    logRequest("home.ts:workDetail:success", "workDetail success", {
      req,
      requestBody: { workId },
      responseBody: { workId: work.workId, desc: work.desc, imagesCount: work.images?.length ?? 0 },
      statusCode: 200,
    });
    sendSucc(res, work);
  } catch (err) {
    logRequestError("home.ts:workDetail:error", "workDetail server error", {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Server error", 500);
  }
});

export default router;
