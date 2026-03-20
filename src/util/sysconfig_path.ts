import fs from "fs";
import path from "path";

/**
 * 相对 `dist/util` 的 sysconfig 子路径（未设置 SYSCONFIG_ROOT 时使用）。
 */
export function getBaseConfigPath(
  environment: string,
  serverProvide: string
): string {
  if (serverProvide) {
    return `../sysconfig/${environment}/${serverProvide}/`;
  }
  return `../sysconfig/${environment}/`;
}

/**
 * 解析 sysconfig 目录的绝对路径。
 * - 若设置 `SYSCONFIG_ROOT`（Docker 挂载）：`{ROOT}/{environment}/[serverProvide]/`
 * - 否则：镜像内默认 `dist/sysconfig/...`
 */
export function getSysconfigDirectory(
  environment: string,
  serverProvide: string
): string {
  const root = process.env.SYSCONFIG_ROOT?.trim();
  if (root) {
    const dir = serverProvide
      ? path.join(root, environment, serverProvide)
      : path.join(root, environment);
    return path.resolve(dir);
  }
  const relativeBase = getBaseConfigPath(environment, serverProvide);
  return path.resolve(__dirname, relativeBase);
}

/** 日志配置所在目录（与 JSON 配置同环境子目录）。 */
export function getSysconfigLogDirectory(environment: string): string {
  const root = process.env.SYSCONFIG_ROOT?.trim();
  if (root) {
    return path.resolve(path.join(root, environment));
  }
  return path.resolve(__dirname, `../sysconfig/${environment}`);
}

/**
 * 解析 sysconfig 下单个 JSON 的绝对路径：优先 SYSCONFIG_ROOT 挂载目录，不存在则回退到镜像内 dist/sysconfig。
 * 解决 Docker 未注入 SYSCONFIG_ROOT、或挂载未就绪时仍可读构建产物中的配置。
 */
export function resolveSysconfigJsonFile(
  environment: string,
  serverProvide: string,
  filename: string
): string {
  const primary = path.join(
    getSysconfigDirectory(environment, serverProvide),
    filename
  );
  if (fs.existsSync(primary)) {
    return primary;
  }
  const fallbackDir = path.resolve(
    __dirname,
    getBaseConfigPath(environment, serverProvide)
  );
  const fallback = path.join(fallbackDir, filename);
  if (fs.existsSync(fallback)) {
    return fallback;
  }
  return primary;
}

/**
 * 读取 sysconfig 下 JSON：先 SYSCONFIG_ROOT 挂载目录，再镜像内 dist/sysconfig。
 * 两处都不存在时抛出明确错误（避免只报单一路径、难以排查 ECS）。
 */
export function readSysconfigJsonFileUtf8(
  environment: string,
  serverProvide: string,
  filename: string
): { utf8: string; path: string } {
  const primary = path.join(
    getSysconfigDirectory(environment, serverProvide),
    filename
  );
  const fallback = path.join(
    path.resolve(__dirname, getBaseConfigPath(environment, serverProvide)),
    filename
  );
  if (fs.existsSync(primary)) {
    return { utf8: fs.readFileSync(primary, "utf-8"), path: primary };
  }
  if (fs.existsSync(fallback)) {
    return { utf8: fs.readFileSync(fallback, "utf-8"), path: fallback };
  }
  throw new Error(
    `Missing sysconfig file ${filename}. Tried:\n  ${primary}\n  ${fallback}\n` +
      `On ECS: ensure src/sysconfig/${environment}/${filename} exists (volume → SYSCONFIG_ROOT), ` +
      `or rebuild the image so dist/sysconfig includes JSON (npm run copy-config / Dockerfile).`
  );
}
