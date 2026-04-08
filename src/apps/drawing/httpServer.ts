import path from "path";
import { HttpServer } from "tsrpc";
import {
  serviceProto as serviceProto_Public,
  ServiceType as ServiceType_Public,
} from "./protocols/serviceProto";
import { gameLogger } from "../../util/logger";
import type { ServerGlobals } from "../../common/ServerGlobal";

export let httpGameServer: HttpServer<ServiceType_Public> | undefined;

/** 与 TSRPC HttpServer 一致的共享配置，供 miniapp 等复用（logger、CORS） */
export const sharedHttpOptions = {
  logger: gameLogger,
  cors: "*" as const,
  corsMaxAge: 3600,
};

/** 根据 ServerGlobals 计算小程序 API 端口（与主 HTTP 端口区分，默认 httpPort+1） */
export function getMiniappPort(options: ServerGlobals): number {
  if (options.miniappApiPort !== undefined) {
    return options.miniappApiPort;
  }
  return options.httpPort ? options.httpPort + 1 : 40002;
}

export async function initHttpServer(options: ServerGlobals) {
  // 主 HTTP 服务只承载 TSRPC；miniapp 走独立 Express 端口（见 getMiniappPort）
  httpGameServer = new HttpServer<ServiceType_Public>(serviceProto_Public, {
    port: options.httpPort!,
    logger: sharedHttpOptions.logger,
    json: true,
    logReqBody: true,
    logResBody: true,
    cors: sharedHttpOptions.cors,
    corsMaxAge: sharedHttpOptions.corsMaxAge,
  });

  await httpGameServer.autoImplementApi(
    path.resolve(__dirname, "./api"),
  );
}

export async function startHttpServer() {
  if (!httpGameServer) {
    // 防止遗漏 init 调用导致空实例启动
    throw new Error("HttpServer not initialized");
  }

  await httpGameServer.start();
  gameLogger.info("HttpServer started at", httpGameServer.options.port);
}

