import https from "https";
import http from "http";
import { ComponentManager, EComName } from "../common/BaseComponent";
import { gameLogger as logger } from "./logger";

interface CozeConfig {
  token: string;
  workflowId: string;
  baseUrl: string;
}

interface CozeRunResponse {
  code: number;
  msg: string;
  data?: {
    run_id: string;
    execute_status?: string;
  };
}

interface CozeStatusResponse {
  code: number;
  msg: string;
  data?: {
    run_id: string;
    execute_status: "Running" | "Success" | "Fail";
    output?: string;
    error?: string;
  };
}

function getCozeConfig(): CozeConfig {
  const sysCfg = ComponentManager.instance.getComponent(EComName.SysCfgComponent) as {
    server_auth_config?: { coze?: CozeConfig };
  } | null;
  const cfg = sysCfg?.server_auth_config?.coze;
  if (!cfg?.token || !cfg?.workflowId || cfg.token === "YOUR_COZE_API_TOKEN") {
    throw new Error("Coze API token / workflowId not configured");
  }
  return cfg;
}

function cozeRequest<T>(method: string, urlPath: string, body?: Record<string, unknown>): Promise<T> {
  const cfg = getCozeConfig();
  const url = new URL(urlPath, cfg.baseUrl);
  const isHttps = url.protocol === "https:";
  const mod = isHttps ? https : http;

  const postData = body ? JSON.stringify(body) : undefined;

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(postData ? { "Content-Length": Buffer.byteLength(postData) } : {}),
    },
  };

  return new Promise((resolve, reject) => {
    const req = mod.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve(json as T);
        } catch (err) {
          reject(new Error(`Coze response parse error: ${err}`));
        }
      });
    });
    req.on("error", (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * 提交异步工作流任务，返回 run_id
 */
export async function submitWorkflow(params: Record<string, string>): Promise<string> {
  const cfg = getCozeConfig();
  const resp = await cozeRequest<CozeRunResponse>("POST", "/v1/workflow/run", {
    workflow_id: cfg.workflowId,
    parameters: params,
    is_async: true,
  });

  if (resp.code !== 0 || !resp.data?.run_id) {
    throw new Error(`Coze submitWorkflow failed: code=${resp.code} msg=${resp.msg}`);
  }

  logger.info("Coze workflow submitted, run_id=", resp.data.run_id);
  return resp.data.run_id;
}

/**
 * 查询工作流运行状态
 */
export async function queryWorkflowStatus(runId: string): Promise<CozeStatusResponse["data"]> {
  const resp = await cozeRequest<CozeStatusResponse>(
    "GET",
    `/v1/workflow/run_history?run_id=${encodeURIComponent(runId)}`,
  );

  if (resp.code !== 0 || !resp.data) {
    throw new Error(`Coze queryStatus failed: code=${resp.code} msg=${resp.msg}`);
  }

  return resp.data;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_COUNT = 60;

/**
 * 轮询等待工作流完成（后端内部使用），返回最终输出 JSON 字符串
 */
export async function pollWorkflowResult(runId: string): Promise<string> {
  for (let i = 0; i < MAX_POLL_COUNT; i++) {
    const status = await queryWorkflowStatus(runId);

    if (status!.execute_status === "Success") {
      logger.info("Coze workflow success, run_id=", runId);
      return status!.output ?? "{}";
    }

    if (status!.execute_status === "Fail") {
      const errMsg = status!.error || "Unknown workflow error";
      logger.error("Coze workflow failed, run_id=", runId, "error=", errMsg);
      throw new Error(`Coze workflow failed: ${errMsg}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Coze workflow timeout after ${MAX_POLL_COUNT * POLL_INTERVAL_MS / 1000}s, run_id=${runId}`);
}
