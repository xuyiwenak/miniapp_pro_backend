import { ComponentManager, EComName } from "../../common/BaseComponent";
import { ServerGlobals } from "../../common/ServerGlobal";
import { GlobalVarComponent } from "../../component/GlobalVarComponent";
import { SysCfgComponent } from "../../component/SysCfgComponent";
import { BegreatMongoComponent } from "./component/BegreatMongoComponent";
import { envFirst, envNumber, syncEnvForSysConfig } from "../../util/env";
import { gameLogger as logger } from "../../util/logger";
import { startBegreatServer } from "./miniapp/server";

async function main() {
  syncEnvForSysConfig();

  const args: ServerGlobals = {
    id:                  envFirst("id", "SERVER_ID") ?? "begreat_1",
    gameType:            "begreat",
    environment:         envFirst("environment", "ENV") ?? "development",
    port:                0,  // no WebSocket
    httpPort:            envNumber("httpPort", "HTTP_PORT") ?? 41001,
    miniappApiPort:      envNumber("miniappApiPort", "MINIAPP_PORT") ?? 41002,
    connectionTickTimeout: 30000,
    serverProvide:       envFirst("serverProvide", "SERVER_PROVIDE") ?? "",
  };

  logger.info("[begreat] starting, env:", args.environment, "id:", args.id);

  const globalVarComp = new GlobalVarComponent();
  globalVarComp.init(args);
  ComponentManager.instance.register(EComName.GlobalVarComponent, globalVarComp);

  const sysCfgComp = new SysCfgComponent();
  ComponentManager.instance.register(EComName.SysCfgComponent, sysCfgComp);

  const mongoComp = new BegreatMongoComponent();
  ComponentManager.instance.register("BegreatMongoComponent", mongoComp);

  await ComponentManager.instance.startAll();
  await ComponentManager.instance.afterStartAll();

  await startBegreatServer(args.miniappApiPort!);
}

main().catch((err) => {
  console.error("[begreat] Fatal startup error:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => logger.error("[begreat] Uncaught exception:", err.message));
process.on("unhandledRejection", (reason) => logger.warn("[begreat] Unhandled rejection:", String(reason)));

process.on("SIGINT",  () => { logger.info("[begreat] SIGINT, shutting down"); process.exit(0); });
process.on("SIGTERM", () => { logger.info("[begreat] SIGTERM, shutting down"); process.exit(0); });
