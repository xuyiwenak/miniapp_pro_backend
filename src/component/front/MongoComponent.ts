/*
 * @Author: lyh
 * @Github:
 * @FilePath: /InstanceServer/src/component/front/MongoComponent.ts
 * @Date: 2024-10-28 16:17:41
 * @LastEditors: lyh
 * @LastEditTime: 2025-01-09 18:00:36
 */
import {
  ComponentManager,
  EComName,
  IBaseComponent,
} from "../../common/BaseComponent";
import {
  getGlobalModelManager,
  initializeGlobalModel,
} from "../../dbservice/model/GlobalInfoDBModel";

import assert from "assert";
import * as dns from "dns";
import * as mongoose from "mongoose";
import { DBCfg } from "../../common/CommonType";
import {
  getServerModelManager,
  initializeServerModel,
} from "../../dbservice/model/ServerDBModel";
import {
  initializeZoneModel,
  stopAllZoneConnection,
} from "../../dbservice/model/ZoneDBModel";
import { gameLogger as logger } from "../../util/logger";
import { buildMongoUrl } from "../../util/mongo_url";

export class MongoComponent implements IBaseComponent {
  init() {}

  /** 在调用 mongoose 之前先等 DNS 可解析，避免 EAI_AGAIN 泄漏进 mongoose 内部 Promise */
  private async waitForDns(hostname: string, maxAttempts = 20): Promise<void> {
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        await new Promise<void>((resolve, reject) =>
          dns.resolve4(hostname, (err) => (err ? reject(err) : resolve())),
        );
        logger.info(`DNS resolved: ${hostname}`);
        return;
      } catch {
        if (i === maxAttempts) throw new Error(`DNS resolution for "${hostname}" failed after ${maxAttempts} attempts`);
        const delay = Math.min(2000 * i, 15000);
        logger.warn(`DNS not ready for "${hostname}", retrying in ${delay}ms (${i}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  async start() {
    const sysCfgComp = ComponentManager.instance.getComponent(
      EComName.SysCfgComponent
    );

    // 先确认 mongo hostname 可解析，再让 mongoose 尝试连接
    if (sysCfgComp.db_global?.host) {
      await this.waitForDns(sysCfgComp.db_global.host);
    }
    if (sysCfgComp.db_global) {
      await this.connectWithRetry(sysCfgComp.db_global, initializeGlobalModel);
      logger.debug("sysCfgComp.db_server1");
    }

    const server = sysCfgComp.server.serverId;
    logger.debug("server ", server, sysCfgComp.db_server_map);
    const serverCfg = sysCfgComp.db_server_map.get(server);
    assert(
      serverCfg !== undefined,
      `Server config not found for serverId: ${server}`
    );
    await this.connectWithRetry(serverCfg, initializeServerModel);
    logger.debug("sysCfgComp.db_server2");

    const zoneList = sysCfgComp.server.zoneIdList;
    logger.debug("zoneList ", zoneList);
    for (const zone of zoneList) {
      const zoneCfg = sysCfgComp.db_server_map.get(server);
      assert(
        zoneCfg !== undefined,
        `Server config not found for zone: ${zone}`
      );
      await this.connectWithRetry(zoneCfg, initializeZoneModel, zone);
      logger.debug("sysCfgComp.db_server3");
    }
  }

  /** 带指数退避重试的连接包装，解决容器启动竞态（单独重启时 depends_on 不生效） */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-explicit-any
  private async connectWithRetry(
    dbConfig: DBCfg,
    callback: Function,
    zone?: string,
    maxRetries = 12,
    baseDelayMs = 3000,
  ): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (zone !== undefined) {
          return await this.initDbZoneConnection(dbConfig, zone, callback);
        }
        return await this.initDbConnection(dbConfig, callback);
      } catch (err) {
        if (attempt === maxRetries) {
          logger.error(`MongoDB connection failed after ${maxRetries} attempts, giving up.`);
          throw err;
        }
        const delayMs = Math.min(baseDelayMs * attempt, 30000);
        logger.warn(
          `MongoDB connection attempt ${attempt}/${maxRetries} failed: ${(err as Error).message} — retrying in ${delayMs}ms`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  async afterStart() {}

  async stop() {
    await getGlobalModelManager().stopConnection();
    await getServerModelManager().stopConnection();
    await stopAllZoneConnection();
  }

  private static readonly CONN_OPTIONS: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: 8000,   // 选主超时，超时后报错而不是永久阻塞
    heartbeatFrequencyMS: 10000,      // 心跳频率，及时感知节点状态
    connectTimeoutMS: 10000,          // 初始 TCP 连接超时
    socketTimeoutMS: 45000,           // 空闲 socket 超时
    retryWrites: true,
    retryReads: true,
    maxPoolSize: 10,
    minPoolSize: 2,
    family: 4,                        // 强制 IPv4，避免 Docker DNS 解析 AAAA 超时
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-explicit-any
  async initDbConnection(dbConfig: DBCfg, callback: Function): Promise<any> {
    const url = buildMongoUrl(dbConfig);
    const connection = mongoose.createConnection(url, MongoComponent.CONN_OPTIONS);

    // 必须在 asPromise() 之前注册 error 监听，否则 mongoose/driver 内部发出的
    // error event 无人接收 → Node.js 当作 uncaught → 进程崩溃，重试失效
    connection.on("error", () => {});

    try {
      await connection.asPromise();
    } catch (err) {
      // 失败后清理：移除监听、关闭连接，让 connectWithRetry 可以建新连接
      connection.removeAllListeners();
      try { await connection.close(true); } catch {}
      throw err;
    }

    logger.info("MongoDB connected", dbConfig.db);

    // 连接成功后替换为真正的事件处理器
    connection.removeAllListeners("error");
    connection.on("error", (error: Error) => {
      logger.error("MongoDB connection error:", error.message);
    });
    connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected, mongoose will auto-reconnect", dbConfig.db);
    });
    connection.on("reconnected", () => {
      logger.info("MongoDB reconnected", dbConfig.db);
    });

    return callback(connection);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-explicit-any
  async initDbZoneConnection(
    dbConfig: DBCfg,
    zone: string,
    callback: Function,
  ): Promise<any> {
    const url = buildMongoUrl(dbConfig);
    const connection = mongoose.createConnection(url, MongoComponent.CONN_OPTIONS);

    connection.on("error", () => {});

    try {
      await connection.asPromise();
    } catch (err) {
      connection.removeAllListeners();
      try { await connection.close(true); } catch {}
      throw err;
    }

    logger.info("MongoDB zone connected", zone, dbConfig.db);

    connection.removeAllListeners("error");
    connection.on("error", (error: Error) => {
      logger.error("MongoDB zone connection error:", zone, error.message);
    });
    connection.on("disconnected", () => {
      logger.warn("MongoDB zone disconnected, auto-reconnect", zone);
    });
    connection.on("reconnected", () => {
      logger.info("MongoDB zone reconnected", zone);
    });

    return callback(connection, zone);
  }
}
