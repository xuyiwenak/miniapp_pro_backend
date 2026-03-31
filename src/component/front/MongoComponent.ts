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

  async start() {
    const sysCfgComp = ComponentManager.instance.getComponent(
      EComName.SysCfgComponent
    );
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
  initDbConnection(dbConfig: DBCfg, callback: Function): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = buildMongoUrl(dbConfig);
      const connection = mongoose.createConnection(url, MongoComponent.CONN_OPTIONS);

      connection.on("connected", () => {
        const result = callback(connection);
        resolve(result);
        logger.info("MongoDB connected", dbConfig.db);
      });

      connection.on("error", (error: Error) => {
        logger.error("MongoDB connection error:", error.message);
        reject(error);
      });

      connection.on("disconnected", () => {
        logger.warn("MongoDB disconnected, mongoose will auto-reconnect", dbConfig.db);
      });

      connection.on("reconnected", () => {
        logger.info("MongoDB reconnected", dbConfig.db);
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-explicit-any
  initDbZoneConnection(
    dbConfig: DBCfg,
    zone: string,
    callback: Function
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = buildMongoUrl(dbConfig);
      const connection = mongoose.createConnection(url, MongoComponent.CONN_OPTIONS);

      connection.on("connected", () => {
        const result = callback(connection, zone);
        resolve(result);
        logger.info("MongoDB zone connected", zone, dbConfig.db);
      });

      connection.on("error", (error: Error) => {
        logger.error("MongoDB zone connection error:", zone, error.message);
        reject(error);
      });

      connection.on("disconnected", () => {
        logger.warn("MongoDB zone disconnected, auto-reconnect", zone);
      });

      connection.on("reconnected", () => {
        logger.info("MongoDB zone reconnected", zone);
      });
    });
  }
}
