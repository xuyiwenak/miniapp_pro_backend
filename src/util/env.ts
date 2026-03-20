/**
 * 环境变量：优先小写（与 PM2/脚本一致），否则兼容 Docker 大写别名。
 */
export function envFirst(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

export function envNumber(...keys: string[]): number | undefined {
  const raw = envFirst(...keys);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * 与 load_json 等仍直接读 `process.env` 的逻辑对齐。
 * 在 `main()` 入口尽早调用。
 */
export function syncEnvForSysConfig(): void {
  process.env.environment =
    envFirst("environment", "ENV") ?? "development";
  process.env.serverProvide =
    envFirst("serverProvide", "SERVER_PROVIDE") ?? "";
}
