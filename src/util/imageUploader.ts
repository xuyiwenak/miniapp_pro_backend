import fs from "fs";
import path from "path";
import { ComponentManager, EComName } from "../common/BaseComponent";
import { SysCfgComponent } from "../component/SysCfgComponent";
import { getCosConfigOrNull, uploadToCos } from "./cosUploader";

const UPLOADS_DIR = path.join(process.cwd(), "static", "uploads");

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
    const base = (raw?.publicBaseUrl ?? raw?.miniappPublicUrl ?? "").trim();
    return base.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** 是否强制使用本地存储（用于临时不接 CDN 时） */
function isForceLocalStorage(): boolean {
  try {
    const sysCfg = ComponentManager.instance.getComponent(
      EComName.SysCfgComponent,
    ) as SysCfgComponent;
    const raw = sysCfg.server_auth_config as { imageStorage?: string };
    return raw?.imageStorage === "local";
  } catch {
    return false;
  }
}

/**
 * 统一图片存储：未强制本地且已配置 COS 时上传 COS 并返回 CDN URL；
 * 否则写入本地 static/uploads/{key}，通过 /static 对外提供，返回可访问 URL。
 */
export async function uploadToStorage(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const useCos = !isForceLocalStorage() && getCosConfigOrNull() !== null;
  if (useCos) {
    return uploadToCos(buffer, key, contentType);
  }

  ensureUploadsDirForKey(key);
  const filePath = path.join(UPLOADS_DIR, key);
  fs.writeFileSync(filePath, buffer);

  const baseUrl = getPublicBaseUrl();
  const pathUrl = `/static/uploads/${key}`;
  return baseUrl ? `${baseUrl}${pathUrl}` : pathUrl;
}
