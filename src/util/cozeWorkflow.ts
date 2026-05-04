import https from 'https';
import http from 'http';
import { ComponentManager, EComName } from '../common/BaseComponent';
import { gameLogger as logger } from './logger';

export interface CozeConfig {
  token: string;
  workflowId: string;
  baseUrl: string;
  /** 公网 HTTPS 根，用于拼接异步完成回调 URL（与小程序/图片 publicBaseUrl 无关） */
  callbackPublicUrl?: string;
  /** 回调路径，默认 /healing/coze/callback */
  callbackPath?: string;
  extCallbackUrlKey?: string;
  /** 回调 URL 上的 ?token=，用于防伪造 */
  webhookSecret?: string;
  /** >0 时在若干毫秒后对仍 pending 的任务做一次 run_histories 补偿查询 */
  fallbackPollAfterMs?: number;
}

interface CozeRunResponse {
  code: number;
  msg: string;
  data?: {
    run_id?: string;
    execute_status?: string;
  };
  execute_id?: string;
  execute_status?: string;
}

interface CozeStatusResponseItem {
  execute_id: string;
  execute_status: 'Running' | 'Success' | 'Fail';
  output?: string;
  error_code?: number;
  error_message?: string;
}

interface CozeStatusResponse {
  code: number;
  msg: string;
  data?: CozeStatusResponseItem[];
}

export function getCozeConfig(): CozeConfig {
  const sysCfg = ComponentManager.instance.getComponent(EComName.SysCfgComponent) as {
    server_auth_config?: { coze?: CozeConfig };
  } | null;
  const cfg = sysCfg?.server_auth_config?.coze;
  if (!cfg?.token || !cfg?.workflowId || cfg.token === 'YOUR_COZE_API_TOKEN') {
    throw new Error('Coze API token / workflowId not configured');
  }
  return cfg;
}

function normalizeBaseUrl(u: string): string {
  return u.replace(/\/+$/, '');
}

function buildCallbackUrl(cfg: CozeConfig): string {
  const base = cfg.callbackPublicUrl?.trim();
  if (!base) {
    throw new Error('Coze callbackPublicUrl not configured (required for async webhook)');
  }
  const path = (cfg.callbackPath ?? '/healing/coze/callback').trim() || '/healing/coze/callback';
  const pathPart = path.startsWith('/') ? path : `/${path}`;
  let url = `${normalizeBaseUrl(base)}${pathPart}`;
  const secret = cfg.webhookSecret?.trim();
  if (secret) {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}token=${encodeURIComponent(secret)}`;
  }
  return url;
}

function cozeRequest<T>(method: string, urlPath: string, body?: Record<string, unknown>): Promise<T> {
  const cfg = getCozeConfig();
  const url = new URL(urlPath, cfg.baseUrl);
  const isHttps = url.protocol === 'https:';
  const mod = isHttps ? https : http;

  const postData = body ? JSON.stringify(body) : undefined;

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
      ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
    },
  };

  return new Promise((resolve, reject) => {
    const req = mod.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(json as T);
        } catch (err) {
          reject(new Error(`Coze response parse error: ${err}`));
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * 提交异步工作流任务，返回 run_id
 */
export async function submitWorkflow(params: Record<string, string>): Promise<string> {
  const cfg = getCozeConfig();
  const callbackUrl = buildCallbackUrl(cfg);
  const extKey = (cfg.extCallbackUrlKey ?? 'hook_url').trim() || 'hook_url';
  if (/^https?:\/\//i.test(extKey)) {
    throw new Error(
      'coze.extCallbackUrlKey must be the ext field name (e.g. "hook_url"), not a URL. Put the domain in callbackPublicUrl only.',
    );
  }
  const ext: Record<string, string> = { [extKey]: callbackUrl };

  logger.info(
    'Coze workflow submit params keys=',
    Object.keys(params),
    'imageUrl length=',
    (params.imageUrl ?? '').length,
    'image_url length=',
    (params.image_url ?? '').length,
    'extCallbackUrlKey=',
    extKey,
    'callbackUrl=',
    callbackUrl.replace(/([?&])token=[^&]+/g, '$1token=***'),
  );

  const resp = await cozeRequest<CozeRunResponse>('POST', '/v1/workflow/run', {
    workflow_id: cfg.workflowId,
    parameters: params,
    is_async: true,
    ext,
  });

  const runId = resp.data?.run_id || resp.execute_id;

  if (resp.code !== 0 || !runId) {
    throw new Error(`Coze submitWorkflow failed: code=${resp.code} msg=${resp.msg}`);
  }

  logger.info('Coze workflow submitted, run_id=', runId);
  return runId;
}

/**
 * 查询工作流运行状态
 */
export async function queryWorkflowStatus(runId: string): Promise<CozeStatusResponse['data']> {
  const cfg = getCozeConfig();
  const resp = await cozeRequest<CozeStatusResponse>(
    'GET',
    `/v1/workflows/${encodeURIComponent(cfg.workflowId)}/run_histories/${encodeURIComponent(runId)}`,
  );

  if (resp.code !== 0 || !resp.data || resp.data.length === 0) {
    throw new Error(`Coze queryStatus failed: code=${resp.code} msg=${resp.msg}`);
  }

  return resp.data;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_COUNT = 60;

/**
 * @deprecated 异步工作流完成后由 Coze POST 回调处理；仅保留供脚本或调试
 */
export async function pollWorkflowResult(runId: string): Promise<string> {
  for (let i = 0; i < MAX_POLL_COUNT; i++) {
    const statuses = await queryWorkflowStatus(runId);
    // queryWorkflowStatus throws if data is empty/undefined, so statuses is always defined here
    const status = (statuses ?? [])[0];
    if (!status) {
      throw new Error(`Coze queryStatus returned empty data, run_id=${runId}`);
    }

    logger.info('Coze workflow poll', 'run_id=', runId, 'attempt=', i + 1, 'status=', status.execute_status);

    if (status.execute_status === 'Success') {
      const output = status.output ?? '{}';
      logger.info('Coze workflow success, run_id=', runId, 'output=', output);
      return output;
    }

    if (status.execute_status === 'Fail') {
      const errMsg = status.error_message ?? 'Unknown workflow error';
      logger.error('Coze workflow failed, run_id=', runId, 'error=', errMsg, 'output=', status.output ?? '');
      throw new Error(`Coze workflow failed: ${errMsg}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Coze workflow timeout after ${MAX_POLL_COUNT * POLL_INTERVAL_MS / 1000}s, run_id=${runId}`);
}

/**
 * 单次查询：若已成功则返回 output 字符串；若失败则 throw；若仍运行则返回 null
 */
export async function queryWorkflowOutputOnce(runId: string): Promise<string | null> {
  const statuses = await queryWorkflowStatus(runId);
  // queryWorkflowStatus throws if data is empty/undefined, so statuses is always defined here
  const status = (statuses ?? [])[0];
  if (!status) {
    throw new Error(`Coze queryStatus returned empty data, run_id=${runId}`);
  }
  if (status.execute_status === 'Success') {
    return status.output ?? '{}';
  }
  if (status.execute_status === 'Fail') {
    const errMsg = status.error_message ?? 'Unknown workflow error';
    throw new Error(`Coze workflow failed: ${errMsg}`);
  }
  return null;
}
