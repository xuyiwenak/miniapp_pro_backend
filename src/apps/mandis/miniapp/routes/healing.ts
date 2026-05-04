import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { sendSucc, sendErr } from '../../../../shared/miniapp/middleware/response';
import { authMiddleware, type MiniappRequest } from '../../../../shared/miniapp/middleware/auth';
import { getWorkModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import { logRequest, logRequestError } from '../../../../util/requestLogger';
import { notifyHealingUpdate } from '../ws/chatServer';
import { getCozeConfig } from '../../../../util/cozeWorkflow';
import { analyzeArtwork, NotArtworkError } from '../../../../util/qwenVlAnalyzer';
import { resolveImageUrl } from '../../../../util/imageUploader';
import { gameLogger as logger, cozeDebugLogger } from '../../../../util/logger';
import type { IWork, IHealingData, IHealingScores, IHealingVad } from '../../../../entity/work.entity';
import { ComponentManager } from '../../../../common/BaseComponent';
import type { PlayerComponent } from '../../../../component/PlayerComponent';
import { getPlayerModel } from '../../../../dbservice/model/ZoneDBModel';
import { AccountLevel } from '../../../../shared/enum/AccountLevel';
import { getHealDailyLimit, getHealDailyUsage, incrementHealDailyUsage } from '../../../../auth/RedisTokenStore';

const router = Router();

const OSS_PREFIX = 'oss://';

/**
 * 疗愈分析预估完成时长（秒）。
 * 后端通过 /healing/status 响应的 estimatedSeconds 字段下发给前端，
 * 前端 config/constants.js 的 HEALING_ESTIMATED_SECONDS 仅作离线 fallback，
 * 两处数值应保持一致。
 */
const HEALING_ESTIMATED_SECONDS = 600;

/** 分数归一化：最小值阈值 */
const SCORE_MIN_THRESHOLD = 5;

/** 分数归一化：最大值阈值 */
const SCORE_MAX_THRESHOLD = 98;

/** Coze输出解包的最大递归深度 */
const MAX_UNWRAP_DEPTH = 5;

/** Coze输出截断长度（用于日志） */
const COZE_OUTPUT_TRUNCATE_LENGTH = 1000;

/** 能量分数的最小值 */
const ENERGY_SCORE_MIN = 0;

/** 能量分数的最大值 */
const ENERGY_SCORE_MAX = 10;

/** 能量分数的默认值（当无法解析时） */
const ENERGY_SCORE_DEFAULT = 5;

/** 能量分数转换为情绪分数的基础偏移 */
const ENERGY_TO_EMOTION_OFFSET = 10;

/** 能量分数转换为情绪分数的缩放系数 */
const ENERGY_TO_EMOTION_SCALE = 80;

/** VAD 效价/唤醒高阈值（≥此值视为"高"） */
const VAD_HIGH_THRESHOLD = 55;

/** VAD 效价/唤醒低阈值（<此值视为"低"） */
const VAD_LOW_THRESHOLD = 45;

const VAD_QUADRANT_ACTIVE_POSITIVE = '活跃积极';
const VAD_QUADRANT_CALM_POSITIVE = '平静愉悦';
const VAD_QUADRANT_TENSE_NEGATIVE = '紧张焦虑';
const VAD_QUADRANT_SUPPRESSED = '压抑低沉';
const VAD_QUADRANT_BALANCED = '情绪平衡';

// 情绪维度系数（从能量分数推导各维度）
const EMOTION_COEFFICIENT_JOY = 0.9;
const EMOTION_COEFFICIENT_CALM = 0.6;
const EMOTION_COEFFICIENT_ANXIETY = 0.3;
const EMOTION_COEFFICIENT_FEAR = 0.2;
const EMOTION_COEFFICIENT_SOLITUDE = 0.15;
const EMOTION_COEFFICIENT_PASSION = 0.85;
const EMOTION_COEFFICIENT_SOCIAL_AVERSION = 0.2;
const EMOTION_COEFFICIENT_VITALITY = 0.95;

/**
 * 情绪维度配置 —— 后端唯一配置源
 * 新增维度只需在此数组追加一项，Coze 工作流也需同步输出对应 key。
 * key:   与 MongoDB scores 字段 key 及 Coze 输出字段名一致
 * label: 前端展示文案
 * emoji: 前端图标
 */
const SCORE_DIMENSIONS = [
  { key: 'joy',             label: '快乐',   emoji: '✨' },
  { key: 'calm',            label: '平静',   emoji: '🌿' },
  { key: 'anxiety',         label: '焦虑',   emoji: '😰' },
  { key: 'fear',            label: '恐惧',   emoji: '😨' },
  { key: 'solitude',        label: '孤僻',   emoji: '🌑' },
  { key: 'passion',         label: '热情',   emoji: '🔥' },
  { key: 'social_aversion', label: '社交抵触', emoji: '🚧' },
  { key: 'vitality',        label: '活力',   emoji: '⚡' },
] as const satisfies { key: string; label: string; emoji: string }[];

function pickDominantEmotion(scores: IHealingScores): { key: string; label: string; value: number } {
  const entries = SCORE_DIMENSIONS
    .map(({ key, label }) => ({ key, label, value: scores[key] ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const top = entries[0] ?? { key: 'calm', label: '平静', value: 0 };
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
    healingVad: healing.vad ?? null,
    isOwner,
  };
}

export { buildHealingResponse };

// ========== Helper Functions for /coze/callback Route ==========

/**
 * 验证 Coze webhook 的 token
 * @returns true 如果验证通过或无需验证，false 如果验证失败
 */
function verifyWebhookToken(req: Request, res: Response): boolean {
  const cfg = getCozeConfig();
  const secret = cfg.webhookSecret?.trim();

  if (!secret) return true; // 无密钥配置，放行

  const token = req.query?.token;
  if (typeof token !== 'string' || token !== secret) {
    res.status(403).json({ code: 403, success: false, message: 'Forbidden' });
    return false;
  }

  return true;
}

/**
 * 根据 Coze 工作流执行状态处理疗愈分析结果
 */
async function handleWebhookStatus(
  runId: string,
  status: string,
  output: string | null,
  errorMessage: string | undefined,
  res: Response,
): Promise<void> {
  const upper = status.toUpperCase();

  // 失败状态
  if (upper === 'FAIL' || upper === 'FAILED' || errorMessage) {
    await markHealingFailedByRunId(runId);
    res.status(200).json({ code: 200, success: true });
    return;
  }

  // 运行中状态（忽略）
  if (upper === 'RUNNING' || upper === 'PENDING') {
    res.status(200).json({ code: 200, success: true, message: 'ignored' });
    return;
  }

  // 成功状态
  if (upper === 'SUCCESS' || upper === 'SUCCEEDED' || output !== null) {
    const out = output ?? '{}';
    await applyHealingSuccessFromRunId(runId, out);
    res.status(200).json({ code: 200, success: true });
    return;
  }

  // 无法识别的状态
  res.status(400).json({ code: 400, success: false, message: 'Unrecognized webhook payload' });
}

// ========== Helper Functions for /analyze Route ==========

/**
 * 检查用户每日疗愈分析配额
 * @throws 如果配额已用完，通过 sendErr 发送 429 错误
 */
async function checkDailyQuota(userId: string, res: Response): Promise<boolean> {
  try {
    const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
    const zoneId = playerComp?.getDefaultZoneId();
    if (!zoneId) return true;

    const Player = getPlayerModel(zoneId);
    const player = await Player.findOne({ userId }).select('level').lean().exec();
    const isSuperAdmin = player?.level === AccountLevel.SuperAdmin;

    if (isSuperAdmin) return true;

    const [limit, used] = await Promise.all([getHealDailyLimit(), getHealDailyUsage(userId)]);
    if (used >= limit) {
      sendErr(res, `今日分析次数已用完（每日限${limit}次），请明天再试`, 429);
      return false;
    }

    return true;
  } catch (quotaErr) {
    logger.error('heal quota check error', (quotaErr as Error).message);
    return true; // 配额检查失败时放行，不影响主功能
  }
}

/**
 * 验证作品存在且用户有权限访问
 * @throws 如果作品不存在或无权限，通过 sendErr 发送错误
 */
async function validateWorkOwnership(workId: string, userId: string, res: Response): Promise<IWork | null> {
  const Work = getWorkModel();
  const work = (await Work.findOne({ workId }).lean().exec()) as IWork | null;

  if (!work) {
    sendErr(res, 'Work not found', 404);
    return null;
  }

  if (work.authorId && work.authorId !== userId) {
    sendErr(res, 'Forbidden', 403);
    return null;
  }

  return work;
}

/**
 * 初始化作品的疗愈分析状态为 pending
 */
async function initializePendingHealing(workId: string, runId: string): Promise<void> {
  const Work = getWorkModel();
  await Work.updateOne(
    { workId },
    {
      $set: {
        healing: {
          scores: Object.fromEntries(SCORE_DIMENSIONS.map(({ key }) => [key, 0])),
          summary: '',
          colorAnalysis: '',
          status: 'pending',
          isPublic: false,
          cozeRunId: runId,
          submittedAt: new Date(),
        },
      },
    },
  ).exec();
}

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
  vad?: IHealingVad;
}

function clampVadScore(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function computeVadQuadrant(valence: number, arousal: number): string {
  const vHigh = valence >= VAD_HIGH_THRESHOLD;
  const vLow = valence < VAD_LOW_THRESHOLD;
  const aHigh = arousal >= VAD_HIGH_THRESHOLD;
  const aLow = arousal < VAD_LOW_THRESHOLD;
  if (vHigh && aHigh) return VAD_QUADRANT_ACTIVE_POSITIVE;
  if (vHigh && aLow) return VAD_QUADRANT_CALM_POSITIVE;
  if (vLow && aHigh) return VAD_QUADRANT_TENSE_NEGATIVE;
  if (vLow && aLow) return VAD_QUADRANT_SUPPRESSED;
  return VAD_QUADRANT_BALANCED;
}

function parseVad(output: Record<string, unknown>): IHealingVad | undefined {
  const raw = output.vad as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  const valence = clampVadScore(raw.valence);
  const arousal = clampVadScore(raw.arousal);
  const dominance = clampVadScore(raw.dominance);
  const interpretation = typeof raw.interpretation === 'string' ? raw.interpretation.trim() : '';
  return { valence, arousal, dominance, quadrant: computeVadQuadrant(valence, arousal), interpretation };
}

/**
 * 从 Coze 多层嵌套字符串中解析出最内层 output 对象
 * 格式可能为: {"Output":"\"{\\\"output\\\":\\\"{...}\\\"}\"}"} 或 {"output": {...}}
 */
function unwrapCozeOutput(raw: string): Record<string, unknown> {
  let obj: unknown = JSON.parse(raw);
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH && obj !== null && typeof obj === 'object'; depth++) {
    const o = obj as Record<string, unknown>;
    // ── [DEBUG] 每层解包结果 ───────────────────────────────────────
    logger.info(`[coze-debug] unwrap depth=${depth} keys:`, Object.keys(o));
    const next = o.Output ?? o.output;
    if (next === null || next === undefined) {
      cozeDebugLogger.info('[coze-debug] unwrap final object:', JSON.stringify(o).slice(0, COZE_OUTPUT_TRUNCATE_LENGTH));
      return o as Record<string, unknown>;
    }
    obj = typeof next === 'string' ? JSON.parse(next) : next;
  }
  return (obj as Record<string, unknown>) ?? {};
}

/**
 * 根据 line_analysis.energy_score (0-10) 推导四项情绪分数，保证雷达图有数据
 */
function scoresFromEnergyScore(energyScore: number): Record<string, number> {
  const e = Math.max(ENERGY_SCORE_MIN, Math.min(ENERGY_SCORE_MAX, Number(energyScore) || ENERGY_SCORE_DEFAULT));
  const t = (e / ENERGY_SCORE_MAX) * ENERGY_TO_EMOTION_SCALE + ENERGY_TO_EMOTION_OFFSET; // 高能量 → 高活跃度
  // 按语义推导各维度：高能量→活力/热情/快乐高，平静/焦虑/恐惧低
  const derived: Record<string, number> = {
    joy:             t * EMOTION_COEFFICIENT_JOY,
    calm:            100 - t * EMOTION_COEFFICIENT_CALM,
    anxiety:         t * EMOTION_COEFFICIENT_ANXIETY,
    fear:            t * EMOTION_COEFFICIENT_FEAR,
    solitude:        (100 - t) * EMOTION_COEFFICIENT_SOLITUDE,
    passion:         t * EMOTION_COEFFICIENT_PASSION,
    social_aversion: (100 - t) * EMOTION_COEFFICIENT_SOCIAL_AVERSION,
    vitality:        t * EMOTION_COEFFICIENT_VITALITY,
  };
  const result: Record<string, number> = {};
  SCORE_DIMENSIONS.forEach(({ key }) => {
    result[key] = Math.max(SCORE_MIN_THRESHOLD, Math.min(SCORE_MAX_THRESHOLD, Math.round(derived[key] ?? 50)));
  });
  return result;
}

// ========== Helper Functions for parseCozeOutput ==========

/**
 * 解析色彩分析字段
 */
function parseColorAnalysis(colorAnalysisObj: CozeColorAnalysis | undefined): {
  colorAnalysis: string;
  keyColors?: string[];
} {
  const keyColors = Array.isArray(colorAnalysisObj?.key_colors) ? colorAnalysisObj.key_colors : undefined;
  const interpretation = colorAnalysisObj?.interpretation ?? '';

  const colorAnalysis =
    interpretation + (keyColors?.length ? (interpretation ? ' 主色：' : '主色：') + keyColors.join('、') : '');

  return { colorAnalysis, keyColors: keyColors?.length ? keyColors : undefined };
}

/**
 * 解析摘要字段
 */
function parseSummary(output: Record<string, unknown>): string {
  return (
    String(output.insight ?? output.summary ?? output.healingSummary ?? '').trim() ||
    String(output.composition_report ?? '').trim()
  );
}

/**
 * 解析情绪分数
 */
function parseScores(
  output: Record<string, unknown>,
  lineAnalysisObj: CozeLineAnalysis | undefined,
): Record<string, number> {
  const rawScores = output.scores as Record<string, number> | undefined;
  const hasDimScore = SCORE_DIMENSIONS.some(
    ({ key }) => typeof output[key] === 'number' || typeof rawScores?.[key] === 'number',
  );

  // 情况1：直接包含维度分数
  if (hasDimScore) {
    const scores: Record<string, number> = {};
    SCORE_DIMENSIONS.forEach(({ key }) => {
      scores[key] = Number(output[key] ?? rawScores?.[key] ?? 50);
    });
    return scores;
  }

  // 情况2：从 energy_score 推导
  if (typeof lineAnalysisObj?.energy_score === 'number') {
    return scoresFromEnergyScore(lineAnalysisObj.energy_score);
  }

  // 情况3：使用默认值
  return Object.fromEntries(SCORE_DIMENSIONS.map(({ key }) => [key, 50]));
}

/**
 * 解析线条分析字段
 */
function parseLineAnalysis(lineAnalysisObj: CozeLineAnalysis | undefined): CozeLineAnalysis | undefined {
  if (!lineAnalysisObj) return undefined;

  const hasContent =
    lineAnalysisObj.interpretation ?? lineAnalysisObj.style ?? lineAnalysisObj.energy_score !== null;

  if (!hasContent) return undefined;

  return {
    interpretation: lineAnalysisObj.interpretation,
    style: lineAnalysisObj.style,
    energy_score: lineAnalysisObj.energy_score,
  };
}

/**
 * 解析 Coze 工作流返回的 output JSON，兼容新版结构（insight/color_analysis/line_analysis 等）与旧版
 */
function parseCozeOutput(raw: string): ParsedHealingReport {
  const fallback: ParsedHealingReport = {
    scores: Object.fromEntries(SCORE_DIMENSIONS.map(({ key }) => [key, 50])),
    summary: raw.slice(0, 500),
    colorAnalysis: '',
  };

  try {
    const output = unwrapCozeOutput(raw) as Record<string, unknown>;

    // 解析各个字段
    const colorAnalysisObj = output.color_analysis as CozeColorAnalysis | undefined;
    const lineAnalysisObj = output.line_analysis as CozeLineAnalysis | undefined;

    const { colorAnalysis, keyColors } = parseColorAnalysis(colorAnalysisObj);
    const summary = parseSummary(output);
    const scores = parseScores(output, lineAnalysisObj);
    const lineAnalysis = parseLineAnalysis(lineAnalysisObj);

    const compositionReport =
      typeof output.composition_report === 'string' ? output.composition_report.trim() : undefined;
    const suggestion = typeof output.suggestion === 'string' ? output.suggestion.trim() : undefined;

    return {
      scores,
      summary: summary || fallback.summary,
      colorAnalysis: colorAnalysis || fallback.colorAnalysis,
      compositionReport: compositionReport || undefined,
      lineAnalysis,
      suggestion,
      keyColors,
      vad: parseVad(output),
    };
  } catch (err) {
    logger.error('healing:parseCozeOutput error', { rawSnippet: raw.slice(0, 200), error: (err as Error).message });
    return fallback;
  }
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length) return v;
  }
  return undefined;
}

