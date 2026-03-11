import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import https from "https";
import { ComponentManager, EComName } from "../../common/BaseComponent";
import type { PlayerComponent } from "../../component/PlayerComponent";
import { sendSucc, sendErr } from "../middleware/response";
import { createToken, issueToken } from "../tokenStore";
import { loadOpenIdByTempToken, revokeToken, saveTempTokenOpenId } from "../../auth/RedisTokenStore";
import { getPlayerModel } from "../../dbservice/model/ZoneDBModel";
import { authMiddleware, type MiniappRequest } from "../middleware/auth";
import { getFeedbackModel, getPersonalInfoModel, getWorkModel } from "../../dbservice/model/GlobalInfoDBModel";

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

  const token = await issueToken(ret.data.userId);
  // #region agent log
  debugLog({ sessionId: "0e70cb", runId: "login", hypothesisId: "D", location: "login.ts:postPasswordLogin:sendSucc", message: "sending success with token", data: { tokenLength: token?.length, userId: ret.data.userId } });
  // #endregion
  sendSucc(res, { token });
});

/** 普通账号注册：账号 + 密码 */
router.post("/postPasswordRegister", async (req: Request, res: Response) => {
  const payload = req.body?.data ?? req.body;
  const account = (payload?.account as string | undefined)?.trim();
  const password = (payload?.password as string | undefined) ?? "";

  if (!account || !password) {
    debugLog({
      sessionId: "0e70cb",
      runId: "login",
      hypothesisId: "REG_A",
      location: "login.ts:postPasswordRegister:missing",
      message: "missing account or password",
      data: { account: !!account, passwordLen: password.length },
    });
    sendErr(res, "Missing account or password", 400);
    return;
  }

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>("PlayerComponent");
  if (!playerComp) {
    sendErr(res, "Server not ready", 503);
    return;
  }

  const ret = await playerComp.register(account, password);
  if (!ret.ok) {
    const status = ret.error === "AccountExists" ? 409 : 500;
    sendErr(res, ret.error, status);
    return;
  }

  const token = await issueToken(ret.data.userId);
  sendSucc(res, { token });
});

router.get("/getSendMessage", (_req: Request, res: Response) => {
  // 前端未传手机号，按会话发码可后续扩展；当前直接返回成功，前端跳验证码页
  sendSucc(res, { success: true });
});

// 验证码校验：简单实现为任意 6 位数字即通过（与发码逻辑对应，可后续接真实短信）
const CODE_VERIFY_ACCEPT = "123456";

router.get("/postCodeVerify", async (req: Request, res: Response) => {
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
  const token = await issueToken(anonymousId);
  sendSucc(res, { token });
});

