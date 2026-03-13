import { Router, type Response } from "express";
import { sendSucc, sendErr } from "../middleware/response";
import { authMiddleware, type MiniappRequest } from "../middleware/auth";
import { getWorkModel } from "../../dbservice/model/GlobalInfoDBModel";
import { logRequest, logRequestError } from "../../util/requestLogger";
import { submitWorkflow, pollWorkflowResult } from "../../util/cozeWorkflow";
import { resolveImageUrl } from "../../util/imageUploader";
import { gameLogger as logger } from "../../util/logger";
import type { IWork, IHealingScores } from "../../entity/work.entity";

const router = Router();

type EmotionKey = "calm" | "stress" | "joy" | "sadness";

const EMOTION_LABELS: Record<EmotionKey, string> = {
  calm: "平静",
  stress: "压力",
  joy: "快乐",
  sadness: "忧郁",
};

function hashStringToSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function createRng(seed: number): () => number {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
}

function normalizeScores(raw: Record<EmotionKey, number>): Record<EmotionKey, number> {
  const result: Record<EmotionKey, number> = { calm: 0, stress: 0, joy: 0, sadness: 0 };
  (Object.keys(raw) as EmotionKey[]).forEach((key) => {
    const v = raw[key];
    const scaled = 20 + v * 75;
    result[key] = Math.round(Math.max(5, Math.min(98, scaled)));
  });
  return result;
}

function analyzeTextTendencies(text: string): { stressBoost: number; joyBoost: number; calmBoost: number } {
  const lower = text.toLowerCase();
  let stressBoost = 0;
  let joyBoost = 0;
  let calmBoost = 0;

  const stressWords = ["焦虑", "压力", "紧张", "deadline", "加班", "疲惫"];
  const joyWords = ["阳光", "温暖", "愉悦", "开心", "喜悦", "快乐"];
  const calmWords = ["宁静", "平静", "治愈", "放松", "冥想", "安静"];

  const containsAny = (words: string[]) => words.some((w) => lower.includes(w.toLowerCase()));

  if (containsAny(stressWords)) stressBoost += 0.25;
  if (containsAny(joyWords)) joyBoost += 0.25;
  if (containsAny(calmWords)) calmBoost += 0.25;

  return { stressBoost, joyBoost, calmBoost };
}

function buildMockSummary(): string {
  return "你的画作中流露出宁静而温柔的力量，色彩与线条像一面柔软的镜子，安静地陪你看见此刻的心情，这是一份值得被好好珍藏的疗愈创作。";
}

function buildColorAnalysis(): string {
  return "整体色彩可被理解为柔和的莫兰迪疗愈系配色，在低饱和度的冷暖过渡中，帮助情绪慢慢舒缓下来，营造出安全、可停靠的内在空间。";
}

function generateMockScoresForWork(work: IWork): Record<EmotionKey, number> {
  const seedSource = `${work.workId}|${work.authorId ?? ""}|${work.desc ?? ""}|${(work.tags ?? []).join(",")}`;
  const seed = hashStringToSeed(seedSource);
  const rng = createRng(seed);

  const { stressBoost, joyBoost, calmBoost } = analyzeTextTendencies(`${work.desc ?? ""} ${(work.tags ?? []).join(" ")}`);

  const baseCalm = rng() * 0.8 + calmBoost;
  const baseStress = rng() * 0.8 + stressBoost;
  const baseJoy = rng() * 0.8 + joyBoost;
  const baseSadness = rng() * 0.8 + rng() * 0.2;

  const raw: Record<EmotionKey, number> = {
    calm: Math.min(1, Math.max(0, baseCalm)),
    stress: Math.min(1, Math.max(0, baseStress)),
    joy: Math.min(1, Math.max(0, baseJoy)),
    sadness: Math.min(1, Math.max(0, baseSadness)),
  };

  return normalizeScores(raw);
}

function pickDominantEmotion(scores: IHealingScores): { key: EmotionKey; label: string; value: number } {
  const entries: { key: EmotionKey; value: number }[] = (Object.keys(scores) as EmotionKey[]).map((key) => ({
    key,
    value: scores[key],
  }));
  entries.sort((a, b) => b.value - a.value);
  const top = entries[0];
  return {
    key: top.key,
    label: EMOTION_LABELS[top.key],
    value: top.value,
  };
}

