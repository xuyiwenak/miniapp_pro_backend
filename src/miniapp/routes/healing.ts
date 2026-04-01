import { Router, type Request, type Response } from "express";
import { sendSucc, sendErr } from "../middleware/response";
import { authMiddleware, type MiniappRequest } from "../middleware/auth";
import { getWorkModel } from "../../dbservice/model/GlobalInfoDBModel";
import { logRequest, logRequestError } from "../../util/requestLogger";
import { notifyHealingUpdate } from "../ws/chatServer";
import { getCozeConfig, queryWorkflowOutputOnce, submitWorkflow } from "../../util/cozeWorkflow";
import { resolveImageUrl } from "../../util/imageUploader";
import { gameLogger as logger, cozeDebugLogger } from "../../util/logger";
import type { IWork, IHealingScores } from "../../entity/work.entity";
import { ComponentManager } from "../../common/BaseComponent";
import type { PlayerComponent } from "../../component/PlayerComponent";
import { getPlayerModel } from "../../dbservice/model/ZoneDBModel";
import { AccountLevel } from "../../shared/enum/AccountLevel";
import { getHealDailyLimit, getHealDailyUsage, incrementHealDailyUsage } from "../../auth/RedisTokenStore";

const router = Router();

const OSS_PREFIX = "oss://";

/**
 * 疗愈分析预估完成时长（秒）。
 * 后端通过 /healing/status 响应的 estimatedSeconds 字段下发给前端，
 * 前端 config/constants.js 的 HEALING_ESTIMATED_SECONDS 仅作离线 fallback，
 * 两处数值应保持一致。
 */
const HEALING_ESTIMATED_SECONDS = 600;

/**
 * 情绪维度配置 —— 后端唯一配置源
 * 新增维度只需在此数组追加一项，Coze 工作流也需同步输出对应 key。
 * key:   与 MongoDB scores 字段 key 及 Coze 输出字段名一致
 * label: 前端展示文案
 * emoji: 前端图标
 */
const SCORE_DIMENSIONS = [
  { key: "joy",             label: "快乐",   emoji: "✨" },
  { key: "calm",            label: "平静",   emoji: "🌿" },
  { key: "anxiety",         label: "焦虑",   emoji: "😰" },
  { key: "fear",            label: "恐惧",   emoji: "😨" },
  { key: "solitude",        label: "孤僻",   emoji: "🌑" },
  { key: "passion",         label: "热情",   emoji: "🔥" },
  { key: "social_aversion", label: "社交抵触", emoji: "🚧" },
  { key: "vitality",        label: "活力",   emoji: "⚡" },
] as const satisfies { key: string; label: string; emoji: string }[];

type EmotionKey = typeof SCORE_DIMENSIONS[number]["key"];

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

function normalizeScores(raw: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  SCORE_DIMENSIONS.forEach(({ key }) => {
    const v = raw[key] ?? 0;
    const scaled = 20 + v * 75;
    result[key] = Math.round(Math.max(5, Math.min(98, scaled)));
  });
  return result;
}

function analyzeTextTendencies(text: string): Record<string, number> {
  const lower = text.toLowerCase();
  const containsAny = (words: string[]) => words.some((w) => lower.includes(w.toLowerCase()));
  const boosts: Record<string, number> = {};

  if (containsAny(["阳光", "温暖", "愉悦", "开心", "喜悦", "快乐"]))       boosts["joy"]             = 0.25;
  if (containsAny(["宁静", "平静", "治愈", "放松", "冥想", "安静"]))        boosts["calm"]            = 0.25;
  if (containsAny(["焦虑", "压力", "紧张", "deadline", "加班", "疲惫"]))   boosts["anxiety"]         = 0.25;
  if (containsAny(["恐惧", "害怕", "恐慌", "不安", "惊恐"]))               boosts["fear"]            = 0.25;
  if (containsAny(["孤独", "独处", "疏离", "隔绝", "沉默"]))               boosts["solitude"]        = 0.25;
  if (containsAny(["热情", "激情", "澎湃", "燃烧", "雀跃"]))               boosts["passion"]         = 0.25;
  if (containsAny(["不想社交", "回避", "冷漠", "抵触", "排斥"]))           boosts["social_aversion"] = 0.25;
  if (containsAny(["活力", "精力", "元气", "充沛", "奔放"]))               boosts["vitality"]        = 0.25;

  return boosts;
}

function buildMockSummary(): string {
  return "你的画作中流露出宁静而温柔的力量，色彩与线条像一面柔软的镜子，安静地陪你看见此刻的心情，这是一份值得被好好珍藏的疗愈创作。";
}

function buildColorAnalysis(): string {
  return "整体色彩可被理解为柔和的莫兰迪疗愈系配色，在低饱和度的冷暖过渡中，帮助情绪慢慢舒缓下来，营造出安全、可停靠的内在空间。";
}

function generateMockScoresForWork(work: IWork): Record<string, number> {
  const seedSource = `${work.workId}|${work.authorId ?? ""}|${work.desc ?? ""}|${(work.tags ?? []).join(",")}`;
  const seed = hashStringToSeed(seedSource);
  const rng = createRng(seed);
  const boosts = analyzeTextTendencies(`${work.desc ?? ""} ${(work.tags ?? []).join(" ")}`);

  const raw: Record<string, number> = {};
  SCORE_DIMENSIONS.forEach(({ key }) => {
    raw[key] = Math.min(1, Math.max(0, rng() * 0.8 + (boosts[key] ?? 0)));
  });

  return normalizeScores(raw);
}

