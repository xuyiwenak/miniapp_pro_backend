import https from 'https';
import http from 'http';
import { z } from 'zod';
import { ComponentManager, EComName } from '../common/BaseComponent';
import { gameLogger as logger } from './logger';
import { BiAnalyticsComponent } from '../component/BiAnalyticsComponent';

export interface QwenVlConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'qwen-vl-plus';
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 2048;
export const ARTWORK_AFFECT_CONSTRUCT = 'perceived_expressed_affect' as const;
export const ARTWORK_AFFECT_SCALE_VERSION = 'artwork-affect-v1';
export const ARTWORK_AFFECT_PROMPT_VERSION = 'artwork-affect-prompt-v2';
const ARTWORK_AFFECT_DIMENSIONS = [
  'joy', 'calm', 'anxiety', 'fear', 'solitude', 'passion', 'social_aversion', 'vitality',
] as const;

const ArtworkAffectDimensionSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  assessable: z.boolean(),
  evidence: z.array(z.string().trim().min(1)).min(1).max(3),
}).strict().superRefine((value, context) => {
  const valid = value.assessable ? value.score !== null : value.score === null;
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: 'score and assessable disagree' });
});

const ArtworkAffectVadSchema = z.object({
  valence: z.number().min(0).max(100).nullable(),
  arousal: z.number().min(0).max(100).nullable(),
  dominance: z.number().min(0).max(100).nullable(),
  assessable: z.boolean(),
  evidence: z.array(z.string().trim().min(1)).min(1).max(3),
  interpretation: z.string().trim().min(1),
}).strict().superRefine((value, context) => {
  const scores = [value.valence, value.arousal, value.dominance];
  const valid = value.assessable ? scores.every((score) => score !== null) : scores.every((score) => score === null);
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: 'VAD scores and assessable disagree' });
});

const ArtworkAnalysisOutputSchema = z.object({
  construct: z.literal(ARTWORK_AFFECT_CONSTRUCT),
  scale_version: z.literal(ARTWORK_AFFECT_SCALE_VERSION),
  dimensions: z.object(Object.fromEntries(
    ARTWORK_AFFECT_DIMENSIONS.map((key) => [key, ArtworkAffectDimensionSchema]),
  ) as Record<(typeof ARTWORK_AFFECT_DIMENSIONS)[number], typeof ArtworkAffectDimensionSchema>).strict(),
  vad: ArtworkAffectVadSchema,
  insight: z.string().trim().min(1),
  color_analysis: z.object({
    interpretation: z.string().trim().min(1),
    key_colors: z.array(z.string().trim().min(1)).min(2).max(4),
  }).strict(),
  line_analysis: z.object({
    energy_score: z.number().min(0).max(10).nullable(),
    style: z.string().trim().min(1),
    interpretation: z.string().trim().min(1),
  }).strict(),
  composition_report: z.string().trim().min(1),
  suggestion: z.string().trim().min(1),
}).strict();

export type ArtworkAnalysisOutput = z.infer<typeof ArtworkAnalysisOutputSchema>;
export type ArtworkAnalysisResult = {
  output: ArtworkAnalysisOutput;
  modelVersion: string;
};

export function parseArtworkAnalysisOutput(input: unknown): ArtworkAnalysisOutput {
  return ArtworkAnalysisOutputSchema.parse(input);
}

// Qwen VL 定价（人民币 / 1000 tokens）
// 参考：https://help.aliyun.com/zh/model-studio/developer-reference/vl-plus-api
const QWEN_VL_PLUS_INPUT_PRICE = 0.008; // ¥0.008 / 1k tokens
const QWEN_VL_PLUS_OUTPUT_PRICE = 0.008; // ¥0.008 / 1k tokens

/**
 * 计算 Qwen VL API 调用成本（人民币）
 * @param model 模型名称
 * @param promptTokens 输入 tokens
 * @param completionTokens 输出 tokens
 * @returns 成本（人民币）
 */
function calculateQwenCost(model: string, promptTokens: number, completionTokens: number): number {
  // 目前仅支持 qwen-vl-plus 定价，其他模型使用相同价格
  const inputCost = (promptTokens / 1000) * QWEN_VL_PLUS_INPUT_PRICE;
  const outputCost = (completionTokens / 1000) * QWEN_VL_PLUS_OUTPUT_PRICE;
  return inputCost + outputCost;
}

