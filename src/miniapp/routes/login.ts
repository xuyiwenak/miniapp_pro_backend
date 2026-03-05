import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import { ComponentManager } from "../../common/BaseComponent";
import type { PlayerComponent } from "../../component/PlayerComponent";
import { sendSucc, sendErr } from "../middleware/response";
import { issueToken } from "../tokenStore";

const router = Router();
const DEBUG_LOG_PATH = path.resolve(__dirname, "../../../debug-0e70cb.log");

function debugLog(payload: object) {
  const line = JSON.stringify({ ...payload, timestamp: Date.now() }) + "\n";
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, line);
  } catch (_) {}
}

router.post("/postPasswordLogin", async (req: Request, res: Response) => {
  // #region agent log
  debugLog({ sessionId: "0e70cb", runId: "login", hypothesisId: "A,E", location: "login.ts:postPasswordLogin:entry", message: "postPasswordLogin request", data: { method: req.method, path: req.path, bodyKeys: req.body ? Object.keys(req.body) : [], hasData: !!req.body?.data, dataKeys: req.body?.data ? Object.keys(req.body.data) : [] } });
  // #endregion
  const payload = req.body?.data ?? req.body;
  const account = payload?.account;
  const password = payload?.password;
  if (!account || !password) {
    // #region agent log
    debugLog({ sessionId: "0e70cb", runId: "login", hypothesisId: "A", location: "login.ts:postPasswordLogin:missing", message: "missing account or password", data: { account: !!account, password: !!password } });
    // #endregion
    sendErr(res, "Missing account or password", 400);
    return;
  }

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>("PlayerComponent");
  // #region agent log
  debugLog({ sessionId: "0e70cb", runId: "login", hypothesisId: "B", location: "login.ts:postPasswordLogin:playerComp", message: "PlayerComponent lookup", data: { hasPlayerComp: !!playerComp } });
  // #endregion
  if (!playerComp) {
    sendErr(res, "Server not ready", 503);
    return;
  }

  const ret = await playerComp.login(account, password);
  // #region agent log
  debugLog({ sessionId: "0e70cb", runId: "login", hypothesisId: "C", location: "login.ts:postPasswordLogin:loginResult", message: "playerComp.login result", data: { ok: ret.ok, error: (ret as { ok?: boolean; error?: string }).error } });
  // #endregion
  if (!ret.ok) {
    sendErr(res, ret.error, 401);
    return;
  }

  const token = issueToken(ret.data.userId);
  // #region agent log
  debugLog({ sessionId: "0e70cb", runId: "login", hypothesisId: "D", location: "login.ts:postPasswordLogin:sendSucc", message: "sending success with token", data: { tokenLength: token?.length, userId: ret.data.userId } });
  // #endregion
  sendSucc(res, { token });
});

router.get("/getSendMessage", (_req: Request, res: Response) => {
  // 前端未传手机号，按会话发码可后续扩展；当前直接返回成功，前端跳验证码页
  sendSucc(res, { success: true });
});

// 验证码校验：简单实现为任意 6 位数字即通过（与发码逻辑对应，可后续接真实短信）
const CODE_VERIFY_ACCEPT = "123456";

router.get("/postCodeVerify", (req: Request, res: Response) => {
  const code = (req.query?.code as string) ?? (req.body?.code as string) ?? "";
  if (!code) {
    sendErr(res, "Missing code", 400);
    return;
  }
  // 演示：接受固定码或任意 6 位；生产应校验与 getSendMessage 发出的码一致
  if (code !== CODE_VERIFY_ACCEPT && !/^\d{6}$/.test(code)) {
    sendErr(res, "Invalid code", 401);
    return;
  }
  // 验证码登录时无 userId，生成匿名 token；若发码时绑定了手机号可这里查用户再 issue
  const anonymousId = `phone_${code}_${Date.now()}`;
  const token = issueToken(anonymousId);
  sendSucc(res, { token });
});

export default router;
