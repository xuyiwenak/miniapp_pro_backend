import { Request, Response, NextFunction } from 'express';
import { ComponentManager } from '../../../common/BaseComponent';
import { BiAnalyticsComponent } from '../../../component/BiAnalyticsComponent';
import { MiniappRequest } from './auth';

/**
 * 创建 BI 追踪中间件。
 * 只记录路径以 allowedPrefixes 中某个前缀开头的请求，其余请求（扫描探测等）直接跳过。
 */
export function createBiTrackingMiddleware(allowedPrefixes: string[]) {
  return function biTrackingMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!allowedPrefixes.some((prefix) => req.path.startsWith(prefix))) {
      next();
      return;
    }
    const requestStartAt = Date.now();
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const requestSize = req.headers['content-length']
      ? parseInt(req.headers['content-length'], 10)
      : Buffer.byteLength(JSON.stringify(req.body || {}));

    res.json = function (body: unknown) {
      trackApiRequest(req, res, requestStartAt, requestSize, body);
      return originalJson(body);
    };
    res.send = function (body: unknown) {
      trackApiRequest(req, res, requestStartAt, requestSize, body);
      return originalSend(body);
    };

    next();
  };
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
