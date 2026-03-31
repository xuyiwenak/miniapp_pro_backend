import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
// @ts-ignore 类型通过运行时依赖提供
import multer from "multer";
import { sendSucc, sendErr } from "../middleware/response";
import { authMiddleware, type MiniappRequest } from "../middleware/auth";
import { getFeedbackModel, getPersonalInfoModel } from "../../dbservice/model/GlobalInfoDBModel";
import { uploadToStorage, resolveImageUrl } from "../../util/imageUploader";
import { checkImage } from "../../util/wxContentSecurity";

const OSS_PREFIX = "oss://";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

const AVATARS_DIR = path.join(process.cwd(), "static", "avatars");
function ensureAvatarsDir() {
  if (!fs.existsSync(path.join(process.cwd(), "static"))) {
    fs.mkdirSync(path.join(process.cwd(), "static"), { recursive: true });
  }
  if (!fs.existsSync(AVATARS_DIR)) {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
  }
}

const DEFAULT_PERSONAL = {
  image: "/static/avatar1.png",
  name: "用户", // 实际返回时会基于 userId 生成“用户_xxxxxxxx”
  star: "天秤座",
  mbti: "",
  gender: 0,
  birth: "1994-01-01",
  address: ["440000", "440300"],
  brief: "在你身边，为你设计",
  photos: [
    { url: "/static/img_td.png", name: "uploaded1.png", type: "image" },
    { url: "/static/img_td.png", name: "uploaded2.png", type: "image" },
  ],
};

router.get("/genPersonalInfo", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const PersonalInfo = getPersonalInfoModel();
    const doc = await PersonalInfo.findOne({ userId }).lean().exec();
    const fallbackName = `用户_${String(userId).slice(0, 8)}`;
    const info = doc
      ? {
          image: doc.image ?? DEFAULT_PERSONAL.image,
          name: (doc.name && doc.name.trim()) || fallbackName,
          star: doc.star ?? DEFAULT_PERSONAL.star,
          mbti: doc.mbti ?? DEFAULT_PERSONAL.mbti,
          gender: doc.gender ?? DEFAULT_PERSONAL.gender,
          birth: doc.birth ?? DEFAULT_PERSONAL.birth,
          address: Array.isArray(doc.address) ? doc.address : DEFAULT_PERSONAL.address,
          brief: doc.brief ?? DEFAULT_PERSONAL.brief,
          photos: Array.isArray(doc.photos) ? doc.photos : DEFAULT_PERSONAL.photos,
        }
      : {
          ...DEFAULT_PERSONAL,
          name: fallbackName,
        };
    sendSucc(res, { data: info });
  } catch {
    const fallbackName = `用户_${String(userId).slice(0, 8)}`;
    sendSucc(res, {
      data: {
        ...DEFAULT_PERSONAL,
        name: fallbackName,
      },
    });
  }
});

/** 创建问题反馈 */
router.post("/feedback", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId!;
  const body = (req.body?.data ?? req.body) as { title?: string; content?: string };
  const rawTitle = (body.title ?? "").trim();
  const rawContent = (body.content ?? "").trim();

  if (!rawTitle || !rawContent) {
    sendErr(res, "Missing title or content", 400);
    return;
  }

  const title = rawTitle.slice(0, 30);
  const content = rawContent.slice(0, 300);

  try {
    const Feedback = getFeedbackModel();
    const doc = await Feedback.create({
      userId,
      title,
      content,
      status: "pending",
    });
    sendSucc(res, {
      id: String(doc._id),
    });
  } catch {
    sendErr(res, "Save feedback failed", 500);
  }
});

/** 获取当前用户的历史反馈列表 */
router.get("/feedback", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const Feedback = getFeedbackModel();
    const list = await Feedback.find({ userId }).sort({ createdAt: -1 }).lean().exec();
    const mapped = list.map((item) => ({
      id: String(item._id),
      title: item.title,
      content: item.content,
      status: item.status,
      reply: item.reply ?? "",
      createdAt: item.createdAt,
    }));
    sendSucc(res, { list: mapped });
  } catch {
    sendErr(res, "Get feedback failed", 500);
  }
});

/** 更新反馈的处理状态与回复（后台使用） */
router.patch("/feedback/:id", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId!;
  const feedbackId = req.params.id;
  const body = (req.body?.data ?? req.body) as { status?: string; reply?: string };

  if (!feedbackId) {
    sendErr(res, "Missing id", 400);
    return;
  }

  const update: Record<string, unknown> = {};
  if (body.status) {
    if (!["pending", "processing", "resolved"].includes(body.status)) {
      sendErr(res, "Invalid status", 400);
      return;
    }
    update.status = body.status;
  }
  if (typeof body.reply === "string") {
    update.reply = body.reply;
  }

  if (Object.keys(update).length === 0) {
    sendErr(res, "Nothing to update", 400);
    return;
  }

  try {
    const Feedback = getFeedbackModel();
    const doc = await Feedback.findOneAndUpdate({ _id: feedbackId, userId }, { $set: update }, { new: true })
      .lean()
      .exec();
    if (!doc) {
      sendErr(res, "Feedback not found", 404);
      return;
    }
    sendSucc(res, {
      id: String(doc._id),
      status: doc.status,
      reply: doc.reply ?? "",
    });
  } catch {
    sendErr(res, "Update feedback failed", 500);
  }
});

