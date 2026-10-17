import https from 'https';
import crypto from 'crypto';
import { gameLogger as logger } from '../../util/logger';

export interface OssConfig {
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


function ossHost(cfg: OssConfig): string {
  return `${cfg.bucket}.${cfg.region}.aliyuncs.com`;
}

function hmacSha1Base64(key: string, data: string): string {
  return crypto.createHmac('sha1', key).update(data).digest('base64');
}

export function buildOssPutOptions(
  cfg: OssConfig, key: string, contentType: string, md5: string, date: string, privateObject = false,
): https.RequestOptions {
  const host = ossHost(cfg);
  const aclHeader = privateObject ? 'x-oss-object-acl:private\n' : '';
  const stringToSign = `PUT\n${md5}\n${contentType}\n${date}\n${aclHeader}/${cfg.bucket}/${key}`;
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
      ...(privateObject ? { 'x-oss-object-acl': 'private' } : {}),
      Date: date,
      Host: host,
    },
  };
}

/**
 * 上传文件到 OSS（PUT Object），返回 objectKey（不是公开 URL）。
 */
export function uploadToOss(
  cfg: OssConfig,
  buffer: Buffer,
  key: string,
  contentType: string,
  privateObject = false,
): Promise<string> {
  const date = new Date().toUTCString();
  const md5 = crypto.createHash('md5').update(buffer).digest('base64');
  const options = buildOssPutOptions(cfg, key, contentType, md5, date, privateObject);
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
    req.setTimeout(30_000, () => req.destroy(new Error('OSS request timed out')));
    req.on('error', (err) => reject(err));
    req.write(buffer);
    req.end();
  });
}

/**
 * 从 OSS 删除一个对象（DELETE Object）。
 */
export function deleteFromOss(cfg: OssConfig, objectKey: string): Promise<void> {
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
    req.setTimeout(30_000, () => req.destroy(new Error('OSS request timed out')));
    req.on('error', (err) => reject(err));
    req.end();
  });
}

/**
 * 生成 OSS 私有对象的临时签名 URL（纯本地计算，不发 HTTP 请求）。
 * @param objectKey  OSS 中的文件 key
 * @param expireSeconds 有效期，默认 7200 秒（2 小时）
 */
export function signOssUrl(cfg: OssConfig, objectKey: string, expireSeconds = 7200): string {
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
  return `${baseUrl}/${objectKey}?OSSAccessKeyId=${encodeURIComponent(cfg.accessKeyId)}`
    + `&Expires=${expires}&Signature=${encodedSig}`;
}