function pickDominantEmotion(scores: IHealingScores): { key: string; label: string; value: number } {
  const entries = SCORE_DIMENSIONS
    .map(({ key, label }) => ({ key, label, value: scores[key] ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const top = entries[0] ?? { key: "calm", label: "平静", value: 0 };
  return { key: top.key, label: top.label, value: top.value };
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
    healingScoreDimensions: SCORE_DIMENSIONS,
    healingSummary: healing.summary,
    healingColorAnalysis: healing.colorAnalysis,
    healingStatus: healing.status,
    healingSubmittedAt: healing.submittedAt ?? null,
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
  scores: Record<string, number>;
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
    // ── [DEBUG] 每层解包结果 ───────────────────────────────────────
    logger.info(`[coze-debug] unwrap depth=${depth} keys:`, Object.keys(o));
    const next = o.Output ?? o.output;
    if (next == null) {
      cozeDebugLogger.info("[coze-debug] unwrap final object:", JSON.stringify(o).slice(0, 1000));
      return o as Record<string, unknown>;
    }
    obj = typeof next === "string" ? JSON.parse(next) : next;
  }
  return (obj as Record<string, unknown>) ?? {};
}

/**
 * 根据 line_analysis.energy_score (0-10) 推导四项情绪分数，保证雷达图有数据
 */
function scoresFromEnergyScore(energyScore: number): Record<string, number> {
  const e = Math.max(0, Math.min(10, Number(energyScore) || 5));
  const t = (e / 10) * 80 + 10; // 高能量 → 高活跃度
  // 按语义推导各维度：高能量→活力/热情/快乐高，平静/焦虑/恐惧低
  const derived: Record<string, number> = {
    joy:             t * 0.9,
    calm:            100 - t * 0.6,
    anxiety:         t * 0.3,
    fear:            t * 0.2,
    solitude:        (100 - t) * 0.5,
    passion:         t * 0.85,
    social_aversion: (100 - t) * 0.4,
    vitality:        t * 0.95,
  };
  const result: Record<string, number> = {};
  SCORE_DIMENSIONS.forEach(({ key }) => {
    result[key] = Math.max(5, Math.min(98, Math.round(derived[key] ?? 50)));
  });
  return result;
}

/**
 * 解析 Coze 工作流返回的 output JSON，兼容新版结构（insight/color_analysis/line_analysis 等）与旧版
 */
function parseCozeOutput(raw: string): ParsedHealingReport {
  const fallback: ParsedHealingReport = {
    scores: Object.fromEntries(SCORE_DIMENSIONS.map(({ key }) => [key, 50])),
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

    const rawScores = output.scores as Record<string, number> | undefined;
    const hasDimScore = SCORE_DIMENSIONS.some(
      ({ key }) => typeof output[key] === "number" || typeof rawScores?.[key] === "number",
    );
    let scores: Record<string, number>;
    if (hasDimScore) {
      scores = {};
      SCORE_DIMENSIONS.forEach(({ key }) => {
        scores[key] = Number(output[key] ?? rawScores?.[key] ?? 50);
      });
    } else if (typeof lineAnalysisObj?.energy_score === "number") {
      scores = scoresFromEnergyScore(lineAnalysisObj.energy_score);
    } else {
      scores = Object.fromEntries(SCORE_DIMENSIONS.map(({ key }) => [key, 50]));
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
  // ── [DEBUG] 进入解析前记录完整原始字符串 ──────────────────────────
  cozeDebugLogger.info("[coze-debug] outputRaw (full):", outputRaw);

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

  // ── [DEBUG] 解析结果 ────────────────────────────────────────────
  cozeDebugLogger.info("[coze-debug] parseCozeOutput result:", {
    scores: parsed.scores,
    summary: parsed.summary?.slice(0, 100),
    colorAnalysis: parsed.colorAnalysis?.slice(0, 100),
    compositionReport: parsed.compositionReport?.slice(0, 100),
    lineAnalysis: parsed.lineAnalysis,
    suggestion: parsed.suggestion?.slice(0, 100),
    keyColors: parsed.keyColors,
  });
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

  // ── [DEBUG] 原始请求体 ──────────────────────────────────────────
  cozeDebugLogger.info("[coze-debug] raw body:", JSON.stringify(req.body));

  try {
    const parsed = parseCozeWebhookPayload(req.body);
    const runId = parsed.runId?.trim();

    // ── [DEBUG] 解包后字段 ─────────────────────────────────────────
    cozeDebugLogger.info("[coze-debug] parsed webhook:", {
      runId: parsed.runId,
      executeStatus: parsed.executeStatus,
      errorMessage: parsed.errorMessage,
      outputSnippet: parsed.output ? parsed.output.slice(0, 500) : null,
    });

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
            scores: Object.fromEntries(SCORE_DIMENSIONS.map(({ key }) => [key, 0])),
            summary: "",
            colorAnalysis: "",
            status: "pending",
            isPublic: false,
            cozeRunId: runId,
            submittedAt: new Date(),
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
      sendSucc(res, { workId, status: "pending", submittedAt: healing.submittedAt, estimatedSeconds: HEALING_ESTIMATED_SECONDS });
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
      scoreDimensions: SCORE_DIMENSIONS,
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
