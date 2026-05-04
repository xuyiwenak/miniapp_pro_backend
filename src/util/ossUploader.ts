import https from 'https';
import crypto from 'crypto';
import { ComponentManager, EComName } from '../common/BaseComponent';
import { SysCfgComponent } from '../component/SysCfgComponent';
import { gameLogger as logger } from './logger';

/** 未配置时与历史路径一致，避免已有对象键失效 */
const DEFAULT_OSS_WORKS_OBJECT_PREFIX = 'mandis/user_upload/images';
const DEFAULT_OSS_AVATAR_OBJECT_PREFIX = 'mandis/user_upload/images/avatars';

interface OssConfig {
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  /** 可选：自定义 CDN/外网域名，用于签名 URL；不填则用 bucket.region.aliyuncs.com */
  cdnDomain?: string;
  /** 作品与通用用户上传（如 /api/upload）对象键前缀，勿尾随 / */
  worksObjectPrefix: string;
  /** 头像（/api/uploadAvatar）对象键前缀，勿尾随 / */
  avatarObjectPrefix: string;
}

type OssConfigFile = Partial<OssConfig> & {
  region?: string;
  accessKeyId?: string;
  accessKeySecret?: string;
  bucket?: string;
};

let cachedOssConfig: OssConfig | null = null;

function normalizeOssObjectPrefix(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().replace(/\/+$/, '');
}

function loadOssConfig(): OssConfig {
  if (cachedOssConfig) return cachedOssConfig;

  const sysCfg = ComponentManager.instance.getComponent(
    EComName.SysCfgComponent,
  ) as SysCfgComponent;
  const raw = sysCfg.server_auth_config as { oss?: OssConfigFile };
  if (!raw?.oss) {
    throw new Error('OSS config not found in server_auth_config');
  }
  const cfg = raw.oss;
  if (!cfg.region || !cfg.accessKeyId || !cfg.accessKeySecret || !cfg.bucket) {
    throw new Error('OSS config is incomplete');
  }
  const worksObjectPrefix =
    normalizeOssObjectPrefix(cfg.worksObjectPrefix) || DEFAULT_OSS_WORKS_OBJECT_PREFIX;
  const avatarObjectPrefix =
    normalizeOssObjectPrefix(cfg.avatarObjectPrefix) || DEFAULT_OSS_AVATAR_OBJECT_PREFIX;
  cachedOssConfig = {
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
    cdnDomain: cfg.cdnDomain?.trim() || undefined,
    worksObjectPrefix,
    avatarObjectPrefix,
  };
  return cachedOssConfig;
}

/** mandis 等：从配置读取作品/头像 OSS 对象前缀（同一 bucket，不同目录） */
export function getOssUploadPrefixes(): Pick<OssConfig, 'worksObjectPrefix' | 'avatarObjectPrefix'> {
  const c = loadOssConfig();
  return { worksObjectPrefix: c.worksObjectPrefix, avatarObjectPrefix: c.avatarObjectPrefix };
}

export function getOssConfigOrNull(): OssConfig | null {
  try {
    return loadOssConfig();
  } catch {
    return null;
  }
}

function ossHost(cfg: OssConfig): string {
  return `${cfg.bucket}.${cfg.region}.aliyuncs.com`;
}

function hmacSha1Base64(key: string, data: string): string {
  return crypto.createHmac('sha1', key).update(data).digest('base64');
}

function buildOssPutOptions(
  cfg: OssConfig, key: string, contentType: string, md5: string, date: string,
): https.RequestOptions {
  const host = ossHost(cfg);
  const stringToSign = `PUT\n${md5}\n${contentType}\n${date}\n/${cfg.bucket}/${key}`;
  const signature = hmacSha1Base64(cfg.accessKeySecret, stringToSign);
  return {
    hostname: host,
    port: 443,
    path: `/${key}`,
    method: 'PUT',
    headers: {
      Authorization: `OSS ${cfg.accessKeyId}:${signature}`,
      'Content-Type': contentType,
      'Content-Length': 0, // overwritten by caller
      'Content-MD5': md5,
      Date: date,
      Host: host,
    },
  };
}

/**
 * 上传文件到 OSS（PUT Object），返回 objectKey（不是公开 URL）。
 */
export function uploadToOss(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const cfg = loadOssConfig();
  const date = new Date().toUTCString();
  const md5 = crypto.createHash('md5').update(buffer).digest('base64');
  const options = buildOssPutOptions(cfg, key, contentType, md5, date);
  // Set actual content length after building options
  (options.headers as Record<string, unknown>)['Content-Length'] = buffer.length;

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          logger.info('OSS upload success, key=', key);
          resolve(key);
        } else {
          const body = Buffer.concat(chunks).toString('utf8');
          reject(new Error(`OSS upload failed: status=${res.statusCode} body=${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.write(buffer);
    req.end();
  });
}

/**
 * 从 OSS 删除一个对象（DELETE Object）。
 */
export function deleteFromOss(objectKey: string): Promise<void> {
  const cfg = loadOssConfig();
  const host = ossHost(cfg);
  const date = new Date().toUTCString();

  const stringToSign = `DELETE\n\n\n${date}\n/${cfg.bucket}/${objectKey}`;
  const signature = hmacSha1Base64(cfg.accessKeySecret, stringToSign);

  const options: https.RequestOptions = {
    hostname: host,
    port: 443,
    path: `/${objectKey}`,
    method: 'DELETE',
    headers: {
      Authorization: `OSS ${cfg.accessKeyId}:${signature}`,
      Date: date,
      Host: host,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        // 204 No Content 或 404（已不存在）都视为成功
        if (res.statusCode === 204 || res.statusCode === 404) {
          logger.info('OSS delete success, key=', objectKey);
          resolve();
        } else {
          const body = Buffer.concat(chunks).toString('utf8');
          reject(new Error(`OSS delete failed: status=${res.statusCode} body=${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

/**
 * 生成 OSS 私有对象的临时签名 URL（纯本地计算，不发 HTTP 请求）。
 * @param objectKey  OSS 中的文件 key
 * @param expireSeconds 有效期，默认 7200 秒（2 小时）
 */
export function signOssUrl(objectKey: string, expireSeconds = 7200): string {
  const cfg = loadOssConfig();
  const expires = Math.floor(Date.now() / 1000) + expireSeconds;
  const stringToSign = `GET\n\n\n${expires}\n/${cfg.bucket}/${objectKey}`;
  const signature = hmacSha1Base64(cfg.accessKeySecret, stringToSign);

  let baseUrl = cfg.cdnDomain
    ? cfg.cdnDomain.replace(/\/+$/, '')
    : `https://${ossHost(cfg)}`;
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `https://${baseUrl}`;
  }
  const encodedSig = encodeURIComponent(signature);
  return `${baseUrl}/${objectKey}?OSSAccessKeyId=${encodeURIComponent(cfg.accessKeyId)}&Expires=${expires}&Signature=${encodedSig}`;
}
