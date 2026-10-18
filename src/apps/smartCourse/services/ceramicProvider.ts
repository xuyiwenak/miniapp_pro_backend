import { z } from 'zod';
import sharp from 'sharp';
import type { SmartCourseConfig } from '../config';
import { SmartCourseError } from '../errors';
export const CERAMIC_PROMPT_VERSION = 'porcelain-topdown-v1';
export const CERAMIC_PROMPT = [
  '将输入的圆形盘面设计制作成一只真实青花白瓷蛋糕盘的产品摄影。严格以输入图片作为纹样贴图。',
  '保留中心纹样轮廓和位置、边饰数量与排列方向、全部留白和蓝色配色，保留红色方印原有字形与排列。',
  '不要重新设计、增删或补画纹样，不要把装饰纹样变成盘子轮廓。',
  '盘子外轮廓为正圆，白瓷胎、细腻透明釉、轻微凸起的圆形盘沿和自然厚度，柔和侧光和接触阴影。',
  '正上方俯拍，完整盘子居中，浅暖灰纯色桌面，边缘有少量背景余量。',
  '无食物、手、餐具、额外文字或装饰。图案像烧制在釉下，避免浮雕。',
].join('');
const TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const OUTPUT_EDGE = 1024;
const TaskSchema = z.object({ output: z.object({ task_id: z.string().min(1),
  task_status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN']),
  choices: z.array(z.object({ message: z.object({
    content: z.array(z.object({ image: z.string().url().optional() })),
  }) }))
    .optional(),
}) });
export interface CeramicProvider {
  submit(imageUrl: string): Promise<string>;
  query(taskId: string): Promise<{ status: 'pending' | 'success' | 'failed' | 'unknown'; imageUrl?: string }>;
  download(imageUrl: string): Promise<Buffer>;
}
export function createCeramicProvider(config: SmartCourseConfig, transport: typeof fetch = fetch): CeramicProvider {
  const base = `${config.SMARTCOURSE_IMAGE_API_ORIGIN}/api/v1`;
  async function call(path: string, body?: unknown) {
    const response = await transport(base + path, { method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${config.SMARTCOURSE_BAILIAN_API_KEY}`, 'Content-Type': 'application/json',
        ...(body ? { 'X-DashScope-Async': 'enable' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      const rejected = response.status >= 400 && response.status < 500;
      throw new SmartCourseError(502, rejected ? 'IMAGE_REJECTED' : 'IMAGE_UNCERTAIN', '陶瓷效果服务暂不可用');
    }
    return TaskSchema.parse(await response.json()).output;
  }
  return {
    async submit(imageUrl) {
      const output = await call('/services/aigc/image-generation/generation', {
        model: config.SMARTCOURSE_IMAGE_MODEL,
        input: { messages: [{ role: 'user', content: [{ image: imageUrl }, { text: CERAMIC_PROMPT }] }] },
        parameters: { size: config.SMARTCOURSE_IMAGE_SIZE, n: 1, prompt_extend: false, watermark: false },
      });
      return output.task_id;
    },
    async query(taskId) {
      const output = await call(`/tasks/${encodeURIComponent(taskId)}`);
      const status = { PENDING: 'pending', RUNNING: 'pending', SUCCEEDED: 'success',
        FAILED: 'failed', CANCELED: 'failed', UNKNOWN: 'unknown' } as const;
      return { status: status[output.task_status],
        imageUrl: output.choices?.[0]?.message.content.find(item => item.image)?.image };
    },
    download: imageUrl => downloadImage(imageUrl, transport),
  };
}
async function downloadImage(imageUrl: string, transport: typeof fetch) {
  const url = new URL(imageUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.aliyuncs.com') || url.username || url.password) {
    throw new SmartCourseError(502, 'IMAGE_URL', '效果图地址无法验证');
  }
  const response = await transport(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new SmartCourseError(502, 'IMAGE_DOWNLOAD', '效果图保存未完成');
  const chunks: Uint8Array[] = []; let length = 0;
  const reader = response.body.getReader();
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      length += chunk.value.length;
      if (length > MAX_IMAGE_BYTES) throw new SmartCourseError(502, 'IMAGE_SIZE', '效果图过大');
      chunks.push(chunk.value);
      chunk = await reader.read();
    }
  } finally { await reader.cancel(); }
  return sharp(Buffer.concat(chunks), { limitInputPixels: OUTPUT_EDGE * OUTPUT_EDGE, failOn: 'error' })
    .png().toBuffer();
}
