import type { Request, Response } from "express";
import { gameLogger } from "./logger";

export interface LogRequestOptions {
  req: Request;
  res?: Response;
  params?: Record<string, unknown>;
  requestBody?: unknown;
  responseBody?: unknown;
  statusCode?: number;
  extra?: Record<string, unknown>;
}

/**
 * 统一打印路由日志：路由参数、请求信息、返回结果。
 * 输出格式与 login 等接口一致：{ location, message, data, timestamp }，便于在 game 日志中查看。
 */
export function logRequest(
  location: string,
  message: string,
  opts: LogRequestOptions,
): void {
  const { req, params, requestBody, responseBody, statusCode, extra = {} } = opts;
  const data: Record<string, unknown> = {
    method: req.method,
    path: (req as any).path ?? req.path ?? (req as any).url,
    query: req.query ?? {},
    params: params ?? (req.params ?? {}),
    request: requestBody !== undefined ? requestBody : req.body,
    ...extra,
    timestamp: Date.now(),
  };
  if (responseBody !== undefined) data.response = responseBody;
  if (statusCode !== undefined) data.statusCode = statusCode;

  const payload = { location, message, data };
  gameLogger.info(JSON.stringify(payload));
}

/**
 * 仅打印请求入参（路由参数 + 请求体），不包含返回结果。
 */
export function logRequestIn(
  location: string,
  message: string,
  req: Request,
  extra?: Record<string, unknown>,
): void {
  const data: Record<string, unknown> = {
    method: req.method,
    path: (req as any).path ?? req.path ?? (req as any).url,
    query: req.query ?? {},
    params: req.params ?? {},
    body: req.body,
    ...extra,
    timestamp: Date.now(),
  };
  gameLogger.info(JSON.stringify({ location, message, data }));
}

/**
 * 打印错误级别日志（格式与 logRequest 一致）。
 */
export function logRequestError(
  location: string,
  message: string,
  opts: LogRequestOptions,
): void {
  const { req, params, requestBody, responseBody, statusCode, extra = {} } = opts;
  const data: Record<string, unknown> = {
    method: req.method,
    path: (req as any).path ?? req.path ?? (req as any).url,
    query: req.query ?? {},
    params: params ?? (req.params ?? {}),
    request: requestBody !== undefined ? requestBody : req.body,
    ...extra,
    timestamp: Date.now(),
  };
  if (responseBody !== undefined) data.response = responseBody;
  if (statusCode !== undefined) data.statusCode = statusCode;

  const payload = { location, message, data };
  gameLogger.error(JSON.stringify(payload));
}