// 预置艺术标签（审核通过的固定列表）
export const ART_TAGS = [
  '安静内敛', '热爱自然', '治愈系', '感性细腻', '喜欢色彩',
  '夜间创作', '随性自由', '温暖包容', '城市探索', '思考者',
];

/** 获取 onboarding 状态（onboardingStep + artTags + mbti + name + image） */
router.get("/onboarding", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const PersonalInfo = getPersonalInfoModel();
    const doc = await PersonalInfo.findOne({ userId }).select("name image mbti artTags onboardingStep").lean().exec();
    sendSucc(res, {
      onboardingStep: doc?.onboardingStep ?? 0,
      name: doc?.name ?? "",
      image: doc?.image ?? "",
      mbti: doc?.mbti ?? "",
      artTags: doc?.artTags ?? [],
      presetTags: ART_TAGS,
    });
  } catch {
    sendErr(res, "Get onboarding failed", 500);
  }
});

/** 更新 onboarding 进度：每个节点调一次，只传本节点的字段 */
router.patch("/onboarding", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId!;
  const body = req.body?.data ?? req.body;
  if (!body || typeof body !== "object") { sendErr(res, "Invalid body", 400); return; }

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim().slice(0, 20);
  if (typeof body.image === "string" && body.image) update.image = body.image;
  if (Array.isArray(body.artTags)) {
    const valid = (body.artTags as unknown[]).filter((t): t is string => typeof t === "string" && ART_TAGS.includes(t));
    update.artTags = valid.slice(0, 5);
  }
  if (typeof body.mbti === "string") update.mbti = body.mbti.trim().slice(0, 10);
  if (typeof body.onboardingStep === "number") update.onboardingStep = body.onboardingStep;

  try {
    const PersonalInfo = getPersonalInfoModel();
    await PersonalInfo.findOneAndUpdate(
      { userId },
      { $set: update },
      { upsert: true, new: true },
    ).exec();
    sendSucc(res, { ok: true });
  } catch {
    sendErr(res, "Update onboarding failed", 500);
  }
});

/** 通用图片上传：multipart/form-data，字段名 file */
router.post(
  "/upload",
  authMiddleware,
  upload.single("file"),
  async (req: MiniappRequest, res: Response) => {
    const userId = req.userId!;
    const anyReq = req as any;
    const file = anyReq.file as any;

    if (!file || !file.buffer) {
      sendErr(res, "Missing file", 400);
      return;
    }
    if (!file.mimetype.startsWith("image/")) {
      sendErr(res, "Only image files are allowed", 400);
      return;
    }

    const imgCheck = await checkImage(file.buffer, file.mimetype);
    if (!imgCheck.safe) {
      sendErr(res, "图片疑似违规，请更换后重试", 400);
      return;
    }

    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = ext.replace(/[^a-z0-9.]/gi, "") || ".jpg";
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1e9);
    const key = `images/${userId}/${timestamp}-${random}${safeExt}`;

    try {
      const url = await uploadToStorage(file.buffer, key, file.mimetype);
      const payload: { url: string; cdnUrl?: string } = { url };
      if (url.startsWith(OSS_PREFIX)) {
        payload.cdnUrl = resolveImageUrl(url);
      }
      sendSucc(res, payload);
    } catch (err) {
      sendErr(res, "Upload failed", 500);
    }
  },
);

/** 上传头像：兼容老接口，按配置走 COS 或本地存储；期望字段 file（multipart） */
router.post(
  "/uploadAvatar",
  authMiddleware,
  upload.single("file"),
  async (req: MiniappRequest, res: Response) => {
    const userId = req.userId!;
    const anyReq = req as any;
    const file = anyReq.file as any;

    if (!file || !file.buffer) {
      sendErr(res, "Missing file", 400);
      return;
    }
    if (!file.mimetype.startsWith("image/")) {
      sendErr(res, "Only image files are allowed", 400);
      return;
    }

    const imgCheck = await checkImage(file.buffer, file.mimetype);
    if (!imgCheck.safe) {
      sendErr(res, "头像图片疑似违规，请更换后重试", 400);
      return;
    }

    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = ext.replace(/[^a-z0-9.]/gi, "") || ".jpg";
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1e9);
    const key = `avatars/${userId}/${timestamp}-${random}${safeExt}`;

    try {
      const url = await uploadToStorage(file.buffer, key, file.mimetype);
      sendSucc(res, { url });
    } catch (err) {
      sendErr(res, "Upload avatar failed", 500);
    }
  },
);

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
    const autoName =
      (body.name as string | undefined)?.trim() ||
      (existing?.name && existing.name.trim()) ||
      `用户_${String(userId).slice(0, 8)}`;
    const update = {
      userId,
      image: body.image ?? existing?.image ?? DEFAULT_PERSONAL.image,
      name: autoName,
      star: body.star ?? existing?.star ?? DEFAULT_PERSONAL.star,
      mbti: typeof body.mbti === "string" ? body.mbti : existing?.mbti,
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
      name: doc!.name ?? `用户_${String(userId).slice(0, 8)}`,
      star: doc!.star ?? "",
      mbti: doc!.mbti ?? "",
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