function normalizeCozeOutputField(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
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
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;
  let runId = firstString(b, ['run_id', 'execute_id', 'executeId', 'id']);
  let output = normalizeCozeOutputField(b.output ?? b.Output);
  let executeStatus = firstString(b, ['execute_status', 'executeStatus', 'status']);
  let errorMessage = firstString(b, ['error_message', 'errorMessage', 'error']);

  const data = b.data;
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    const d = data[0] as Record<string, unknown>;
    runId = runId ?? firstString(d, ['execute_id', 'run_id', 'id']);
    output = output ?? normalizeCozeOutputField(d.output ?? d.Output);
    executeStatus = executeStatus ?? firstString(d, ['execute_status', 'executeStatus']);
    errorMessage = errorMessage ?? firstString(d, ['error_message', 'errorMessage']);
  } else if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    runId = runId ?? firstString(d, ['execute_id', 'run_id', 'id']);
    output = output ?? normalizeCozeOutputField(d.output ?? d.Output);
    executeStatus = executeStatus ?? firstString(d, ['execute_status', 'executeStatus']);
    errorMessage = errorMessage ?? firstString(d, ['error_message', 'errorMessage']);
  }

  if (typeof b.code === 'number' && b.code !== 0 && !errorMessage) {
    errorMessage = String(b.msg ?? 'Coze error');
  }

  return { runId, executeStatus, output, errorMessage };
}