/** 微信小程序登录：使用 wx.login code 换取 openId，再走 PlayerComponent.loginByOpenId */
router.post("/wxLogin", async (req: Request, res: Response) => {
  const payload = req.body?.data ?? req.body;
  const code = (payload?.code as string | undefined)?.trim();
  if (!code) {
    sendErr(res, "Missing code", 400);
    return;
  }

  const sysCfgComp = ComponentManager.instance.getComponent(
    EComName.SysCfgComponent,
  ) as { server_auth_config?: { wx_miniapp?: { appId?: string; appSecret?: string } } } | null;
  const wxCfg = sysCfgComp?.server_auth_config?.wx_miniapp;

  const appId = wxCfg?.appId;
  const appSecret = wxCfg?.appSecret;

  if (!appId || !appSecret || appId === "YOUR_WECHAT_APPID" || appSecret === "YOUR_WECHAT_APPSECRET") {
    sendErr(res, "WeChat config not set", 500);
    return;
  }

  const jscode2sessionUrl =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}` +
    `&secret=${encodeURIComponent(appSecret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`;

  function fetchCode2Session(): Promise<{ openid?: string; errcode?: number; errmsg?: string }> {
    return new Promise((resolve, reject) => {
      https
        .get(jscode2sessionUrl, (wxRes) => {
          const chunks: Buffer[] = [];
          wxRes.on("data", (d) => chunks.push(d));
          wxRes.on("end", () => {
            try {
              const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              resolve(json);
            } catch (err) {
              reject(err);
            }
          });
        })
        .on("error", (err) => reject(err));
    });
  }

  let openid: string | undefined;
  try {
    const wxResp = await fetchCode2Session();
    if (!wxResp || !wxResp.openid) {
      const errMsg = `WeChat jscode2session failed: ${wxResp?.errcode ?? ""} ${wxResp?.errmsg ?? ""}`;
      debugLog({
        sessionId: "0e70cb",
        runId: "login",
        hypothesisId: "WX",
        location: "login.ts:wxLogin:jscode2session",
        message: errMsg,
        data: { code },
      });
      sendErr(res, "WeChat login failed", 401);
      return;
    }
    openid = wxResp.openid;
  } catch (err) {
    debugLog({
      sessionId: "0e70cb",
      runId: "login",
      hypothesisId: "WX_ERR",
      location: "login.ts:wxLogin:jscode2sessionException",
      message: "jscode2session exception",
      data: { code, error: (err as Error).message },
    });
    sendErr(res, "WeChat login error", 500);
    return;
  }

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>("PlayerComponent");
  if (!playerComp) {
    sendErr(res, "Server not ready", 503);
    return;
  }

  // 先查是否已绑定（不自动注册）
  const existed = await playerComp.findByOpenId(openid);
  if (existed.ok) {
    const token = await issueToken(existed.data.userId);
    sendSucc(res, { token, userId: existed.data.userId, isNewUser: false });
    return;
  }
  // 未找到：下发临时 token，让前端选择“创建新账号”或“绑定已有账号”
  const tempToken = createToken();
  await saveTempTokenOpenId(tempToken, openid);
  sendSucc(res, { isNewUser: true, tempToken });
});

/** 微信用户选择：创建新账号（临时 token -> openId -> auto register） */
router.post("/wxAutoRegister", async (req: Request, res: Response) => {
  const payload = req.body?.data ?? req.body;
  const tempToken = (payload?.tempToken as string | undefined)?.trim();
  if (!tempToken) {
    sendErr(res, "Missing tempToken", 400);
    return;
  }

  const openId = await loadOpenIdByTempToken(tempToken);
  if (!openId) {
    sendErr(res, "Temp token expired", 401);
    return;
  }

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>("PlayerComponent");
  if (!playerComp) {
    sendErr(res, "Server not ready", 503);
    return;
  }

  const ret = await playerComp.loginByOpenId(openId);
  if (!ret.ok) {
    sendErr(res, ret.error, 500);
    return;
  }
  const token = await issueToken(ret.data.userId);
  sendSucc(res, { token, userId: ret.data.userId });
});

async function migrateUserData(oldUserId: string, newUserId: string): Promise<void> {
  if (oldUserId === newUserId) return;

  const PersonalInfo = getPersonalInfoModel();
  const Work = getWorkModel();
  const Feedback = getFeedbackModel();

  // 个人资料：若新账号已存在则不覆盖；否则迁移旧账号的 personalInfo
  const existingNew = await PersonalInfo.findOne({ userId: newUserId }).lean().exec();
  if (!existingNew) {
    await PersonalInfo.updateOne({ userId: oldUserId }, { $set: { userId: newUserId } }).exec();
  }

  // 作品与反馈：直接批量迁移归属
  await Work.updateMany({ authorId: oldUserId }, { $set: { authorId: newUserId } }).exec();
  await Feedback.updateMany({ userId: oldUserId }, { $set: { userId: newUserId } }).exec();
}

/** 微信用户选择：绑定到已有账号（账号密码校验后写入 openId，并合并历史 wx 账号数据） */
router.post("/bindWechat", async (req: Request, res: Response) => {
  const payload = req.body?.data ?? req.body;
  const tempToken = (payload?.tempToken as string | undefined)?.trim();
  const account = (payload?.account as string | undefined)?.trim();
  const password = (payload?.password as string | undefined) ?? "";

  if (!tempToken || !account || !password) {
    sendErr(res, "Missing tempToken or account or password", 400);
    return;
  }

  const openId = await loadOpenIdByTempToken(tempToken);
  if (!openId) {
    sendErr(res, "Temp token expired", 401);
    return;
  }

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>("PlayerComponent");
  if (!playerComp) {
    sendErr(res, "Server not ready", 503);
    return;
  }

  const loginRet = await playerComp.login(account, password);
  if (!loginRet.ok) {
    sendErr(res, loginRet.error, 401);
    return;
  }

  const zoneId = playerComp.getDefaultZoneId();
  if (!zoneId) {
    sendErr(res, "Server not ready", 503);
    return;
  }
  const Player = getPlayerModel(zoneId);
  const targetUserId = loginRet.data.userId;

  const targetPlayer = await Player.findOne({ userId: targetUserId }).exec();
  if (!targetPlayer) {
    sendErr(res, "Account not found", 404);
    return;
  }

  // 目标账号已绑定其他微信
  if (targetPlayer.openId && targetPlayer.openId !== openId) {
    sendErr(res, "Account already bound to another WeChat", 409);
    return;
  }

  // openId 已绑定到其他账号：若是历史 wx 账号则做合并；否则报冲突
  const existingOpenIdPlayer = await Player.findOne({ openId }).exec();
  if (existingOpenIdPlayer && existingOpenIdPlayer.userId !== targetUserId) {
    // 合并旧 wx 账号数据到目标账号
    await migrateUserData(existingOpenIdPlayer.userId, targetUserId);
    await existingOpenIdPlayer.deleteOne();
  }

  targetPlayer.openId = openId;
  await targetPlayer.save();

  const token = await issueToken(targetUserId);
  sendSucc(res, { token, userId: targetUserId });
});

/** 已登录用户解绑微信（要求账号存在密码，否则解绑后无法登录） */
router.post("/unbindWechat", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId!;
  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>("PlayerComponent");
  if (!playerComp) {
    sendErr(res, "Server not ready", 503);
    return;
  }
  const zoneId = playerComp.getDefaultZoneId();
  if (!zoneId) {
    sendErr(res, "Server not ready", 503);
    return;
  }
  const Player = getPlayerModel(zoneId);
  const player = await Player.findOne({ userId }).exec();
  if (!player) {
    sendErr(res, "User not found", 404);
    return;
  }
  if (!player.password) {
    sendErr(res, "Password not set; cannot unbind", 400);
    return;
  }
  player.openId = undefined;
  await player.save();
  sendSucc(res, { success: true });
});

/** 退出登录：令当前 token 失效 */
router.post("/logout", async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      try {
        await revokeToken(token);
      } catch {
        // 后端记录即可，这里对前端仍返回成功，避免阻塞退出流程
      }
    }
  }
  sendSucc(res, { success: true });
});

export default router;
