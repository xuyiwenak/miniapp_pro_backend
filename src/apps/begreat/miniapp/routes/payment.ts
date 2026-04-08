import { Router, Request, Response } from "express";
import https from "https";
import crypto from "crypto";
import { sendSucc, sendErr } from "../../../../shared/miniapp/middleware/response";
import { authMiddleware, type MiniappRequest } from "../../../../shared/miniapp/middleware/auth";
import { getSessionModel } from "../../dbservice/BegreatDBModel";
import { ComponentManager, EComName } from "../../../../common/BaseComponent";
import { gameLogger as logger } from "../../../../util/logger";

const router = Router();

interface WxPayConfig {
  wx_pay?: {
    mchId: string;
    appId: string;
    apiV3Key: string;
    serialNo: string;
    privateKeyPath: string;
  };
}

function getPayConfig(): WxPayConfig {
  const sysCfgComp = ComponentManager.instance.getComponent(EComName.SysCfgComponent);
  return (sysCfgComp.server_auth_config ?? {}) as WxPayConfig;
}

/** 读取私钥（PEM 格式，从文件路径加载） */
function loadPrivateKey(keyPath: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  return fs.readFileSync(keyPath, "utf-8");
}

/** 生成微信支付 V3 Authorization 头 */
function buildV3Authorization(
  method: string,
  url: string,
  body: string,
  mchId: string,
  serialNo: string,
  privateKey: string,
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`;
  const sign = crypto.createSign("RSA-SHA256").update(message).sign(privateKey, "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${sign}"`;
}

/**
 * POST /payment/prepay
 * 创建微信支付预下单，返回前端拉起支付所需参数
 */
