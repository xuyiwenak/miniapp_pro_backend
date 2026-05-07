import { Request, Response, NextFunction } from 'express';
import { ComponentManager } from '../../../common/BaseComponent';
import { BiAnalyticsComponent } from '../../../component/BiAnalyticsComponent';
import { MiniappRequest } from './auth';

/**
 * BI 追踪中间件：自动记录 API 请求事件
 * 实现 OpenSpec: art_backend/openspec/specs/bi-analytics/spec.md
 *
 * 功能：
 * 1. 记录请求开始时间
 * 2. 拦截响应，记录状态码和响应时间
 * 3. 异步发送事件（不阻塞响应）
 */
export function biTrackingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestStartAt = Date.now();

  // 保存原始的 res.json 和 res.send 方法
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  // 获取请求大小（估算）
  const requestSize = req.headers['content-length']
    ? parseInt(req.headers['content-length'], 10)
    : Buffer.byteLength(JSON.stringify(req.body || {}));

  // 包装 res.json
  res.json = function (body: unknown) {
    trackApiRequest(req, res, requestStartAt, requestSize, body);
    return originalJson(body);
  };

  // 包装 res.send
  res.send = function (body: unknown) {
    trackApiRequest(req, res, requestStartAt, requestSize, body);
    return originalSend(body);
  };

  next();
}

/**
 * 追踪 API 请求事件
 */
function trackApiRequest(
  req: Request,
  res: Response,
  requestStartAt: number,
  requestSize: number,
  responseBody: unknown
): void {
  const durationMs = Date.now() - requestStartAt;
  const statusCode = res.statusCode;
  const responseSize = getResponseSize(responseBody);
  const status = statusCode >= 200 && statusCode < 400 ? 'success' : 'failed';
  const { errorCode, errorMessage } = getApiErrorInfo(status, responseBody);
  const biAnalytics = ComponentManager.instance.getComponentByKey<BiAnalyticsComponent>('BiAnalytics');
  if (!biAnalytics) return;
  biAnalytics.trackApiRequest(
    {
      endpoint: req.path,
      method: req.method,
      statusCode,
      durationMs,
      requestSize,
      responseSize,
      status,
      errorCode,
      errorMessage,
    },
    {
      userId: (req as MiniappRequest).userId || null,
      requestId: req.headers['x-request-id'] as string | undefined,
      ipAddress: BiAnalyticsComponent.anonymizeIp(req.ip ?? '0.0.0.0'),
      userAgent: req.headers['user-agent'] ?? 'unknown',
    }
  );
}

function getResponseSize(responseBody: unknown): number {
  if (typeof responseBody === 'string') {
    return Buffer.byteLength(responseBody);
  }
  if (responseBody && typeof responseBody === 'object') {
    return Buffer.byteLength(JSON.stringify(responseBody));
  }
  return 0;
}

function getApiErrorInfo(status: string, responseBody: unknown): { errorCode?: string; errorMessage?: string } {
  if (status !== 'failed' || !responseBody || typeof responseBody !== 'object') {
    return {};
  }
  const body = responseBody as { error?: string; message?: string };
  return {
    errorCode: body.error,
    errorMessage: body.message,
  };
}
