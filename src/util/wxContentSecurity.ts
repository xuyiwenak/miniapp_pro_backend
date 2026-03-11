import https from "https";
import { ComponentManager, EComName } from "../common/BaseComponent";
import { getAccessToken } from "./wxAccessToken";
import { gameLogger as logger } from "./logger";

type SecurityResult = {
  safe: boolean;
  label?: string;
  errcode?: number;
};

function isContentSecurityEnabled(): boolean {
  try {
    const sysCfg = ComponentManager.instance.getComponent(EComName.SysCfgComponent) as {
      server_auth_config?: { contentSecurity?: boolean };
    } | null;
    return sysCfg?.server_auth_config?.contentSecurity === true;
  } catch {
    return false;
  }
}

function httpsPost(url: string, body: Buffer, headers: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on("error", (err) => reject(err));
    req.end(body);
  });
}

/**
 * 文字安全审核（msg_sec_check v2）
 * scene: 1=资料 2=评论 3=论坛 4=社交日志
 */
export async function checkText(content: string, openId?: string, scene: number = 2): Promise<SecurityResult> {
  if (!isContentSecurityEnabled()) {
    return { safe: true };
  }
  if (!content.trim()) {
    return { safe: true };
  }

  try {
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`;
    const payload = JSON.stringify({
      content,
      version: 2,
      scene,
      ...(openId ? { openid: openId } : {}),
    });

    const raw = await httpsPost(url, Buffer.from(payload, "utf8"), {
      "Content-Type": "application/json",
    });
    const json = JSON.parse(raw.toString("utf8"));

    if (json.errcode !== 0) {
      logger.warn("msg_sec_check error:", json.errcode, json.errmsg);
      return { safe: true, errcode: json.errcode };
    }

    const suggest: string | undefined = json.result?.suggest;
    const label: string | undefined = json.result?.label;
    if (suggest === "risky") {
      return { safe: false, label: label ?? "risky" };
    }
    return { safe: true, label };
  } catch (err) {
    logger.error("checkText exception:", (err as Error).message);
    return { safe: true };
  }
}

/**
 * 图片安全审核（img_sec_check 同步接口）
 * 图片限制：文件大小 < 750KB，分辨率不超过 2000px，支持 PNG/JPEG/JPG/GIF
 */
export async function checkImage(buffer: Buffer, contentType: string): Promise<SecurityResult> {
  if (!isContentSecurityEnabled()) {
    return { safe: true };
  }

  try {
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${token}`;

    const boundary = "----WxSecBoundary" + Date.now();
    const fieldName = "media";
    const filename = "image." + (contentType.includes("png") ? "png" : "jpg");

    const header = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, buffer, footer]);

    const raw = await httpsPost(url, body, {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    });
    const json = JSON.parse(raw.toString("utf8"));

    if (json.errcode === 87014) {
      return { safe: false, label: "risky", errcode: 87014 };
    }
    if (json.errcode !== 0) {
      logger.warn("img_sec_check error:", json.errcode, json.errmsg);
    }
    return { safe: true, errcode: json.errcode };
  } catch (err) {
    logger.error("checkImage exception:", (err as Error).message);
    return { safe: true };
  }
}
