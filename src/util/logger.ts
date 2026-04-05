/*
 * @Author: lyh
 * @Github:
 * @FilePath: /InstanceServer/src/util/logger.ts
 * @Date: 2024-11-08 14:53:32
 * @LastEditors: lyh
 * @LastEditTime: 2024-11-11 15:22:48
 */
import * as log4js from "log4js";
import { envFirst } from "./env";
import { readSysconfigJsonFileUtf8 } from "./sysconfig_path";

(function init_logger() {
  const environment =
    envFirst("environment", "ENV") ?? "development";

  try {
    const { utf8 } = readSysconfigJsonFileUtf8(
      environment,
      "",
      "log_config.json"
    );
    const config = JSON.parse(utf8);

    // 将 APP_NAME 注入到每个 appender 的 layout pattern，方便区分多项目日志
    const appName = envFirst("APP_NAME");
    if (appName) {
      for (const appender of Object.values(config.appenders ?? {}) as Record<string, unknown>[]) {
        const layout = appender.layout as Record<string, unknown> | undefined;
        if (typeof layout?.pattern === "string") {
          layout.pattern = layout.pattern.replace("[%p]", `[${appName}][%p]`);
        }
      }
    }

    log4js.configure(config);
  } catch (error) {
    console.error("init_logger failed", error);
    process.exit(1);
  }
})();

export const serverLogger = log4js.getLogger("server");
export const gameLogger = log4js.getLogger("game");
export const prop_history_csvLogger = log4js.getLogger("prop_history_csv");
export const cozeDebugLogger = log4js.getLogger("coze_debug");