function buildHealingUpdatePayload(parsed: ParsedHealingReport): Record<string, unknown> {
  const update: Record<string, unknown> = {
    'healing.scores': parsed.scores,
    'healing.summary': parsed.summary,
    'healing.colorAnalysis': parsed.colorAnalysis,
    'healing.status': 'success',
    'healing.analyzedAt': new Date(),
  };
  if (parsed.compositionReport !== null) update['healing.compositionReport'] = parsed.compositionReport;
  if (parsed.lineAnalysis !== null) update['healing.lineAnalysis'] = parsed.lineAnalysis;
  if (parsed.suggestion !== null) update['healing.suggestion'] = parsed.suggestion;
  if (parsed.keyColors !== undefined && parsed.keyColors.length) update['healing.keyColors'] = parsed.keyColors;
  if (parsed.vad) update['healing.vad'] = parsed.vad;
  return update;
}

async function applyHealingSuccessFromRunId(runId: string, outputRaw: string): Promise<void> {
  cozeDebugLogger.info('[coze-debug] outputRaw (full):', outputRaw);
  const Work = getWorkModel();
  const work = (await Work.findOne({ 'healing.cozeRunId': runId }).lean().exec()) as IWork | null;
  if (!work) { logger.warn('Coze webhook: no work for cozeRunId=', runId); return; }
  if (work.healing?.status === 'success') { logger.info('Coze webhook idempotent skip, workId=', work.workId); return; }
  const parsed = parseCozeOutput(outputRaw);
  cozeDebugLogger.info('[coze-debug] parseCozeOutput result:', {
    scores: parsed.scores,
    summary: parsed.summary?.slice(0, 100),
    colorAnalysis: parsed.colorAnalysis?.slice(0, 100),
    compositionReport: parsed.compositionReport?.slice(0, 100),
    lineAnalysis: parsed.lineAnalysis,
    suggestion: parsed.suggestion?.slice(0, 100),
    keyColors: parsed.keyColors,
  });
  const { workId } = work;
  await Work.updateOne({ workId }, { $set: buildHealingUpdatePayload(parsed) }).exec();
  logger.info('Coze webhook success for workId=', workId);
  if (work.authorId) {
    notifyHealingUpdate(String(work.authorId), { workId, status: 'success' });
  }
}

