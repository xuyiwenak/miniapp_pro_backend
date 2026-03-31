import { envFirst } from "./env";
import { gameLogger } from "./logger";
import { readSysconfigJsonFileUtf8 } from "./sysconfig_path";

export function loadSysConfigJson(filename: string): [any, string] {
  const environment = envFirst("environment", "ENV") ?? "development";
  const serverProvide = envFirst("serverProvide", "SERVER_PROVIDE") ?? "";
  try {
    const { utf8, path: configFilePath } = readSysconfigJsonFileUtf8(
      environment,
      serverProvide,
      filename
    );
    gameLogger.debug(`Loaded config: ${configFilePath}`);
    const data = JSON.parse(utf8);
    return [data, "load succuss"];
  } catch (error) {
    gameLogger.error(error);
    return [undefined, "error"];
  }
}
