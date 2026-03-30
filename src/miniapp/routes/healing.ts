import { Router, type Request, type Response } from "express";
import { sendSucc, sendErr } from "../middleware/response";
import { authMiddleware, type MiniappRequest } from "../middleware/auth";
import { getWorkModel } from "../../dbservice/model/GlobalInfoDBModel";
import { logRequest, logRequestError } from "../../util/requestLogger";
import { notifyHealingUpdate } from "../ws/chatServer";
import { getCozeConfig, queryWorkflowOutputOnce, submitWorkflow } from "../../util/cozeWorkflow";
import { resolveImageUrl } from "../../util/imageUploader";
import { gameLogger as logger } from "../../util/logger";
import type { IWork, IHealingScores } from "../../entity/work.entity";
import { ComponentManager } from "../../common/BaseComponent";
import type { PlayerComponent } from "../../component/PlayerComponent";
import { getPlayerModel } from "../../dbservice/model/ZoneDBModel";
import { AccountLevel } from "../../shared/enum/AccountLevel";
import { getHealDailyLimit, getHealDailyUsage, incrementHealDailyUsage } from "../../auth/RedisTokenStore";

const router = Router();

const OSS_PREFIX = "oss://";

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
  const isOwner = !!(work.authorId && viewerId && work.authorId === viewerId);

  if (!healing) {
    return { healingAnalyzed: false, isOwner };
  }

  if (!healing.isPublic && !isOwner) {
    return {
      healingAnalyzed: true,
      healingVisible: false,
      healingIsPublic: false,
      isOwner: false,
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
    healingCompositionReport: healing.compositionReport,
    healingLineAnalysis: healing.lineAnalysis,
    healingSuggestion: healing.suggestion,
    healingKeyColors: healing.keyColors,
    isOwner,
  };
}

export { buildHealingResponse };

/** Coze 新版输出中的线条分析 */
interface CozeLineAnalysis {
  energy_score?: number;
  interpretation?: string;
  style?: string;
}

/** Coze 新版输出中的色彩分析 */
interface CozeColorAnalysis {
  interpretation?: string;
  key_colors?: string[];
}

/** 解析后的完整报告（含可选扩展字段） */
export interface ParsedHealingReport {
  scores: Record<EmotionKey, number>;
  summary: string;
  colorAnalysis: string;
  compositionReport?: string;
  lineAnalysis?: CozeLineAnalysis;
  suggestion?: string;
  keyColors?: string[];
}

/**
 * 从 Coze 多层嵌套字符串中解析出最内层 output 对象
 * 格式可能为: {"Output":"\"{\\\"output\\\":\\\"{...}\\\"}\"}"} 或 {"output": {...}}
 */
function unwrapCozeOutput(raw: string): Record<string, unknown> {
  let obj: unknown = JSON.parse(raw);
  for (let depth = 0; depth < 5 && obj !== null && typeof obj === "object"; depth++) {
    const o = obj as Record<string, unknown>;
    const next = o.Output ?? o.output;
    if (next == null) return o as Record<string, unknown>;
    obj = typeof next === "string" ? JSON.parse(next) : next;
  }
  return (obj as Record<string, unknown>) ?? {};
}

/**
 * 根据 line_analysis.energy_score (0-10) 推导四项情绪分数，保证雷达图有数据
 */
function scoresFromEnergyScore(energyScore: number): Record<EmotionKey, number> {
  const e = Math.max(0, Math.min(10, Number(energyScore) || 5));
  const t = (e / 10) * 80 + 10;
  const calm = Math.round(100 - t);
  const joy = Math.round(t * 0.9);
  const stress = Math.round(t * 0.4);
  const sadness = Math.round((100 - t) * 0.5);
  return {
    calm: Math.max(5, Math.min(98, calm)),
    stress: Math.max(5, Math.min(98, stress)),
    joy: Math.max(5, Math.min(98, joy)),
    sadness: Math.max(5, Math.min(98, sadness)),
  };
}

