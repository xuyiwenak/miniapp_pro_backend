import * as fs from "fs";
import { envFirst } from "./env";
import { gameLogger } from "./logger";
import { resolveSysconfigJsonFile } from "./sysconfig_path";

export function loadSysConfigJson(filename: string): [any, string] {
  const environment = envFirst("environment", "ENV") ?? "development";
  const serverProvide = envFirst("serverProvide", "SERVER_PROVIDE") ?? "";
  const configFilePath = resolveSysconfigJsonFile(
    environment,
    serverProvide,
    filename
  );
  gameLogger.log(configFilePath);
  try {
    const configData = fs.readFileSync(configFilePath, "utf-8");
    const data = JSON.parse(configData);
    gameLogger.debug(`${filename} content: ${data}`);
    return [data, "load succuss"];
  } catch (error) {
    gameLogger.error(error);
    return [undefined, "error"];
  }
}
