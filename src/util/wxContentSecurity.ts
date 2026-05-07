import https from 'https';
import { ComponentManager, EComName } from '../common/BaseComponent';
import { getAccessToken } from './wxAccessToken';
import { gameLogger as logger } from './logger';
import { loadSysConfigJson } from './load_json';

type SecurityResult = {
  safe: boolean;
  label?: string;
  errcode?: number;
};

const WX_IMG_SEC_MAX_BYTES = 750 * 1024;
const WX_IMG_SEC_SUPPORTED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
]);

const DEFAULT_WX_IMG_SEC_MAX_BYTES = WX_IMG_SEC_MAX_BYTES;

type RuntimeSecurityConfig = {
  wx_img_sec_max_bytes?: number;
};

function getWxImgSecMaxBytes(): number {
  const [data] = loadSysConfigJson('runtime_config.json');
  const cfg = (data as RuntimeSecurityConfig | undefined) ?? {};
  const value = Number(cfg.wx_img_sec_max_bytes);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_WX_IMG_SEC_MAX_BYTES;
  }
  return Math.floor(value);
}

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
        method: 'POST',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('error', (err) => reject(err));
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
  // 微信 msg_sec_check v2 要求必传 openid，否则报 40003；无 openId 时（如仅账号登录）跳过接口调用
  if (!openId?.trim()) {
    return { safe: true };
  }

  try {
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`;
    const payload = JSON.stringify({
      content,
      version: 2,
      scene,
      openid: openId,
    });

    const raw = await httpsPost(url, Buffer.from(payload, 'utf8'), {
      'Content-Type': 'application/json',
    });
    const json = JSON.parse(raw.toString('utf8'));

    if (json.errcode !== 0) {
      logger.warn('msg_sec_check error:', json.errcode, json.errmsg);
      return { safe: true, errcode: json.errcode };
    }

    const suggest: string | undefined = json.result?.suggest;
    const label: string | undefined = json.result?.label;
    if (suggest === 'risky') {
      return { safe: false, label: label ?? 'risky' };
    }
    return { safe: true, label };
  } catch (err) {
    logger.error('checkText exception:', (err as Error).message);
    return { safe: true };
  }
}

/**
 * 图片安全审核（img_sec_check 同步接口）
 * 图片限制：文件大小 < 750KB，分辨率不超过 2000px，支持 PNG/JPEG/JPG/GIF
 */
export async function checkImage(buffer: Buffer, contentType: string): Promise<SecurityResult> {
  const precheckResult = validateImageSecurityInput(buffer, contentType);
  if (precheckResult) return precheckResult;

  try {
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${token}`;
    const { body, boundary } = buildImageMultipartBody(buffer, contentType);
    const raw = await httpsPost(url, body, {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    });
    const json = JSON.parse(raw.toString('utf8'));

    if (json.errcode === 87014) {
      return { safe: false, label: 'risky', errcode: 87014 };
    }
    // 45002 / 40006: 文件体积或媒体尺寸超限，不再记录为 warning，避免日志噪音
    if (json.errcode === 45002 || json.errcode === 40006) {
      logger.info('img_sec_check skipped by wechat limit:', json.errcode, json.errmsg);
      return { safe: true, errcode: json.errcode, label: 'skipped_wechat_limit' };
    }
    if (json.errcode !== 0) {
      logger.warn('img_sec_check error:', json.errcode, json.errmsg);
    }
    return { safe: true, errcode: json.errcode };
  } catch (err) {
    logger.error('checkImage exception:', (err as Error).message);
    return { safe: true };
  }
}

function validateImageSecurityInput(buffer: Buffer, contentType: string): SecurityResult | null {
  if (!isContentSecurityEnabled()) {
    return { safe: true };
  }
  const maxBytes = getWxImgSecMaxBytes();
  const normalizedType = contentType.toLowerCase();
  if (!WX_IMG_SEC_SUPPORTED_TYPES.has(normalizedType)) {
    logger.info('img_sec_check skipped: unsupported content type', normalizedType);
    return { safe: true, label: 'skipped_unsupported_type' };
  }
  if (buffer.length > maxBytes) {
    logger.info('img_sec_check skipped: content size out of limit', buffer.length, 'max=', maxBytes);
    return { safe: true, label: 'skipped_size_limit', errcode: 45002 };
  }
  return null;
}

function buildImageMultipartBody(buffer: Buffer, contentType: string): { body: Buffer; boundary: string } {
  const boundary = '----WxSecBoundary' + Date.now();
  const filename = 'image.' + (contentType.includes('png') ? 'png' : 'jpg');
  const header = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    boundary,
    body: Buffer.concat([header, buffer, footer]),
  };
}