async function markHealingFailedByRunId(runId: string): Promise<void> {
  const Work = getWorkModel();
  const work = (await Work.findOne({ 'healing.cozeRunId': runId }).lean().exec()) as IWork | null;
  const r = await Work.updateOne(
    { 'healing.cozeRunId': runId },
    { $set: { 'healing.status': 'failed' } },
  ).exec();
  if (r.matchedCount === 0) {
    logger.warn('Coze webhook fail: no work for cozeRunId=', runId);
    return;
  }
  if (work?.authorId) {
    notifyHealingUpdate(String(work.authorId), { workId: work.workId, status: 'failed' });
  }
}

/** Coze 异步完成回调（无用户 JWT；可选 webhookSecret 作为 query token） */
router.post('/coze/callback', async (req: Request, res: Response) => {
  // 验证 webhook token
  if (!verifyWebhookToken(req, res)) return;

  cozeDebugLogger.info('[coze-debug] raw body:', JSON.stringify(req.body));

  try {
    const parsed = parseCozeWebhookPayload(req.body);
    const runId = parsed.runId?.trim();

    cozeDebugLogger.info('[coze-debug] parsed webhook:', {
      runId: parsed.runId,
      executeStatus: parsed.executeStatus,
      errorMessage: parsed.errorMessage,
      outputSnippet: parsed.output ? parsed.output.slice(0, 500) : null,
    });

    if (!runId) {
      logger.error('Coze webhook missing run_id, body=', JSON.stringify(req.body).slice(0, 800));
      res.status(400).json({ code: 400, success: false, message: 'Missing run id' });
      return;
    }

    const status = (parsed.executeStatus ?? '').trim();
    await handleWebhookStatus(runId, status, parsed.output ?? null, parsed.errorMessage, res);
  } catch (err) {
    logger.error('Coze webhook handler error', (err as Error).message);
    res.status(500).json({ code: 500, success: false, message: 'Internal error' });
  }
});

