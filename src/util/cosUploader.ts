import COS from 'cos-nodejs-sdk-v5';
import { ComponentManager, EComName } from '../common/BaseComponent';
import { SysCfgComponent } from '../component/SysCfgComponent';

type CosConfig = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  cdnDomain?: string;
};

let cachedCosClient: COS | null = null;
let cachedCosConfig: CosConfig | null = null;

function loadCosConfig(): CosConfig {
  if (cachedCosConfig) return cachedCosConfig;

  const sysCfg = ComponentManager.instance.getComponent(
    EComName.SysCfgComponent,
  ) as SysCfgComponent;
  const raw = sysCfg.server_auth_config as {
    cos?: Partial<CosConfig>;
  };
  if (!raw || !raw.cos) {
    throw new Error('COS config not found in server_auth_config');
  }
  const cfg = raw.cos;
  if (!cfg.secretId || !cfg.secretKey || !cfg.bucket || !cfg.region) {
    throw new Error('COS config is incomplete');
  }
  cachedCosConfig = {
    secretId: cfg.secretId,
    secretKey: cfg.secretKey,
    bucket: cfg.bucket,
    region: cfg.region,
    cdnDomain: cfg.cdnDomain,
  };
  return cachedCosConfig;
}

/** 不抛错：未配置或配置不完整时返回 null */
export function getCosConfigOrNull(): CosConfig | null {
  try {
    return loadCosConfig();
  } catch {
    return null;
  }
}

function getCosClient(): COS {
  if (cachedCosClient) return cachedCosClient;
  const cfg = loadCosConfig();
  cachedCosClient = new COS({
    SecretId: cfg.secretId,
    SecretKey: cfg.secretKey,
  });
  return cachedCosClient;
}

export async function uploadToCos(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const cos = getCosClient();
  const cfg = loadCosConfig();

  await new Promise<void>((resolve, reject) => {
    cos.putObject(
      {
        Bucket: cfg.bucket,
        Region: cfg.region,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      },
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      },
    );
  });

  if (cfg.cdnDomain) {
    const trimmedDomain = cfg.cdnDomain.replace(/\/+$/, '');
    return `${trimmedDomain}/${key}`;
  }
  // fallback to COS 原始访问域名
  return `https://${cfg.bucket}.cos.${cfg.region}.myqcloud.com/${key}`;
}

