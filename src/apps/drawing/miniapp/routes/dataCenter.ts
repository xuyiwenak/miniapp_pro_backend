import { Router, Request, Response } from "express";
import { sendSucc } from "../middleware/response";

const router = Router();

router.get("/member", (_req: Request, res: Response) => {
  sendSucc(res, {
    list: [
      { name: "浏览量", number: "202W" },
      { name: "PV", number: "233W" },
      { name: "UV", number: "102W" },
    ],
  });
});

router.get("/interaction", (_req: Request, res: Response) => {
  sendSucc(res, {
    list: [
      { name: "浏览量", number: "919" },
      { name: "点赞量", number: "887" },
      { name: "分享量", number: "104" },
      { name: "收藏", number: "47" },
    ],
  });
});

router.get("/complete-rate", (_req: Request, res: Response) => {
  sendSucc(res, {
    list: [
      { time: "12:00", percentage: "80" },
      { time: "14:00", percentage: "60" },
      { time: "16:00", percentage: "85" },
      { time: "18:00", percentage: "43" },
      { time: "20:00", percentage: "60" },
      { time: "22:00", percentage: "95" },
    ],
  });
});

router.get("/area", (_req: Request, res: Response) => {
  const row = { 标题: "视频A", 全球: "4442", 华北: "456", 华东: "456" };
  sendSucc(res, {
    list: new Array(8).fill(null).map(() => ({ ...row })),
  });
});

export default router;