/**
 * 解析 Coze 工作流返回的 output JSON，兼容新版结构（insight/color_analysis/line_analysis 等）与旧版
 */
function parseCozeOutput(raw: string): ParsedHealingReport {
  const fallback: ParsedHealingReport = {
    scores: { calm: 50, stress: 50, joy: 50, sadness: 50 },
    summary: raw.slice(0, 500),
    colorAnalysis: "",
  };
  try {
    const output = unwrapCozeOutput(raw) as Record<string, unknown>;

    const colorAnalysisObj = output.color_analysis as CozeColorAnalysis | undefined;
    const lineAnalysisObj = output.line_analysis as CozeLineAnalysis | undefined;
    const keyColors = Array.isArray(colorAnalysisObj?.key_colors) ? colorAnalysisObj.key_colors : undefined;
    const colorInterpretation = colorAnalysisObj?.interpretation ?? "";
    const colorAnalysis =
      colorInterpretation +
      (keyColors?.length ? (colorInterpretation ? " 主色：" : "主色：") + keyColors.join("、") : "");

    const summary =
      String(output.insight ?? output.summary ?? output.healingSummary ?? "").trim() ||
      String(output.composition_report ?? "").trim();

    let scores: Record<EmotionKey, number>;
    if (
      typeof output.calm === "number" ||
      typeof output.stress === "number" ||
      (output.scores && typeof (output.scores as Record<string, number>).calm === "number")
    ) {
      scores = {
        calm: Number(output.calm ?? (output.scores as Record<string, number>)?.calm ?? 50),
        stress: Number(output.stress ?? (output.scores as Record<string, number>)?.stress ?? 50),
        joy: Number(output.joy ?? (output.scores as Record<string, number>)?.joy ?? 50),
        sadness: Number(output.sadness ?? (output.scores as Record<string, number>)?.sadness ?? 50),
      };
    } else if (typeof lineAnalysisObj?.energy_score === "number") {
      scores = scoresFromEnergyScore(lineAnalysisObj.energy_score);
    } else {
      scores = { calm: 50, stress: 50, joy: 50, sadness: 50 };
    }

    const compositionReport =
      typeof output.composition_report === "string" ? output.composition_report.trim() : undefined;
    const suggestion = typeof output.suggestion === "string" ? output.suggestion.trim() : undefined;
    const lineAnalysis =
      lineAnalysisObj && (lineAnalysisObj.interpretation ?? lineAnalysisObj.style ?? lineAnalysisObj.energy_score != null)
        ? {
          interpretation: lineAnalysisObj.interpretation,
          style: lineAnalysisObj.style,
          energy_score: lineAnalysisObj.energy_score,
        }
        : undefined;

    return {
      scores,
      summary: summary || fallback.summary,
      colorAnalysis: colorAnalysis || fallback.colorAnalysis,
      compositionReport: compositionReport || undefined,
      lineAnalysis,
      suggestion,
      keyColors: keyColors?.length ? keyColors : undefined,
    };
  } catch {
    return fallback;
  }
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length) return v;
  }
  return undefined;
}

function normalizeCozeOutputField(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** 兼容多种扣子/开放接口可能推送的 JSON 结构 */
function parseCozeWebhookPayload(body: unknown): {
  runId?: string;
  executeStatus?: string;
  output?: string;
  errorMessage?: string;
} {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  let runId = firstString(b, ["run_id", "execute_id", "executeId", "id"]);
  let output = normalizeCozeOutputField(b.output ?? b.Output);
  let executeStatus = firstString(b, ["execute_status", "executeStatus", "status"]);
  let errorMessage = firstString(b, ["error_message", "errorMessage", "error"]);

  const data = b.data;
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
    const d = data[0] as Record<string, unknown>;
    runId = runId ?? firstString(d, ["execute_id", "run_id", "id"]);
    output = output ?? normalizeCozeOutputField(d.output ?? d.Output);
    executeStatus = executeStatus ?? firstString(d, ["execute_status", "executeStatus"]);
    errorMessage = errorMessage ?? firstString(d, ["error_message", "errorMessage"]);
  } else if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    runId = runId ?? firstString(d, ["execute_id", "run_id", "id"]);
    output = output ?? normalizeCozeOutputField(d.output ?? d.Output);
    executeStatus = executeStatus ?? firstString(d, ["execute_status", "executeStatus"]);
    errorMessage = errorMessage ?? firstString(d, ["error_message", "errorMessage"]);
  }

  if (typeof b.code === "number" && b.code !== 0 && !errorMessage) {
    errorMessage = String(b.msg ?? "Coze error");
  }

  return { runId, executeStatus, output, errorMessage };
}