/** 图片不是手工艺术作品时，模型返回的 error 字段值 */
export const NOT_ARTWORK_ERROR_CODE = 'NOT_ARTWORK';

/** 上传的图片不是手工艺术作品时抛出此错误 */
export class NotArtworkError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super('Not a handcrafted artwork');
    this.name = 'NotArtworkError';
    this.reason = reason;
  }
}

const SYSTEM_PROMPT = `\
## 角色
你是一位视觉情绪标注员。你只描述普通观者从画面中可感知的作品情绪表达，不推断创作者真实的心理状态、人格、创伤、病理或诊断。分析必须依据可观察的颜色、线条、构图、空间、节奏和意象，保持温暖、不评判的语气，不评价艺术水准。

## 第一步：验证作品类型
判断图片是否为人工手绘或手工创作的艺术作品（绘画、素描、水彩、版画、拼贴画等均符合）。
- 若不是（如照片、截图、AI 生成图、数字渲染图、网络图片、表情包），只返回：
  {"error":"NOT_ARTWORK","reason":"一句话说明原因"}
- 若是手工艺术作品，继续第二步。

## 第二步：疗愈分析框架

### 情绪维度评分（0–100）
评分反映作品呈现出的情绪表达强度，不是心理量表得分。逐项独立评估，每项给出 1–3 条画面证据。证据不足时必须返回 assessable=false、score=null，不得填入中间值：
- joy（快乐）：作品传达的轻盈、愉悦、希望感
- calm（平静）：沉稳、内敛、安宁的氛围
- anxiety（焦虑）：紧张、不安、压迫的视觉张力
- fear（恐惧）：压抑、黑暗、威胁性的情绪底色
- solitude（孤独）：疏离、独处、内向收缩的氛围
- passion（热情）：强烈、奔放、充沛的情绪能量
- social_aversion（社交抵触）：画面呈现的回避互动、封闭或自我保护感；不得据此判断作者社交倾向
- vitality（活力）：动感、扩张、向外生长的生命力

### 各字段要求
- construct：固定返回 perceived_expressed_affect
- scale_version：固定返回 artwork-affect-v1
- insight：综合作品表达观察，100–200 字，温暖语气，不作心理归因
- vad.valence：效价 0–100（0 = 强烈负向/恐惧悲伤，50 = 中性模糊，100 = 强烈正向/喜悦希望）
- vad.arousal：唤醒度 0–100（0 = 极度低沉沉睡感，50 = 平稳中等，100 = 极度亢奋激烈）
- vad.dominance：支配感 0–100（0 = 完全被压制混乱失控，50 = 相对平衡，100 = 扩张有序强烈掌控）
- vad.assessable：三轴是否都有充分画面证据；不足时三轴均为 null
- vad.evidence：1–3 条可观察画面证据
- vad.interpretation：VAD 综合解读，40–80 字，描述作品的整体情绪呈现
- color_analysis.interpretation：色彩心理分析，60–120 字，结合色调与饱和度解读情绪
- color_analysis.key_colors：2–4 个主色，用感性具体的语言（如"暗沉的橄榄绿"而非"绿色"）
- line_analysis.energy_score：线条能量 0–10（0 = 极柔和/几乎无线条，10 = 极强烈/高度紧张）
- line_analysis.style：线条风格关键词，如"流动舒展""碎裂颤抖""厚重迟缓"
- line_analysis.interpretation：线条心理分析，40–80 字
- composition_report：构图分析，50–100 字，关注画面重心、留白与边界处理
- suggestion：温和的后续创作邀请，50–100 字，具体可操作，不提供治疗或诊断建议

## 输出规范
只返回纯 JSON，不含任何其他文字、代码块标记或解释：
{"construct":"perceived_expressed_affect","scale_version":"artwork-affect-v1","dimensions":{"joy":{"score":0,"assessable":true,"evidence":["..."]},"calm":{"score":0,"assessable":true,"evidence":["..."]},"anxiety":{"score":0,"assessable":true,"evidence":["..."]},"fear":{"score":0,"assessable":true,"evidence":["..."]},"solitude":{"score":0,"assessable":true,"evidence":["..."]},"passion":{"score":0,"assessable":true,"evidence":["..."]},"social_aversion":{"score":null,"assessable":false,"evidence":["画面证据不足"]},"vitality":{"score":0,"assessable":true,"evidence":["..."]}},"vad":{"valence":0,"arousal":0,"dominance":0,"assessable":true,"evidence":["..."],"interpretation":"..."},"insight":"...","color_analysis":{"interpretation":"...","key_colors":["...","..."]},"line_analysis":{"energy_score":0,"style":"...","interpretation":"..."},"composition_report":"...","suggestion":"..."}`;

