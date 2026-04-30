import fs from 'fs';
import path from 'path';
import { ComponentManager, EComName } from '../common/BaseComponent';
import { SysCfgComponent } from '../component/SysCfgComponent';
import { gameLogger as logger } from './logger';
import { getCosConfigOrNull, uploadToCos } from './cosUploader';
import { getOssConfigOrNull, uploadToOss, signOssUrl, deleteFromOss } from './ossUploader';

const UPLOADS_DIR = path.join(process.cwd(), 'static', 'uploads');

const OSS_PREFIX = 'oss://';

function ensureUploadsDirForKey(key: string): void {
  const dir = path.join(UPLOADS_DIR, path.dirname(key));
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getPublicBaseUrl(): string {
  try {
    const sysCfg = ComponentManager.instance.getComponent(
      EComName.SysCfgComponent,
    ) as SysCfgComponent;
    const raw = sysCfg.server_auth_config as { publicBaseUrl?: string; miniappPublicUrl?: string };
    const base = (raw?.publicBaseUrl ?? raw?.miniappPublicUrl ?? '').trim();
    return base.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function getImageStorage(): string {
  try {
    const sysCfg = ComponentManager.instance.getComponent(
      EComName.SysCfgComponent,
    ) as SysCfgComponent;
    const raw = sysCfg.server_auth_config as { imageStorage?: string };
    return raw?.imageStorage ?? 'local';
  } catch {
    return 'local';
  }
}

/**
 * 统一图片存储入口。
 * - "local"：写入本地 static/uploads/{key}，返回可访问 URL
 * - "oss"：上传阿里云 OSS，返回 "oss://{key}"（需通过 resolveImageUrl 签名后访问）
 * - 其他（"cos"）：上传腾讯云 COS，返回 CDN URL
 */
export async function uploadToStorage(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const storage = getImageStorage();

  if (storage === 'oss' && getOssConfigOrNull() !== null) {
    try {
      const objectKey = await uploadToOss(buffer, key, contentType);
      return `${OSS_PREFIX}${objectKey}`;
    } catch (err) {
      // OSS 403/权限或网络失败时回退到本地，避免上传完全不可用
      logger.warn('OSS upload failed, fallback to local storage', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      ensureUploadsDirForKey(key);
      const filePath = path.join(UPLOADS_DIR, key);
      fs.writeFileSync(filePath, buffer);
      const baseUrl = getPublicBaseUrl();
      const pathUrl = `/static/uploads/${key}`;
      return baseUrl ? `${baseUrl}${pathUrl}` : pathUrl;
    }
  }

  if (storage !== 'local' && getCosConfigOrNull() !== null) {
    return uploadToCos(buffer, key, contentType);
  }

  ensureUploadsDirForKey(key);
  const filePath = path.join(UPLOADS_DIR, key);
  fs.writeFileSync(filePath, buffer);

  const baseUrl = getPublicBaseUrl();
  const pathUrl = `/static/uploads/${key}`;
  return baseUrl ? `${baseUrl}${pathUrl}` : pathUrl;
}

/**
 * 根据存储的 URL/Key 删除对应的文件。
 * - "oss://xxx" -> 删除 OSS 对象
 * - 本地路径    -> 删除本地文件
 * - http(s) URL -> 外部文件，不处理
 */
export async function deleteFromStorage(storedUrl: string): Promise<void> {
  if (!storedUrl) return;

  if (storedUrl.startsWith(OSS_PREFIX)) {
    const objectKey = storedUrl.slice(OSS_PREFIX.length);
    await deleteFromOss(objectKey);
    return;
  }

  // 本地文件（相对路径如 /static/uploads/xxx）
  if (!storedUrl.startsWith('http://') && !storedUrl.startsWith('https://')) {
    const relativePath = storedUrl.startsWith('/') ? storedUrl : `/${storedUrl}`;
    const filePath = path.join(process.cwd(), relativePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('Local file deleted:', filePath);
    }
  }
}

/**
 * 将存储的 URL/Key 转换为可访问的 URL。
 * - "oss://xxx" -> 签名临时 URL
 * - "http(s)://xxx" -> 原样返回
 * - 其他 -> 拼上 publicBaseUrl
 */
export function resolveImageUrl(storedUrl: string, expireSeconds = 7200): string {
  if (!storedUrl) return '';

  if (storedUrl.startsWith(OSS_PREFIX)) {
    const objectKey = storedUrl.slice(OSS_PREFIX.length);
    return signOssUrl(objectKey, expireSeconds);
  }

  if (storedUrl.startsWith('http://') || storedUrl.startsWith('https://')) {
    return storedUrl;
  }

  const baseUrl = getPublicBaseUrl();
  return baseUrl ? `${baseUrl}${storedUrl}` : storedUrl;
}
