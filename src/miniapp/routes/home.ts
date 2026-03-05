import { Router, Request, Response } from "express";
import { sendSucc } from "../middleware/response";
import { getWorkModel } from "../../dbservice/model/GlobalInfoDBModel";
import type { IWork } from "../../entity/work.entity";

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

export default router;