function buildHealingResponse(work: IWork, viewerId?: string) {
  const healing = work.healing;
  if (!healing) {
    return { healingAnalyzed: false };
  }

  const isOwner = !!(work.authorId && viewerId && work.authorId === viewerId);

  if (!healing.isPublic && !isOwner) {
    return {
      healingAnalyzed: true,
      healingVisible: false,
      healingIsPublic: false,
    };
  }

  const dominant = pickDominantEmotion(healing.scores);
  return {
    healingAnalyzed: true,
    healingVisible: true,
    healingScores: healing.scores,
    healingSummary: healing.summary,
    healingColorAnalysis: healing.colorAnalysis,
    healingStatus: healing.status,
    healingIsPublic: healing.isPublic,
    healingDominantEmotion: dominant.key,
    healingDominantEmotionLabel: dominant.label,
    healingDominantEmotionScore: dominant.value,
    isOwner,
  };
}

export { buildHealingResponse };

/**
 * 解析 Coze 工作流返回的 output JSON，提取固定字段
 */
function parseCozeOutput(raw: string): {
  scores: Record<EmotionKey, number>;
  summary: string;
  colorAnalysis: string;
} {
  try {
    const obj = JSON.parse(raw);
    const output = obj.output ? (typeof obj.output === "string" ? JSON.parse(obj.output) : obj.output) : obj;
    const scores: Record<EmotionKey, number> = {
      calm: Number(output.calm ?? output.scores?.calm ?? 50),
      stress: Number(output.stress ?? output.scores?.stress ?? 50),
      joy: Number(output.joy ?? output.scores?.joy ?? 50),
      sadness: Number(output.sadness ?? output.scores?.sadness ?? 50),
    };
    return {
      scores,
      summary: String(output.summary ?? output.healingSummary ?? ""),
      colorAnalysis: String(output.colorAnalysis ?? output.healingColorAnalysis ?? ""),
    };
  } catch {
    return {
      scores: { calm: 50, stress: 50, joy: 50, sadness: 50 },
      summary: raw.slice(0, 500),
      colorAnalysis: "",
    };
  }
}

router.post("/analyze", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const body = (req.body?.data ?? req.body) as { workId?: string };
  const workId = body?.workId?.trim();

  logRequest("healing.ts:analyze:entry", "healing analyze request", {
    req,
    requestBody: body,
  });

  if (!workId) {
    sendErr(res, "Missing workId", 400);
    return;
  }

  const userId = req.userId;
  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }

  try {
    const Work = getWorkModel();
    const work = (await Work.findOne({ workId }).lean().exec()) as IWork | null;
    if (!work) {
      sendErr(res, "Work not found", 404);
      return;
    }

    if (work.authorId && work.authorId !== userId) {
      sendErr(res, "Forbidden", 403);
      return;
    }

    // 构造传给 Coze 工作流的参数（OSS 图片自动签名为临时 URL）
    const rawImageUrl = work.images?.[0]?.url ?? "";
    const imageUrl = resolveImageUrl(rawImageUrl);
    const workflowParams: Record<string, string> = {
      workId: work.workId,
      desc: work.desc ?? "",
      tags: (work.tags ?? []).join(","),
      imageUrl,
    };

    const runId = await submitWorkflow(workflowParams);

    // 立即标记为 pending 状态并记录 runId
    await Work.updateOne(
      { workId },
      {
        $set: {
          healing: {
            scores: { calm: 0, stress: 0, joy: 0, sadness: 0 },
            summary: "",
            colorAnalysis: "",
            status: "pending",
            isPublic: true,
            cozeRunId: runId,
          },
        },
      },
    ).exec();

    // 立即返回前端 pending 状态
    sendSucc(res, { workId, status: "pending", runId });

    // 后台异步轮询 Coze 结果
    pollWorkflowResult(runId)
      .then(async (output) => {
        const parsed = parseCozeOutput(output);
        await Work.updateOne(
          { workId },
          {
            $set: {
              "healing.scores": parsed.scores,
              "healing.summary": parsed.summary,
              "healing.colorAnalysis": parsed.colorAnalysis,
              "healing.status": "success",
              "healing.analyzedAt": new Date(),
            },
          },
        ).exec();
        logger.info("Coze analyze complete for workId=", workId);
      })
      .catch(async (err) => {
        logger.error("Coze analyze failed for workId=", workId, "error=", (err as Error).message);
        await Work.updateOne(
          { workId },
          { $set: { "healing.status": "failed" } },
        ).exec();
      });
  } catch (err) {
    logRequestError("healing.ts:analyze:error", "healing analyze error", {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Analyze failed", 500);
  }
});