async function runQwenVlAnalysis(work: IWork, jobId: string): Promise<void> {
  const imageUrl = resolveImageUrl(work.images?.[0]?.url ?? '');
  const desc = work.desc ?? '';
  const tags = (work.tags ?? []).join(',');
  const output = await analyzeArtwork(imageUrl, desc, tags);
  await applyHealingSuccessFromRunId(jobId, output);
}

async function handleQwenVlAnalysisError(workId: string, userId: string, err: unknown): Promise<void> {
  const Work = getWorkModel();
  if (err instanceof NotArtworkError) {
    logger.warn('QwenVL not artwork workId=', workId, 'reason=', (err as NotArtworkError).reason);
    await Work.updateOne({ workId }, { $set: { 'healing.status': 'failed', 'healing.failReason': 'NOT_ARTWORK' } }).exec();
    notifyHealingUpdate(userId, { workId, status: 'failed', errorCode: 'NOT_ARTWORK' });
    return;
  }
  logger.error('QwenVL analysis failed workId=', workId, (err as Error).message);
  await Work.updateOne({ workId }, { $set: { 'healing.status': 'failed' } }).exec();
  notifyHealingUpdate(userId, { workId, status: 'failed' });
}

router.post('/analyze', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const body = (req.body?.data ?? req.body) as { workId?: string };
  const workId = body?.workId?.trim();
  logRequest('healing.ts:analyze:entry', 'healing analyze request', { req, requestBody: body });
  if (!workId) { sendErr(res, 'Missing workId', 400); return; }
  const userId = req.userId;
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }
  const quotaOk = await checkDailyQuota(userId, res);
  if (!quotaOk) return;
  try {
    const work = await validateWorkOwnership(workId, userId, res);
    if (!work) return;
    const jobId = randomUUID();
    void incrementHealDailyUsage(userId).catch(() => {});
    await initializePendingHealing(workId, jobId);
    sendSucc(res, { workId, status: 'pending', runId: jobId });
    void runQwenVlAnalysis(work, jobId).catch((err) => handleQwenVlAnalysisError(workId, userId, err));
  } catch (err) {
    logRequestError('healing.ts:analyze:error', 'healing analyze error', {
      req, requestBody: { workId }, statusCode: 500,
      extra: { errorName: (err as Error).name, errorMessage: (err as Error).message },
    });
    sendErr(res, 'Analyze failed', 500);
  }
});