async function applyHealingSuccessFromRunId(runId: string, outputRaw: string): Promise<void> {
  const Work = getWorkModel();
  const work = (await Work.findOne({ "healing.cozeRunId": runId }).lean().exec()) as IWork | null;
  if (!work) {
    logger.warn("Coze webhook: no work for cozeRunId=", runId);
    return;
  }
  if (work.healing?.status === "success") {
    logger.info("Coze webhook idempotent skip, workId=", work.workId);
    return;
  }
  const parsed = parseCozeOutput(outputRaw);
  const { workId } = work;
  const updatePayload: Record<string, unknown> = {
    "healing.scores": parsed.scores,
    "healing.summary": parsed.summary,
    "healing.colorAnalysis": parsed.colorAnalysis,
    "healing.status": "success",
    "healing.analyzedAt": new Date(),
  };
  if (parsed.compositionReport != null) updatePayload["healing.compositionReport"] = parsed.compositionReport;
  if (parsed.lineAnalysis != null) updatePayload["healing.lineAnalysis"] = parsed.lineAnalysis;
  if (parsed.suggestion != null) updatePayload["healing.suggestion"] = parsed.suggestion;
  if (parsed.keyColors != null && parsed.keyColors.length) updatePayload["healing.keyColors"] = parsed.keyColors;
  await Work.updateOne({ workId }, { $set: updatePayload }).exec();
  logger.info("Coze webhook success for workId=", workId);
  if (work.authorId) {
    notifyHealingUpdate(String(work.authorId), { workId, status: "success" });
  }
}

async function markHealingFailedByRunId(runId: string): Promise<void> {
  const Work = getWorkModel();
  const work = (await Work.findOne({ "healing.cozeRunId": runId }).lean().exec()) as IWork | null;
  const r = await Work.updateOne(
    { "healing.cozeRunId": runId },
    { $set: { "healing.status": "failed" } },
  ).exec();
  if (r.matchedCount === 0) {
    logger.warn("Coze webhook fail: no work for cozeRunId=", runId);
    return;
  }
  if (work?.authorId) {
    notifyHealingUpdate(String(work.authorId), { workId: work.workId, status: "failed" });
  }
}