export function getQwenVlConfig(): QwenVlConfig {
  const sysCfg = ComponentManager.instance.getComponent(EComName.SysCfgComponent) as {
    server_auth_config?: { qwenVl?: QwenVlConfig };
  } | null;
  const cfg = sysCfg?.server_auth_config?.qwenVl;
  if (!cfg?.apiKey || cfg.apiKey === 'YOUR_DASHSCOPE_API_KEY') {
    throw new Error('QwenVL apiKey not configured in server_auth_config.qwenVl');
  }
  return cfg;
}

interface DashScopeResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: string };
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function buildAnalyzePostData(cfg: QwenVlConfig, imageUrl: string, desc: string, tags: string): Buffer {
  const model = cfg.model ?? DEFAULT_MODEL;
  const contextLines = [
    desc && `创作者描述：${desc}`,
    tags && `作品标签：${tags}`,
  ].filter(Boolean);
  const userText = contextLines.length
    ? `请为这幅作品生成疗愈分析报告。\n\n创作背景信息：\n${contextLines.join('\n')}`
    : '请为这幅作品生成疗愈分析报告。';
  return Buffer.from(JSON.stringify({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: userText },
        ],
      },
    ],
  }));
}

function sendQwenVlRequest(cfg: QwenVlConfig, postData: Buffer, fullUrl: URL): Promise<string> {
  const isHttps = fullUrl.protocol === 'https:';
  const mod = isHttps ? https : (http as unknown as typeof https);
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const tryResolve = (val: string) => { if (!settled) { settled = true; resolve(val); } };
    const tryReject = (err: Error) => { if (!settled) { settled = true; reject(err); } };
    const req = mod.request(
      {
        hostname: fullUrl.hostname,
        port: fullUrl.port || (isHttps ? 443 : 80),
        path: fullUrl.pathname,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': postData.byteLength,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => tryResolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', (e: Error) => tryReject(e));
      },
    );
    req.on('error', (e: Error) => tryReject(e));
    req.on('timeout', () => { req.destroy(); tryReject(new Error(`QwenVL request timeout after ${REQUEST_TIMEOUT_MS}ms`)); });
    req.setTimeout(REQUEST_TIMEOUT_MS);
    req.write(postData);
    req.end();
  });
}

function parseAnalyzeResponse(
  rawBody: string,
  durationMs: number,
  model: string,
  imageUrl: string,
  workId?: string
): ArtworkAnalysisOutput {
  const resp = parseDashScopeResponse(rawBody, durationMs, model, imageUrl, workId);
  ensureNoApiError(resp, durationMs, model, imageUrl, workId);
  const content = resp.choices?.[0]?.message?.content;
  if (!content) return handleEmptyQwenContent(resp, durationMs, model, imageUrl, workId);
  logger.info('QwenVL analyze success content length=', content.length);
  const usage = buildAndLogUsage(resp, durationMs, model);
  return handleAnalyzeJson(content, usage, durationMs, model, imageUrl, workId);
}

type AnalyzeUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
};

function handleEmptyQwenContent(
  resp: DashScopeResponse,
  durationMs: number,
  model: string,
  imageUrl: string,
  workId?: string,
): never {
  trackQwenAnalyzeFailure(resp, durationMs, model, workId, imageUrl, 'EMPTY_CONTENT', 'QwenVL returned empty content');
  throw new Error('QwenVL returned empty content');
}

function buildAndLogUsage(resp: DashScopeResponse, durationMs: number, model: string): AnalyzeUsage {
  const promptTokens = resp.usage?.prompt_tokens ?? 0;
  const completionTokens = resp.usage?.completion_tokens ?? 0;
  const totalTokens = resp.usage?.total_tokens ?? 0;
  const cost = calculateQwenCost(model, promptTokens, completionTokens);
  logger.info('qwen.token.usage', { promptTokens, completionTokens, totalTokens, cost: cost.toFixed(6), durationMs });
  return { promptTokens, completionTokens, totalTokens, cost };
}

