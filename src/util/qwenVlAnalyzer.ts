import https from 'https';
import http from 'http';
import { ComponentManager, EComName } from '../common/BaseComponent';
import { gameLogger as logger } from './logger';

export interface QwenVlConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'qwen-vl-plus';
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 2048;

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
你是一位受过心理学与艺术治疗训练的专业疗愈分析师，擅长通过视觉作品读取创作者的情绪状态与内在能量。分析时保持温暖、不评判的语气，聚焦情绪表达而非作品的艺术水准。

## 第一步：验证作品类型
判断图片是否为人工手绘或手工创作的艺术作品（绘画、素描、水彩、版画、拼贴画等均符合）。
- 若不是（如照片、截图、AI 生成图、数字渲染图、网络图片、表情包），只返回：
  {"error":"NOT_ARTWORK","reason":"一句话说明原因"}
- 若是手工艺术作品，继续第二步。

## 第二步：疗愈分析框架

### 情绪维度评分（0–100）
评分反映该情绪在作品中的表达强度，不代表好坏。请逐项独立评估：
- joy（快乐）：作品传达的轻盈、愉悦、希望感
- calm（平静）：沉稳、内敛、安宁的氛围
- anxiety（焦虑）：紧张、不安、压迫的视觉张力
- fear（恐惧）：压抑、黑暗、威胁性的情绪底色
- solitude（孤独）：疏离、独处、内向收缩的氛围
- passion（热情）：强烈、奔放、充沛的情绪能量
- social_aversion（社交抵触）：回避、封闭、自我保护的倾向
- vitality（活力）：动感、扩张、向外生长的生命力

### 各字段要求
- insight：综合心理洞察，100–200 字，温暖语气，聚焦情绪表达
- vad.valence：效价 0–100（0 = 强烈负向/恐惧悲伤，50 = 中性模糊，100 = 强烈正向/喜悦希望）
- vad.arousal：唤醒度 0–100（0 = 极度低沉沉睡感，50 = 平稳中等，100 = 极度亢奋激烈）
- vad.dominance：支配感 0–100（0 = 完全被压制混乱失控，50 = 相对平衡，100 = 扩张有序强烈掌控）
- vad.interpretation：VAD 综合解读，40–80 字，描述三轴整体呈现的情绪状态
- color_analysis.interpretation：色彩心理分析，60–120 字，结合色调与饱和度解读情绪
- color_analysis.key_colors：2–4 个主色，用感性具体的语言（如"暗沉的橄榄绿"而非"绿色"）
- line_analysis.energy_score：线条能量 0–10（0 = 极柔和/几乎无线条，10 = 极强烈/高度紧张）
- line_analysis.style：线条风格关键词，如"流动舒展""碎裂颤抖""厚重迟缓"
- line_analysis.interpretation：线条心理分析，40–80 字
- composition_report：构图分析，50–100 字，关注画面重心、留白与边界处理
- suggestion：个性化疗愈建议，50–100 字，具体可操作，面向创作者本人

## 输出规范
只返回纯 JSON，不含任何其他文字、代码块标记或解释：
{"insight":"...","scores":{"joy":0,"calm":0,"anxiety":0,"fear":0,"solitude":0,"passion":0,"social_aversion":0,"vitality":0},"vad":{"valence":0,"arousal":0,"dominance":0,"interpretation":"..."},"color_analysis":{"interpretation":"...","key_colors":["..."]},"line_analysis":{"energy_score":0,"style":"...","interpretation":"..."},"composition_report":"...","suggestion":"..."}`;

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

function parseAnalyzeResponse(rawBody: string): string {
  let resp: DashScopeResponse;
  try {
    resp = JSON.parse(rawBody) as DashScopeResponse;
  } catch (e) {
    logger.error('QwenVL response JSON parse failed, raw length=', rawBody.length, 'preview=', rawBody.slice(0, 300));
    throw e;
  }
  if (resp.error) {
    throw new Error(`QwenVL API error: ${resp.error.code ?? ''} ${resp.error.message ?? ''}`);
  }
  const content = resp.choices?.[0]?.message?.content;
  if (!content) throw new Error('QwenVL returned empty content');
  logger.info('QwenVL analyze success content length=', content.length);
  const jsonStr = extractJson(content);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return jsonStr;
  }
  if (parsed.error === NOT_ARTWORK_ERROR_CODE) {
    throw new NotArtworkError(String(parsed.reason ?? ''));
  }
  return jsonStr;
}

export async function analyzeArtwork(imageUrl: string, desc: string, tags: string): Promise<string> {
  const cfg = getQwenVlConfig();
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  logger.info('QwenVL analyze start model=', cfg.model ?? DEFAULT_MODEL, 'imageUrl length=', imageUrl.length);
  const postData = buildAnalyzePostData(cfg, imageUrl, desc, tags);
  const fullUrl = new URL(`${baseUrl}/chat/completions`);
  const rawBody = await sendQwenVlRequest(cfg, postData, fullUrl);
  return parseAnalyzeResponse(rawBody);
}