function buildHealingStatusSuccess(workId: string, healing: IHealingData): Record<string, unknown> {
  const dominant = pickDominantEmotion(healing.scores);
  return {
    workId,
    status: 'success',
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
    vad: healing.vad ?? null,
  };
}

router.get('/status', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const workId = (req.query?.workId as string | undefined)?.trim();
  const userId = req.userId;
  if (!workId) { sendErr(res, 'Missing workId', 400); return; }
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }
  try {
    const Work = getWorkModel();
    const work = (await Work.findOne({ workId }).lean().exec()) as IWork | null;
    if (!work) { sendErr(res, 'Work not found', 404); return; }
    if (work.authorId !== userId) { sendErr(res, 'Forbidden', 403); return; }
    const healing = work.healing;
    if (!healing) { sendSucc(res, { workId, status: 'none' }); return; }
    if (healing.status === 'pending') {
      sendSucc(res, { workId, status: 'pending', submittedAt: healing.submittedAt, estimatedSeconds: HEALING_ESTIMATED_SECONDS });
      return;
    }
    if (healing.status === 'failed') { sendSucc(res, { workId, status: 'failed', failReason: healing.failReason ?? null }); return; }
    sendSucc(res, buildHealingStatusSuccess(workId, healing));
  } catch (err) {
    logRequestError('healing.ts:status:error', 'healing status error', {
      req, requestBody: { workId }, statusCode: 500,
      extra: { errorName: (err as Error).name, errorMessage: (err as Error).message },
    });
    sendErr(res, 'Get status failed', 500);
  }
});