/** Coze 异步完成回调（无用户 JWT；可选 webhookSecret 作为 query token） */
router.post("/coze/callback", async (req: Request, res: Response) => {
  const cfg = getCozeConfig();
  const secret = cfg.webhookSecret?.trim();
  if (secret) {
    const t = req.query?.token;
    if (typeof t !== "string" || t !== secret) {
      res.status(403).json({ code: 403, success: false, message: "Forbidden" });
      return;
    }
  }

  try {
    const parsed = parseCozeWebhookPayload(req.body);
    const runId = parsed.runId?.trim();
    if (!runId) {
      logger.error("Coze webhook missing run_id, body=", JSON.stringify(req.body).slice(0, 800));
      res.status(400).json({ code: 400, success: false, message: "Missing run id" });
      return;
    }

    const statusRaw = (parsed.executeStatus ?? "").trim();
    const upper = statusRaw.toUpperCase();

    if (upper === "FAIL" || upper === "FAILED" || parsed.errorMessage) {
      await markHealingFailedByRunId(runId);
      res.status(200).json({ code: 200, success: true });
      return;
    }

    if (upper === "RUNNING" || upper === "PENDING") {
      res.status(200).json({ code: 200, success: true, message: "ignored" });
      return;
    }

    if (upper === "SUCCESS" || upper === "SUCCEEDED" || parsed.output != null) {
      const out = parsed.output ?? "{}";
      await applyHealingSuccessFromRunId(runId, out);
      res.status(200).json({ code: 200, success: true });
      return;
    }

    res.status(400).json({ code: 400, success: false, message: "Unrecognized webhook payload" });
  } catch (err) {
    logger.error("Coze webhook handler error", (err as Error).message);
    res.status(500).json({ code: 500, success: false, message: "Internal error" });
  }
});

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

  // ── 每日配额检查 ──
  try {
    const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>("PlayerComponent");
    const zoneId = playerComp?.getDefaultZoneId();
    if (zoneId) {
      const Player = getPlayerModel(zoneId);
      const player = await Player.findOne({ userId }).select("level").lean().exec();
      const isSuperAdmin = player?.level === AccountLevel.SuperAdmin;
      if (!isSuperAdmin) {
        const [limit, used] = await Promise.all([getHealDailyLimit(), getHealDailyUsage(userId)]);
        if (used >= limit) {
          sendErr(res, `今日分析次数已用完（每日限${limit}次），请明天再试`, 429);
          return;
        }
      }
    }
  } catch (quotaErr) {
    logger.error("heal quota check error", (quotaErr as Error).message);
    // 配额检查失败时放行，不影响主功能
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
    // 注意：parameters 的 key 必须与 Coze 工作流「开始节点」里配置的变量名完全一致
    const rawImageUrl = work.images?.[0]?.url ?? "";
    const imageUrl = resolveImageUrl(rawImageUrl);
    const workflowParams: Record<string, string> = {
      workId: work.workId,
      desc: work.desc ?? "",
      tags: (work.tags ?? []).join(","),
      imageUrl,
      image_url: imageUrl, // 兼容工作流里使用 snake_case 变量名
    };

    const runId = await submitWorkflow(workflowParams);

    // 提交成功后计入当日用量（失败时不计）
    void incrementHealDailyUsage(userId).catch(() => {});

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
            isPublic: false,
            cozeRunId: runId,
          },
        },
      },
    ).exec();

    // 立即返回前端 pending 状态（完成由 Coze POST /healing/coze/callback 写库）
    sendSucc(res, { workId, status: "pending", runId });

    const cozeCfg = getCozeConfig();
    const fallbackMs = cozeCfg.fallbackPollAfterMs ?? 0;
    if (fallbackMs > 0) {
      setTimeout(() => {
        void (async () => {
          try {
            const pending = (await Work.findOne({ workId, "healing.status": "pending" }).lean().exec()) as IWork | null;
            if (!pending) return;
            const out = await queryWorkflowOutputOnce(runId);
            if (out === null) return;
            await applyHealingSuccessFromRunId(runId, out);
          } catch (err) {
            logger.error("Coze fallback poll failed workId=", workId, (err as Error).message);
            await Work.updateOne({ workId }, { $set: { "healing.status": "failed" } }).exec();
          }
        })();
      }, fallbackMs);
    }
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
      compositionReport: healing.compositionReport,
      lineAnalysis: healing.lineAnalysis,
      suggestion: healing.suggestion,
      keyColors: healing.keyColors,
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
      const rawCoverUrl = cover?.url ?? "/static/home/card0.png";
      const coverUrl =
        rawCoverUrl && rawCoverUrl.startsWith(OSS_PREFIX)
          ? resolveImageUrl(rawCoverUrl)
          : rawCoverUrl;

      return {
        workId: w.workId,
        isPublic: healing.isPublic,
        status: healing.status,
        scores: healing.scores,
        dominantEmotion: dominant.key,
        dominantEmotionLabel: dominant.label,
        dominantEmotionScore: dominant.value,
        coverUrl,
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