function handleAnalyzeJson(
  content: string,
  usage: AnalyzeUsage,
  durationMs: number,
  model: string,
  imageUrl: string,
  workId?: string,
): ArtworkAnalysisOutput {
  const jsonStr = extractJson(content);
  const parsed = tryParseJson(jsonStr);
  if (parsed?.error === NOT_ARTWORK_ERROR_CODE) {
    trackQwenAnalyzeFailureByUsage(
      usage.promptTokens,
      usage.completionTokens,
      usage.totalTokens,
      durationMs,
      model,
      usage.cost,
      workId,
      imageUrl,
      NOT_ARTWORK_ERROR_CODE,
      String(parsed.reason ?? ''),
    );
    throw new NotArtworkError(String(parsed.reason ?? ''));
  }
  const validated = validateArtworkOutput(parsed, usage, durationMs, model, imageUrl, workId);
  trackQwenAnalyzeSuccess(
    usage.promptTokens, usage.completionTokens, usage.totalTokens, durationMs,
    model, usage.cost, workId, imageUrl,
  );
  return validated;
}

function validateArtworkOutput(
  parsed: Record<string, unknown> | null,
  usage: AnalyzeUsage,
  durationMs: number,
  model: string,
  imageUrl: string,
  workId?: string,
): ArtworkAnalysisOutput {
  const validated = ArtworkAnalysisOutputSchema.safeParse(parsed);
  if (validated.success) return validated.data;
  const errorMessage = validated.error.issues.map((issue) => issue.path.join('.')).join(', ');
  trackQwenAnalyzeFailureByUsage(
    usage.promptTokens,
    usage.completionTokens,
    usage.totalTokens,
    durationMs,
    model,
    usage.cost,
    workId,
    imageUrl,
    'INVALID_OUTPUT_SCHEMA',
    errorMessage,
  );
  throw new Error(`QwenVL output schema invalid: ${errorMessage}`);
}

function tryParseJson(jsonStr: string): Record<string, unknown> | null {
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseDashScopeResponse(
  rawBody: string,
  durationMs: number,
  model: string,
  imageUrl: string,
  workId?: string,
): DashScopeResponse {
  try {
    return JSON.parse(rawBody) as DashScopeResponse;
  } catch (e) {
    logger.error('QwenVL response JSON parse failed, raw length=', rawBody.length, 'preview=', rawBody.slice(0, 300));
    trackQwenAnalyzeFailureByUsage(0, 0, 0, durationMs, model, 0, workId, imageUrl, 'JSON_PARSE_ERROR', (e as Error).message);
    throw e;
  }
}

function ensureNoApiError(
  resp: DashScopeResponse,
  durationMs: number,
  model: string,
  imageUrl: string,
  workId?: string,
): void {
  if (!resp.error) return;
  const promptTokens = resp.usage?.prompt_tokens ?? 0;
  const completionTokens = resp.usage?.completion_tokens ?? 0;
  const totalTokens = resp.usage?.total_tokens ?? 0;
  const cost = calculateQwenCost(model, promptTokens, completionTokens);
  trackQwenAnalyzeFailureByUsage(
    promptTokens,
    completionTokens,
    totalTokens,
    durationMs,
    model,
    cost,
    workId,
    imageUrl,
    resp.error.code ?? 'API_ERROR',
    resp.error.message ?? 'Unknown error',
  );
  throw new Error(`QwenVL API error: ${resp.error.code ?? ''} ${resp.error.message ?? ''}`);
}

function trackQwenAnalyzeFailure(
  resp: DashScopeResponse,
  durationMs: number,
  model: string,
  workId: string | undefined,
  imageUrl: string,
  errorCode: string,
  errorMessage: string,
): void {
  const promptTokens = resp.usage?.prompt_tokens ?? 0;
  const completionTokens = resp.usage?.completion_tokens ?? 0;
  const totalTokens = resp.usage?.total_tokens ?? 0;
  const cost = calculateQwenCost(model, promptTokens, completionTokens);
  trackQwenAnalyzeFailureByUsage(
    promptTokens,
    completionTokens,
    totalTokens,
    durationMs,
    model,
    cost,
    workId,
    imageUrl,
    errorCode,
    errorMessage,
  );
}

function trackQwenAnalyzeFailureByUsage(
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  durationMs: number,
  model: string,
  cost: number,
  workId: string | undefined,
  imageUrl: string,
  errorCode: string,
  errorMessage: string,
): void {
  const biAnalytics = ComponentManager.instance.getComponentByKey<BiAnalyticsComponent>('BiAnalytics');
  if (!biAnalytics) return;
  biAnalytics.trackQwenAnalyze({
    promptTokens,
    completionTokens,
    totalTokens,
    durationMs,
    model,
    cost,
    status: 'failed',
    errorCode,
    errorMessage,
    workId,
    imageUrl,
  });
}

function trackQwenAnalyzeSuccess(
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  durationMs: number,
  model: string,
  cost: number,
  workId: string | undefined,
  imageUrl: string,
): void {
  const biAnalytics = ComponentManager.instance.getComponentByKey<BiAnalyticsComponent>('BiAnalytics');
  if (!biAnalytics) return;
  biAnalytics.trackQwenAnalyze({
    promptTokens,
    completionTokens,
    totalTokens,
    durationMs,
    model,
    cost,
    status: 'success',
    workId,
    imageUrl,
  });
}

const TIPS_SYSTEM_PROMPT = `\
你是一位温柔、有洞察力的创作见证者。用户今天通过创作留下了一点痕迹，请根据这件作品，给他们写一句今日回响。

要求：
- 50 到 120 个汉字，一到两句话
- 语气温暖、私密，像是写给老朋友的话
- 聚焦于今天这个创作行为本身传递出的情绪或状态，不评价作品好坏
- 不要说"你的作品"、"这幅画"之类的指代，直接说感受
- 只输出回响正文，不含任何解释或标点以外的内容`;

const TIPS_MAX_OUTPUT_TOKENS = 256;

function buildTipsPostData(cfg: QwenVlConfig, imageUrl: string, desc: string): Buffer {
  const model = cfg.model ?? DEFAULT_MODEL;
  const userText = desc
    ? `用户今天的创作描述：${desc}\n\n请写出今日回响。`
    : '请根据这件作品写出今日回响。';
  return Buffer.from(JSON.stringify({
    model,
    max_tokens: TIPS_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: TIPS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: userText },
        ],
      },
    ],
  }));
}

