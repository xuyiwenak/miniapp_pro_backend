import { z } from 'zod';

const EnvironmentSchema = z.object({
  SMARTCOURSE_PORT: z.coerce.number().int().min(1).max(65535).default(43002),
  SMARTCOURSE_DB_HOST: z.string().default('127.0.0.1'),
  SMARTCOURSE_DB_PORT: z.coerce.number().int().default(27017),
  SMARTCOURSE_DB_NAME: z.string().regex(/^smartcourse[a-z0-9_]*$/).default('smartcourse'),
  SMARTCOURSE_DB_USER: z.string().optional(),
  SMARTCOURSE_DB_PASSWORD: z.string().optional(),
  SMARTCOURSE_DB_AUTH_SOURCE: z.string().default('admin'),
  SMARTCOURSE_REDIS_URL: z.string().url().default('redis://127.0.0.1:6379/2'),
  SMARTCOURSE_ORIGIN: z.string().url().default('http://127.0.0.1:5178'),
  SMARTCOURSE_BAILIAN_APP_ID: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
  SMARTCOURSE_BAILIAN_API_KEY: z.string().min(1).optional(),
  SMARTCOURSE_AGENT_VERSION: z.string().default('qinghua-v1'),
  SMARTCOURSE_OSS_REGION: z.string().optional(),
  SMARTCOURSE_OSS_BUCKET: z.string().optional(),
  SMARTCOURSE_OSS_ACCESS_KEY_ID: z.string().optional(),
  SMARTCOURSE_OSS_ACCESS_KEY_SECRET: z.string().optional(),
  // All smartCourse uploads stay within the product's OSS namespace.
  SMARTCOURSE_OSS_WORKS_PREFIX: z.string().regex(/^smart\/[a-zA-Z0-9_/-]+[^/]$/)
    .default('smart/user_upload/works'),
});
export type SmartCourseConfig = ReturnType<typeof loadConfig>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const values = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  return EnvironmentSchema.parse(values);
}
export const LIMITS = {
  sessionSeconds: 60 * 60 * 24 * 7,
  loginAttempts: 10,
  rateWindowSeconds: 60,
  chatRequests: 12,
  lockSeconds: 180,
  agentTimeoutMs: 90_000,
  uploadBytes: 10 * 1024 * 1024,
  imagePixels: 40_000_000,
  imageEdge: 2048,
  imageQuality: 85,
  signedUrlSeconds: 900,
  pageSize: 100,
  historyTurns: 6,
  contextChars: 6000,
} as const;
export const API_PREFIX = '/smartcourse-api';
export const TEACHER_COOKIE = 'smartcourse-teacher';

export function configuredCapabilities(config: SmartCourseConfig) {
  return {
    agentReady: Boolean(config.SMARTCOURSE_BAILIAN_APP_ID && config.SMARTCOURSE_BAILIAN_API_KEY),
    uploadReady: Boolean(config.SMARTCOURSE_OSS_REGION && config.SMARTCOURSE_OSS_BUCKET
      && config.SMARTCOURSE_OSS_ACCESS_KEY_ID && config.SMARTCOURSE_OSS_ACCESS_KEY_SECRET),
  };
}
