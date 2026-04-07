import { Router, Request, Response } from "express";
import https from "https";
import { ComponentManager, EComName } from "../../../../common/BaseComponent";
import { sendSucc, sendErr } from "../../../../shared/miniapp/middleware/response";
import { issueToken } from "../../../../shared/miniapp/tokenStore";
import { gameLogger as logger } from "../../../../util/logger";

const router = Router();

interface WxAuthConfig {
  wx_miniapp?: { appId?: string; appSecret?: string };
}

function getWxConfig(): WxAuthConfig {
  const sysCfgComp = ComponentManager.instance.getComponent(EComName.SysCfgComponent);
  return (sysCfgComp.server_auth_config ?? {}) as WxAuthConfig;
}

/** 微信 code2session */
function code2session(appId: string, appSecret: string, code: string): Promise<{ openid?: string; session_key?: string; errcode?: number; errmsg?: string }> {
  return new Promise((resolve, reject) => {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Invalid JSON from weixin")); }
      });
    }).on("error", reject);
  });
}

/**
 * POST /login/wx
 * body: { code: string }
 * 返回: { token }
 */
router.post("/wx", async (req: Request, res: Response) => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    sendErr(res, "Missing wx code", 400);
    return;
  }

  const wxCfg = getWxConfig().wx_miniapp;
  if (!wxCfg?.appId || !wxCfg?.appSecret) {
    logger.error("[begreat/login] wx_miniapp config missing");
    sendErr(res, "Server misconfigured", 500);
    return;
  }

  try {
    const result = await code2session(wxCfg.appId, wxCfg.appSecret, code);
    if (result.errcode || !result.openid) {
      logger.warn("[begreat/login] code2session failed:", result.errmsg);
      sendErr(res, "WeChat auth failed: " + (result.errmsg ?? "unknown"), 401);
      return;
    }

    const token = await issueToken(result.openid);
    sendSucc(res, { token, openId: result.openid });
  } catch (err) {
    logger.error("[begreat/login] exception:", err);
    sendErr(res, "Internal error", 500);
  }
});

export default router;
