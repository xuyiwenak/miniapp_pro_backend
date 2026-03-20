import * as fs from "fs";
import path from "path";
import { envFirst } from "./env";
import { gameLogger } from "./logger";
import { getSysconfigDirectory } from "./sysconfig_path";

export function loadSysConfigJson(filename: string): [any, string] {
  const environment = envFirst("environment", "ENV") ?? "development";
  const serverProvide = envFirst("serverProvide", "SERVER_PROVIDE") ?? "";
  const dir = getSysconfigDirectory(environment, serverProvide);
  const configFilePath = path.join(dir, filename);
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
