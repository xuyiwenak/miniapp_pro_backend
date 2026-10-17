import { uploadToOss as upload, deleteFromOss as remove, signOssUrl as sign,
  type OssConfig } from '../shared/storage/oss';
export { buildOssPutOptions } from '../shared/storage/oss';
import { ComponentManager, EComName } from '../common/BaseComponent';
import { SysCfgComponent } from '../component/SysCfgComponent';

/** 未配置时与历史路径一致，避免已有对象键失效 */
const DEFAULT_OSS_WORKS_OBJECT_PREFIX = 'mandis/user_upload/images';
const DEFAULT_OSS_AVATAR_OBJECT_PREFIX = 'mandis/user_upload/images/avatars';

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


export function uploadToOss(buffer: Buffer, key: string, contentType: string, privateObject = false) {
  return upload(loadOssConfig(), buffer, key, contentType, privateObject);
}
export function deleteFromOss(objectKey: string) {
  return remove(loadOssConfig(), objectKey);
}
export function signOssUrl(objectKey: string, expireSeconds = 7200) {
  return sign(loadOssConfig(), objectKey, expireSeconds);
}
