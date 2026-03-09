import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import { sendSucc, sendErr } from "../middleware/response";
import { authMiddleware, type MiniappRequest } from "../middleware/auth";
import { getPersonalInfoModel } from "../../dbservice/model/GlobalInfoDBModel";

const router = Router();

const AVATARS_DIR = path.join(process.cwd(), "static", "avatars");
function ensureAvatarsDir() {
  if (!fs.existsSync(path.join(process.cwd(), "static"))) {
    fs.mkdirSync(path.join(process.cwd(), "static"), { recursive: true });
  }
  if (!fs.existsSync(AVATARS_DIR)) {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
  }
}

const HISTORY_WORDS = ["AI绘画", "Stable Diffusion", "版权素材", "星空", "illustration", "原创"];
const POPULAR_WORDS = [
  "考研和靠边同时上岸应该怎么选？有哪些参考建议",
  "日常饮食中，如何选择优质蛋白",
  "你有没有网购维权成功的经历？求分享经验",
  "夏季带孩子旅游，你的必备物品有哪些",
  "在海外越卖越贵，中国汽车做对了什么",
  "当HR问你离职原因，怎么回答最能被接受",
];

const DEFAULT_PERSONAL = {
  image: "/static/avatar1.png",
  name: "小小轩",
  star: "天秤座",
  gender: 0,
  birth: "1994-09-27",
  address: ["440000", "440300"],
  brief: "在你身边，为你设计",
  photos: [
    { url: "/static/img_td.png", name: "uploaded1.png", type: "image" },
    { url: "/static/img_td.png", name: "uploaded2.png", type: "image" },
  ],
};

router.get("/searchHistory", (_req: Request, res: Response) => {
  sendSucc(res, { historyWords: HISTORY_WORDS });
});

router.get("/searchPopular", (_req: Request, res: Response) => {
  sendSucc(res, { popularWords: POPULAR_WORDS });
});

router.get("/genPersonalInfo", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const PersonalInfo = getPersonalInfoModel();
    const doc = await PersonalInfo.findOne({ userId }).lean().exec();
    const info = doc
      ? {
          image: doc.image ?? DEFAULT_PERSONAL.image,
          name: doc.name ?? DEFAULT_PERSONAL.name,
          star: doc.star ?? "",
          gender: doc.gender ?? DEFAULT_PERSONAL.gender,
          birth: doc.birth ?? DEFAULT_PERSONAL.birth,
          address: Array.isArray(doc.address) ? doc.address : DEFAULT_PERSONAL.address,
          brief: doc.brief ?? DEFAULT_PERSONAL.brief,
          photos: Array.isArray(doc.photos) ? doc.photos : DEFAULT_PERSONAL.photos,
        }
      : { ...DEFAULT_PERSONAL };
    sendSucc(res, { data: info });
  } catch {
    sendSucc(res, { data: { ...DEFAULT_PERSONAL } });
  }
});

/** 上传头像：body.data.image 为 base64 或 data:image/xxx;base64,xxx */
router.post("/uploadAvatar", authMiddleware, (req: MiniappRequest, res: Response) => {
  const userId = req.userId!;
  const body = req.body?.data ?? req.body;
  const raw = (body?.image as string) || "";
  const base64Match = raw.match(/^data:image\/(\w+);base64,(.+)$/) || [null, "jpeg", raw];
  const ext = (base64Match[1] === "png" ? "png" : "jpeg") as string;
  const base64 = base64Match[2];
  if (!base64) {
    sendErr(res, "Missing image", 400);
    return;
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    sendErr(res, "Invalid base64", 400);
    return;
  }
  ensureAvatarsDir();
  const filename = `${userId}-${Date.now()}.${ext}`;
  const filepath = path.join(AVATARS_DIR, filename);
  try {
    fs.writeFileSync(filepath, buf);
  } catch (err) {
    sendErr(res, "Save avatar failed", 500);
    return;
  }
  const url = `/static/avatars/${filename}`;
  sendSucc(res, { url });
});

router.post("/savePersonalInfo", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId!;
  const body = req.body?.data ?? req.body;
  if (!body || typeof body !== "object") {
    sendErr(res, "Invalid body", 400);
    return;
  }
  try {
    const PersonalInfo = getPersonalInfoModel();
    const existing = await PersonalInfo.findOne({ userId }).lean().exec();
    const update = {
      userId,
      image: body.image ?? existing?.image ?? DEFAULT_PERSONAL.image,
      name: body.name ?? DEFAULT_PERSONAL.name,
      star: body.star ?? existing?.star ?? DEFAULT_PERSONAL.star,
      gender: body.gender ?? DEFAULT_PERSONAL.gender,
      birth: body.birth ?? DEFAULT_PERSONAL.birth,
      address: Array.isArray(body.address) ? body.address : DEFAULT_PERSONAL.address,
      brief: body.brief ?? DEFAULT_PERSONAL.brief,
      photos: Array.isArray(body.photos) ? body.photos : DEFAULT_PERSONAL.photos,
    };
    const doc = await PersonalInfo.findOneAndUpdate(
      { userId },
      { $set: update },
      { new: true, upsert: true, runValidators: true },
    )
      .lean()
      .exec();
    const info = {
      image: doc!.image ?? DEFAULT_PERSONAL.image,
      name: doc!.name ?? DEFAULT_PERSONAL.name,
      star: doc!.star ?? "",
      gender: doc!.gender ?? DEFAULT_PERSONAL.gender,
      birth: doc!.birth ?? DEFAULT_PERSONAL.birth,
      address: Array.isArray(doc!.address) ? doc!.address : DEFAULT_PERSONAL.address,
      brief: doc!.brief ?? DEFAULT_PERSONAL.brief,
      photos: Array.isArray(doc!.photos) ? doc!.photos : DEFAULT_PERSONAL.photos,
    };
    sendSucc(res, { data: info });
  } catch {
    sendErr(res, "Save personal info failed", 500);
  }
});

export default router;
