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