router.get("/status", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const workId = (req.query?.workId as string | undefined)?.trim();
  const userId = req.userId;

  if (!workId) {
    sendErr(res, "Missing workId", 400);
    return;
  }
  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }

  try {
    const Work = getWorkModel();
    const work = (await Work.findOne({ workId }).lean().exec()) as IWork | null;
    if (!work) {
      sendErr(res, "Work not found", 404);
      return;
    }
    if (work.authorId !== userId) {
      sendErr(res, "Forbidden", 403);
      return;
    }

    const healing = work.healing;
    if (!healing) {
      sendSucc(res, { workId, status: "none" });
      return;
    }

    if (healing.status === "pending") {
      sendSucc(res, { workId, status: "pending" });
      return;
    }

    if (healing.status === "failed") {
      sendSucc(res, { workId, status: "failed" });
      return;
    }

    const dominant = pickDominantEmotion(healing.scores);
    sendSucc(res, {
      workId,
      status: "success",
      scores: healing.scores,
      summary: healing.summary,
      colorAnalysis: healing.colorAnalysis,
      isPublic: healing.isPublic,
      dominantEmotion: dominant.key,
      dominantEmotionLabel: dominant.label,
      dominantEmotionScore: dominant.value,
    });
  } catch (err) {
    logRequestError("healing.ts:status:error", "healing status error", {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Get status failed", 500);
  }
});

router.get("/report", async (req: MiniappRequest, res: Response) => {
  const workId = (req.query?.workId as string | undefined)?.trim();

  logRequest("healing.ts:report:entry", "healing report request", {
    req,
    requestBody: { workId },
  });

  if (!workId) {
    sendErr(res, "Missing workId", 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const work = (await Work.findOne({ workId }).lean().exec()) as IWork | null;

    if (!work) {
      sendErr(res, "Work not found", 404);
      return;
    }

    const viewerId = req.userId;
    const healingResp = buildHealingResponse(work, viewerId);
    sendSucc(res, healingResp);
  } catch (err) {
    logRequestError("healing.ts:report:error", "healing report error", {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Get report failed", 500);
  }
});

router.get("/list", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }

  logRequest("healing.ts:list:entry", "healing list request", {
    req,
    requestBody: { userId },
  });

  try {
    const Work = getWorkModel();
    const works = (await Work.find({ authorId: userId, "healing.status": "success" })
      .sort({ "healing.analyzedAt": -1, updatedAt: -1 })
      .lean()
      .exec()) as IWork[];

    const list = works.map((w) => {
      const healing = w.healing!;
      const cover = w.images?.[0];
      const dominant = pickDominantEmotion(healing.scores);

      return {
        workId: w.workId,
        isPublic: healing.isPublic,
        status: healing.status,
        scores: healing.scores,
        dominantEmotion: dominant.key,
        dominantEmotionLabel: dominant.label,
        dominantEmotionScore: dominant.value,
        coverUrl: cover?.url ?? "/static/home/card0.png",
        desc: w.desc ?? "",
        tags: w.tags ?? [],
        createdAt: healing.analyzedAt ?? w.updatedAt,
      };
    });

    sendSucc(res, list);
  } catch (err) {
    logRequestError("healing.ts:list:error", "healing list error", {
      req,
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Get list failed", 500);
  }
});

router.post("/privacy", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const body = (req.body?.data ?? req.body) as { workId?: string; isPublic?: boolean };
  const workId = body?.workId?.trim();
  const isPublic = body?.isPublic;

  const userId = req.userId;
  if (!userId) {
    sendErr(res, "Unauthorized", 401);
    return;
  }

  logRequest("healing.ts:privacy:entry", "healing privacy request", {
    req,
    requestBody: body,
  });

  if (!workId || typeof isPublic !== "boolean") {
    sendErr(res, "Invalid params", 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const work = (await Work.findOne({ workId }).lean().exec()) as IWork | null;

    if (!work) {
      sendErr(res, "Work not found", 404);
      return;
    }
    if (work.authorId !== userId) {
      sendErr(res, "Forbidden", 403);
      return;
    }
    if (!work.healing) {
      sendErr(res, "Report not found", 404);
      return;
    }

    await Work.updateOne({ workId }, { $set: { "healing.isPublic": isPublic } }).exec();

    sendSucc(res, { workId, isPublic });
  } catch (err) {
    logRequestError("healing.ts:privacy:error", "healing privacy error", {
      req,
      requestBody: body,
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Update privacy failed", 500);
  }
});

router.post("/delete", authMiddleware, async (req: MiniappRequest, res: Response) => {
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
    const work = (await Work.findOne({ workId }).lean().exec()) as IWork | null;

    if (!work) {
      sendErr(res, "Work not found", 404);
      return;
    }
    if (work.authorId !== userId) {
      sendErr(res, "Forbidden", 403);
      return;
    }
    if (!work.healing) {
      sendErr(res, "Report not found", 404);
      return;
    }

    await Work.updateOne({ workId }, { $set: { healing: null } }).exec();
    sendSucc(res, { workId });
  } catch (err) {
    logRequestError("healing.ts:delete:error", "healing delete error", {
      req,
      requestBody: body,
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, "Delete report failed", 500);
  }
});

export default router;