router.get('/report', async (req: MiniappRequest, res: Response) => {
  const workId = (req.query?.workId as string | undefined)?.trim();

  logRequest('healing.ts:report:entry', 'healing report request', {
    req,
    requestBody: { workId },
  });

  if (!workId) {
    sendErr(res, 'Missing workId', 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const work = (await Work.findOne({ workId }).lean().exec()) as IWork | null;

    if (!work) {
      sendErr(res, 'Work not found', 404);
      return;
    }

    const viewerId = req.userId;
    const healingResp = buildHealingResponse(work, viewerId);
    sendSucc(res, healingResp);
  } catch (err) {
    logRequestError('healing.ts:report:error', 'healing report error', {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, 'Get report failed', 500);
  }
});

function mapHealingListItem(w: IWork & { healing: IHealingData }): Record<string, unknown> {
  const healing = w.healing;
  const cover = w.images?.[0];
  const dominant = pickDominantEmotion(healing.scores);
  const rawCoverUrl = cover?.url ?? '/static/home/card0.png';
  const coverUrl = rawCoverUrl && rawCoverUrl.startsWith(OSS_PREFIX) ? resolveImageUrl(rawCoverUrl) : rawCoverUrl;
  return {
    workId: w.workId,
    isPublic: healing.isPublic,
    status: healing.status,
    scores: healing.scores,
    dominantEmotion: dominant.key,
    dominantEmotionLabel: dominant.label,
    dominantEmotionScore: dominant.value,
    coverUrl,
    desc: w.desc ?? '',
    tags: w.tags ?? [],
    createdAt: healing.analyzedAt ?? w.updatedAt,
  };
}

router.get('/list', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }
  logRequest('healing.ts:list:entry', 'healing list request', { req, requestBody: { userId } });
  try {
    const Work = getWorkModel();
    const works = (await Work.find({ authorId: userId, 'healing.status': 'success' })
      .sort({ 'healing.analyzedAt': -1, updatedAt: -1 })
      .lean()
      .exec()) as IWork[];
    const list = works
      .filter((w): w is IWork & { healing: IHealingData } => w.healing !== null && w.healing !== undefined)
      .map(mapHealingListItem);
    sendSucc(res, list);
  } catch (err) {
    logRequestError('healing.ts:list:error', 'healing list error', {
      req, statusCode: 500,
      extra: { errorName: (err as Error).name, errorMessage: (err as Error).message },
    });
    sendErr(res, 'Get list failed', 500);
  }
});

