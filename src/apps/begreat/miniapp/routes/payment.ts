import { Router, Request, Response } from "express";
import https from "https";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { sendSucc, sendErr } from "../../../../shared/miniapp/middleware/response";
import { authMiddleware, type MiniappRequest } from "../../../../shared/miniapp/middleware/auth";
import { getSessionModel, getPaymentModel } from "../../dbservice/BegreatDBModel";
import { paymentLogger as logger } from "../../../../util/logger";
import { getRuntimeConfig } from "../../config/BegreatRuntimeConfig";

const router = Router();

interface WxPayConfig {
  wx_pay?: {
    mchId: string;
    appId: string;
    apiV3Key: string;
    serialNo: string;
    privateKeyPath: string;
    notifyBaseUrl?: string;
  };
}

/**
 * 读取 wx_pay_config.local.json（仅 production 环境需要）。
 * development 环境走 devMode，直接返回空配置。
 */
function getPayConfig(): WxPayConfig {
  const env = process.env.ENV ?? process.env.environment ?? "development";
  if (env === "development") return {};

  const localCfgPath = path.resolve(
    __dirname,
    `../../../../../apps/begreat/sysconfig/${env}/wx_pay_config.local.json`,
  );
  if (fs.existsSync(localCfgPath)) {
    try {
      const raw = fs.readFileSync(localCfgPath, "utf-8");
      return JSON.parse(raw) as WxPayConfig;
    } catch (e) {
      logger.warn("[payment] Failed to parse wx_pay_config.local.json:", e);
    }
  }
  return {};
}

function loadPrivateKey(keyPath: string): string {
  return fs.readFileSync(keyPath, "utf-8");
}

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
 * GET /payment/config
 * 下发支付配置给前端（当前价格）
 */
router.get("/config", (_req, res: Response) => {
  const { price_fen: fen } = getRuntimeConfig();
  const yuan = (fen / 100).toFixed(2).replace(/\.00$/, "");
  sendSucc(res, { priceFen: fen, priceText: `¥${yuan}` });
});

/**
 * POST /payment/prepay
 * 创建预下单，同步写入 PaymentRecord(pending)
 */
router.post("/prepay", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const { sessionId } = req.body ?? {};
  if (!sessionId) { sendErr(res, "Missing sessionId", 400); return; }

  const isDev = (process.env.ENV ?? process.env.environment ?? "development") === "development";

  if (isDev) {
    try {
      const Sessions = getSessionModel();
      const Payments = getPaymentModel();
      const session = await Sessions.findOne({ sessionId, openId: req.userId }).lean().exec();
      if (!session) { sendErr(res, "Session not found", 404); return; }
      if (session.status !== "completed" && session.status !== "invite_unlocked" && session.status !== "paid") {
        sendErr(res, "Assessment not completed", 400); return;
      }
      if (session.status !== "paid") {
        const outTradeNo = `bg_${sessionId}_dev`;
        // 幂等：dev 模式下同一 session 只写一条
        const priceFen = getRuntimeConfig().price_fen;
        await Payments.updateOne(
          { outTradeNo },
          {
            $setOnInsert: {
              outTradeNo,
              sessionId,
              openId:  req.userId,
              amount:  priceFen,
              status:  "success",
              paidAt:  new Date(),
              imageGenerated: false,
            },
          },
          { upsert: true }
        );
        await Sessions.updateOne({ sessionId }, { $set: { status: "paid", paidAt: new Date() } });
        logger.info("[payment/prepay] dev mode: auto-paid", sessionId);
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
    const Payments = getPaymentModel();
    const session = await Sessions.findOne({ sessionId, openId: req.userId }).lean().exec();
    if (!session) { sendErr(res, "Session not found", 404); return; }
    if (session.status === "paid") { sendErr(res, "Already paid", 400); return; }
    if (session.status !== "completed" && session.status !== "invite_unlocked") {
      sendErr(res, "Assessment not completed", 400); return;
    }

    const outTradeNo = `bg_${sessionId.substring(0, 22)}_${Date.now().toString().slice(-6)}`;
    const privateKey = loadPrivateKey(payCfg.privateKeyPath);

    const priceFen = getRuntimeConfig().price_fen;
    const reqBody = JSON.stringify({
      appid:        payCfg.appId,
      mchid:        payCfg.mchId,
      description:  "Careertest 完整报告解锁",
      out_trade_no: outTradeNo,
      notify_url:   `${payCfg.notifyBaseUrl ?? process.env.PUBLIC_BASE_URL ?? ""}/payment/callback`,
      amount:       { total: priceFen, currency: "CNY" },
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

    // 预下单成功后写入 pending 记录（priceFen 已在上方读取）
    await Payments.create({
      outTradeNo,
      sessionId,
      openId:  req.userId,
      amount:  priceFen,
      status:  "pending",
      imageGenerated: false,
    });

    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString("hex");
    const pkg = `prepay_id=${wxRes.prepay_id}`;
    const signStr = `${payCfg.appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
    const paySign = crypto.createSign("RSA-SHA256").update(signStr).sign(privateKey, "base64");

    sendSucc(res, { timeStamp, nonceStr, package: pkg, signType: "RSA", paySign });
  } catch (err) {
    logger.error("[payment/prepay] exception:", err);
    sendErr(res, "Internal error", 500);
  }
});

/**
 * POST /payment/callback
 * 微信支付回调：验签解密，更新 PaymentRecord + session
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
    const notify = JSON.parse(plaintext) as {
      trade_state?: string;
      out_trade_no?: string;
      payer?: { openid?: string };
    };

    if (notify.trade_state !== "SUCCESS") {
      res.json({ code: "SUCCESS", message: "OK" });
      return;
    }

    const outTradeNo = notify.out_trade_no ?? "";

    if (outTradeNo) {
      const Sessions = getSessionModel();
      const Payments = getPaymentModel();
      const paidAt   = new Date();

      // 幂等更新：只对 pending 状态生效，防重复回调
      const payment = await Payments.findOneAndUpdate(
        { outTradeNo, status: "pending" },
        { $set: { status: "success", paidAt } },
        { new: true }
      );

      if (payment?.sessionId) {
        await Sessions.updateOne(
          { sessionId: payment.sessionId, status: "completed" },
          { $set: { status: "paid", paidAt } }
        );
        logger.info("[payment/callback] session paid:", payment.sessionId, "trade:", outTradeNo);
      }
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

/**
 * GET /payment/records
 * 管理端：分页查询付费记录（需 admin auth，此处用 authMiddleware 代替，生产环境应加 admin 鉴权）
 */
router.get("/records", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query["page"]  ?? "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "20"))));
  const status = req.query["status"] as string | undefined;

  try {
    const Payments = getPaymentModel();
    const filter = status ? { status } : {};
    const [records, total] = await Promise.all([
      Payments.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      Payments.countDocuments(filter),
    ]);
    sendSucc(res, { records, total, page, limit });
  } catch (err) {
    logger.error("[payment/records]", err);
    sendErr(res, "Internal error", 500);
  }
});

export default router;
