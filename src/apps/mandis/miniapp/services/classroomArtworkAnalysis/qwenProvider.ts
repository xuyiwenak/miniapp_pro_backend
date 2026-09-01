import http from 'http';
import https from 'https';
import { ComponentManager, EComName } from '../../../../../common/BaseComponent';
import { gameLogger as logger } from '../../../../../util/logger';
import {
  ClassroomNotArtworkError,
  EDUCATION_NOT_ARTWORK_ERROR_CODE,
  type EducationArtworkAnalysisResult,
  parseEducationArtworkAnalysisOutput,
} from './contract';
import { buildEducationUserContent, EDUCATION_ARTWORK_SYSTEM_PROMPT } from './prompt';

export interface EducationQwenConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

type EducationAuthConfig = {
  educationQwenVl?: Partial<EducationQwenConfig>;
};

type DashScopeResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: string };
};

type EducationQwenHttpResponse = {
  statusCode: number;
  body: string;
};

const DEFAULT_MODEL = 'qwen-vl-plus';
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 4096;
const API_KEY_PLACEHOLDER = 'YOUR_DASHSCOPE_API_KEY';
const EDUCATION_API_KEY_PLACEHOLDER = 'YOUR_EDUCATION_DASHSCOPE_API_KEY';

function isConfiguredApiKey(apiKey: string | undefined): apiKey is string {
  return Boolean(apiKey && apiKey !== API_KEY_PLACEHOLDER && apiKey !== EDUCATION_API_KEY_PLACEHOLDER);
}

export function resolveEducationQwenConfig(
  config: Partial<EducationQwenConfig> | undefined,
  environmentApiKey: string | undefined,
): EducationQwenConfig {
  const apiKey = environmentApiKey ?? config?.apiKey;
  if (!isConfiguredApiKey(apiKey)) throw new Error('Education Qwen apiKey not configured');
  return { apiKey, model: config?.model, baseUrl: config?.baseUrl };
}

export function getEducationQwenConfig(): EducationQwenConfig {
  const sysCfg = ComponentManager.instance.getComponent(EComName.SysCfgComponent) as {
    server_auth_config?: EducationAuthConfig;
  } | null;
  const config = sysCfg?.server_auth_config?.educationQwenVl;
  return resolveEducationQwenConfig(config, process.env.EDUCATION_DASHSCOPE_API_KEY);
}

export function buildEducationQwenPostData(
  config: EducationQwenConfig,
  imageUrl: string,
): Buffer {
  return Buffer.from(JSON.stringify({
    model: config.model ?? DEFAULT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: EDUCATION_ARTWORK_SYSTEM_PROMPT },
      { role: 'user', content: buildEducationUserContent(imageUrl) },
    ],
  }));
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start !== -1 && end > start ? text.slice(start, end + 1) : text.trim();
}

function collectResponse(res: http.IncomingMessage): Promise<EducationQwenHttpResponse> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => resolve({
      statusCode: res.statusCode ?? 0,
      body: Buffer.concat(chunks).toString('utf8'),
    }));
    res.on('error', reject);
  });
}

function sendEducationQwenRequest(
  config: EducationQwenConfig,
  postData: Buffer,
  fullUrl: URL,
): Promise<EducationQwenHttpResponse> {
  const isHttps = fullUrl.protocol === 'https:';
  const transport = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request({
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: `${fullUrl.pathname}${fullUrl.search}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': postData.byteLength,
      },
    }, (response) => {
      void collectResponse(response).then(resolve, reject);
    });
    request.on('error', reject);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Education Qwen request timeout after ${REQUEST_TIMEOUT_MS}ms`));
    });
    request.write(postData);
    request.end();
  });
}

function parseDashScopeResponse(response: EducationQwenHttpResponse): DashScopeResponse {
  let parsed: DashScopeResponse;
  try {
    parsed = JSON.parse(response.body) as DashScopeResponse;
  } catch {
    throw new Error(`Education Qwen returned invalid response JSON with HTTP ${response.statusCode}`);
  }
  if (response.statusCode < 200 || response.statusCode >= 300 || parsed.error) {
    const code = parsed.error?.code ?? `HTTP_${response.statusCode}`;
    const message = parsed.error?.message ?? 'Unknown provider error';
    throw new Error(`Education Qwen API error: ${code} ${message}`);
  }
  return parsed;
}

function parseAnalysisContent(content: string): EducationArtworkAnalysisResult['output'] {
  const parsed = JSON.parse(extractJson(content)) as Record<string, unknown>;
  if (parsed.error === EDUCATION_NOT_ARTWORK_ERROR_CODE) {
    throw new ClassroomNotArtworkError(String(parsed.reason ?? ''));
  }
  return parseEducationArtworkAnalysisOutput(parsed);
}

export async function analyzeClassroomArtworkImage(
  imageUrl: string,
  workId: string,
): Promise<EducationArtworkAnalysisResult> {
  const config = getEducationQwenConfig();
  const model = config.model ?? DEFAULT_MODEL;
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const startedAt = Date.now();
  const response = await sendEducationQwenRequest(
    config,
    buildEducationQwenPostData(config, imageUrl),
    new URL(`${baseUrl}/chat/completions`),
  );
  const parsed = parseDashScopeResponse(response);
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) throw new Error('Education Qwen returned empty content');
  const output = parseAnalysisContent(content);
  logger.info('education.qwen.analyze.success', {
    workId,
    model,
    promptTokens: parsed.usage?.prompt_tokens ?? 0,
    completionTokens: parsed.usage?.completion_tokens ?? 0,
    totalTokens: parsed.usage?.total_tokens ?? 0,
    durationMs: Date.now() - startedAt,
  });
  return { output, modelVersion: model };
}