router.post('/privacy', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const body = (req.body?.data ?? req.body) as { workId?: string; isPublic?: boolean };
  const workId = body?.workId?.trim();
  const isPublic = body?.isPublic;
  const userId = req.userId;
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }
  logRequest('healing.ts:privacy:entry', 'healing privacy request', { req, requestBody: body });
  if (!workId || typeof isPublic !== 'boolean') { sendErr(res, 'Invalid params', 400); return; }
  try {
    const Work = getWorkModel();
    const work = (await Work.findOne({ workId }).lean().exec()) as IWork | null;
    if (!work) { sendErr(res, 'Work not found', 404); return; }
    if (work.authorId !== userId) { sendErr(res, 'Forbidden', 403); return; }
    if (!work.healing) { sendErr(res, 'Report not found', 404); return; }
    await Work.updateOne({ workId }, { $set: { 'healing.isPublic': isPublic } }).exec();
    sendSucc(res, { workId, isPublic });
  } catch (err) {
    logRequestError('healing.ts:privacy:error', 'healing privacy error', {
      req, requestBody: body, statusCode: 500,
      extra: { errorName: (err as Error).name, errorMessage: (err as Error).message },
    });
    sendErr(res, 'Update privacy failed', 500);
  }
});

router.post('/delete', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  const body = (req.body?.data ?? req.body) as { workId?: string };
  const workId = body?.workId?.trim();
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }
  if (!workId) { sendErr(res, 'Missing workId', 400); return; }
  try {
    const Work = getWorkModel();
    const work = (await Work.findOne({ workId }).lean().exec()) as IWork | null;
    if (!work) { sendErr(res, 'Work not found', 404); return; }
    if (work.authorId !== userId) { sendErr(res, 'Forbidden', 403); return; }
    if (!work.healing) { sendErr(res, 'Report not found', 404); return; }
    await Work.updateOne({ workId }, { $set: { healing: null } }).exec();
    sendSucc(res, { workId });
  } catch (err) {
    logRequestError('healing.ts:delete:error', 'healing delete error', {
      req, requestBody: body, statusCode: 500,
      extra: { errorName: (err as Error).name, errorMessage: (err as Error).message },
    });
    sendErr(res, 'Delete report failed', 500);
  }
});

export default router;