router.post("/prepay", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const { sessionId } = req.body ?? {};
  if (!sessionId) { sendErr(res, "Missing sessionId", 400); return; }

  // dev 模式：直接标记支付成功，跳过真实微信支付
  const isDev = (process.env.ENV ?? process.env.environment ?? "development") === "development";
  if (isDev) {
    try {
      const Sessions = getSessionModel();
      const session = await Sessions.findOne({ sessionId, openId: req.userId }).lean().exec();
      if (!session) { sendErr(res, "Session not found", 404); return; }
      if (session.status !== "completed" && session.status !== "paid") {
        sendErr(res, "Assessment not completed", 400); return;
      }
      if (session.status !== "paid") {
        await Sessions.updateOne({ sessionId }, { $set: { status: "paid", paidAt: new Date() } });
        logger.info("[payment/prepay] dev mode: auto-paid session", sessionId);
      }
      sendSucc(res, { devMode: true });
    } catch (err) {
      logger.error("[payment/prepay] dev mode exception:", err);
      sendErr(res, "Internal error", 500);
    }
    return;
  }

  const payCfg = getPayConfig().wx_pay;
  if (!payCfg?.mchId) {
    logger.error("[payment/prepay] wx_pay config missing");
    sendErr(res, "Payment not configured", 500);
    return;
  }

  try {
    const Sessions = getSessionModel();
    const session = await Sessions.findOne({ sessionId, openId: req.userId }).lean().exec();
    if (!session) { sendErr(res, "Session not found", 404); return; }
    if (session.status === "paid") { sendErr(res, "Already paid", 400); return; }
    if (session.status !== "completed") { sendErr(res, "Assessment not completed", 400); return; }

    const outTradeNo = `bg_${sessionId}_${Date.now()}`;
    const privateKey = loadPrivateKey(payCfg.privateKeyPath);

    const reqBody = JSON.stringify({
      appid:        payCfg.appId,
      mchid:        payCfg.mchId,
      description:  "Careertest 完整报告解锁",
      out_trade_no: outTradeNo,
      notify_url:   `${process.env.PUBLIC_BASE_URL ?? ""}/payment/callback`,
      amount:       { total: 2900, currency: "CNY" },  // 29元，单位分
      payer:        { openid: req.userId },
    });

    const urlPath = "/v3/pay/transactions/jsapi";
    const auth = buildV3Authorization("POST", urlPath, reqBody, payCfg.mchId, payCfg.serialNo, privateKey);

    const wxRes = await new Promise<{ prepay_id?: string; code?: string; message?: string }>((resolve, reject) => {
      const options = {
        hostname: "api.mch.weixin.qq.com",
        path:     urlPath,
        method:   "POST",
        headers: {
          "Content-Type":  "application/json",
          "Accept":        "application/json",
          "Authorization": auth,
        },
      };
      const httpReq = https.request(options, (r) => {
        let data = "";
        r.on("data", (c) => (data += c));
        r.on("end", () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid wx response")); }
        });
      });
      httpReq.on("error", reject);
      httpReq.write(reqBody);
      httpReq.end();
    });

    if (!wxRes.prepay_id) {
      logger.warn("[payment/prepay] wx error:", wxRes);
      sendErr(res, `WeChat error: ${wxRes.message ?? "unknown"}`, 500);
      return;
    }

    // 构造前端拉起支付参数
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString("hex");
    const pkg = `prepay_id=${wxRes.prepay_id}`;
    const signStr = `${payCfg.appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
    const paySign = crypto.createSign("RSA-SHA256").update(signStr).sign(privateKey, "base64");

    sendSucc(res, {
      timeStamp,
      nonceStr,
      package: pkg,
      signType: "RSA",
      paySign,
    });
  } catch (err) {
    logger.error("[payment/prepay] exception:", err);
    sendErr(res, "Internal error", 500);
  }
});

/**
 * POST /payment/callback
 * 微信支付 V3 回调：验签后解密通知，更新 session 状态
 */
router.post("/callback", async (req: Request, res: Response) => {
  const payCfg = getPayConfig().wx_pay;
  if (!payCfg?.apiV3Key) {
    res.status(500).json({ code: "FAIL", message: "not configured" });
    return;
  }

  try {
    const { resource } = req.body ?? {};
    if (!resource?.ciphertext) {
      res.status(400).json({ code: "FAIL", message: "Invalid payload" });
      return;
    }

    // AES-256-GCM 解密
    const { algorithm, associated_data, nonce, ciphertext } = resource;
    if (algorithm !== "AEAD_AES_256_GCM") {
      res.status(400).json({ code: "FAIL", message: "Unsupported algorithm" });
      return;
    }

    const key = crypto.createHash("sha256").update(payCfg.apiV3Key).digest();
    const iv  = Buffer.from(nonce, "utf-8");
    const buf = Buffer.from(ciphertext, "base64");
    const tag = buf.slice(buf.length - 16);
    const enc = buf.slice(0, buf.length - 16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    decipher.setAAD(Buffer.from(associated_data, "utf-8"));
    const plaintext = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf-8");
    const notify = JSON.parse(plaintext) as { trade_state?: string; attach?: string; out_trade_no?: string };

    if (notify.trade_state !== "SUCCESS") {
      res.json({ code: "SUCCESS", message: "OK" });
      return;
    }

    // out_trade_no 格式：bg_{sessionId}_{timestamp}
    const outTradeNo = notify.out_trade_no ?? "";
    const sessionId  = outTradeNo.split("_")[1];

    if (sessionId) {
      const Sessions = getSessionModel();
      await Sessions.updateOne(
        { sessionId, status: "completed" },
        { $set: { status: "paid", paidAt: new Date() } }
      );
      logger.info("[payment/callback] session paid:", sessionId);
    }

    res.json({ code: "SUCCESS", message: "OK" });
  } catch (err) {
    logger.error("[payment/callback] exception:", err);
    res.status(500).json({ code: "FAIL", message: "Internal error" });
  }
});

/**
 * GET /payment/status/:sessionId
 * 前端轮询支付状态
 */
router.get("/status/:sessionId", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const { sessionId } = req.params;
  try {
    const Sessions = getSessionModel();
    const session = await Sessions.findOne({ sessionId, openId: req.userId }).select("status paidAt").lean().exec();
    if (!session) { sendErr(res, "Session not found", 404); return; }
    sendSucc(res, { status: session.status, isPaid: session.status === "paid" });
  } catch (err) {
    logger.error("[payment/status]", err);
    sendErr(res, "Internal error", 500);
  }
});

export default router;
