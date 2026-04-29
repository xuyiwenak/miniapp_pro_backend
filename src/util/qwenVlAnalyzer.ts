import https from 'https';
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

const SYSTEM_PROMPT =
  '你是一位专业的艺术疗愈分析师，擅长通过绘画作品分析创作者的心理状态与情绪能量。' +
  '请分析所提供的艺术作品图像，只返回纯JSON（不含任何其他文字、代码块标记或解释），结构如下：' +
  '{"insight":"综合心理洞察100-200字",' +
  '"scores":{"joy":0-100,"calm":0-100,"anxiety":0-100,"fear":0-100,"solitude":0-100,"passion":0-100,"social_aversion":0-100,"vitality":0-100},' +
  '"color_analysis":{"interpretation":"色彩心理分析","key_colors":["颜色描述1","颜色描述2"]},' +
  '"line_analysis":{"energy_score":0-10,"interpretation":"线条心理分析","style":"线条风格"},' +
  '"composition_report":"构图分析50-100字","suggestion":"个性化疗愈建议50-100字"}';

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

export async function analyzeArtwork(imageUrl: string, desc: string, tags: string): Promise<string> {
  const cfg = getQwenVlConfig();
  const model = cfg.model ?? DEFAULT_MODEL;
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');

  logger.info('QwenVL analyze start model=', model, 'imageUrl length=', imageUrl.length);

  const userText = [
    '请分析这幅艺术作品。',
    desc && `作品描述：${desc}`,
    tags && `作品标签：${tags}`,
  ].filter(Boolean).join('\n');

  const postData = Buffer.from(JSON.stringify({
    model,
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

  const fullUrl = new URL(`${baseUrl}/chat/completions`);

  const rawBody = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        hostname: fullUrl.hostname,
        port: fullUrl.port || 443,
        path: fullUrl.pathname,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': postData.byteLength,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`QwenVL request timeout after ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.write(postData);
    req.end();
  });

  const resp = JSON.parse(rawBody) as DashScopeResponse;
  if (resp.error) {
    throw new Error(`QwenVL API error: ${resp.error.code ?? ''} ${resp.error.message ?? ''}`);
  }

  const content = resp.choices?.[0]?.message?.content;
  if (!content) throw new Error('QwenVL returned empty content');

  logger.info('QwenVL analyze success content length=', content.length);
  return extractJson(content);
}