export async function generateUserTipsContent(
  imageUrl: string,
  desc: string,
  workId?: string,
): Promise<string> {
  const cfg = getQwenVlConfig();
  const model = cfg.model ?? DEFAULT_MODEL;
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  logger.info('QwenVL tips generate start workId=', workId ?? 'unknown');
  const startAt = Date.now();
  const postData = buildTipsPostData(cfg, imageUrl, desc);
  const fullUrl = new URL(`${baseUrl}/chat/completions`);
  const rawBody = await sendQwenVlRequest(cfg, postData, fullUrl);
  const durationMs = Date.now() - startAt;

  let resp: DashScopeResponse;
  try {
    resp = JSON.parse(rawBody) as DashScopeResponse;
  } catch (e) {
    logger.error('QwenVL tips: response parse failed', { workId, durationMs });
    throw e;
  }

  if (resp.error) {
    logger.error('QwenVL tips: API error', { workId, code: resp.error.code, msg: resp.error.message, durationMs });
    throw new Error(`QwenVL API error: ${resp.error.code ?? ''} ${resp.error.message ?? ''}`);
  }

  const content = resp.choices?.[0]?.message?.content?.trim() ?? '';
  if (!content) {
    logger.error('QwenVL tips: empty content', { workId, durationMs });
    throw new Error('QwenVL returned empty tips content');
  }

  const usage = resp.usage;
  logger.info('qwen.tips.usage', {
    workId,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    cost: calculateQwenCost(model, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0).toFixed(6),
    durationMs,
  });

  return content;
}

export async function analyzeArtwork(
  imageUrl: string,
  desc: string,
  tags: string,
  workId?: string
): Promise<ArtworkAnalysisResult> {
  const cfg = getQwenVlConfig();
  const model = cfg.model ?? DEFAULT_MODEL;
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  logger.info('QwenVL analyze start model=', model, 'imageUrl length=', imageUrl.length);
  const requestStartAt = Date.now();
  const postData = buildAnalyzePostData(cfg, imageUrl, desc, tags);
  const fullUrl = new URL(`${baseUrl}/chat/completions`);
  const rawBody = await sendQwenVlRequest(cfg, postData, fullUrl);
  const durationMs = Date.now() - requestStartAt;
  return {
    output: parseAnalyzeResponse(rawBody, durationMs, model, imageUrl, workId),
    modelVersion: model,
  };
}
