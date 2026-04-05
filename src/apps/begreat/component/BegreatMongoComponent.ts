import * as net from "net";
import * as mongoose from "mongoose";
import { ComponentManager, EComName, IBaseComponent } from "../../../common/BaseComponent";
import { DBCfg } from "../../../common/CommonType";
import { gameLogger as logger } from "../../../util/logger";
import { buildMongoUrl } from "../../../util/mongo_url";
import { initializeBegreatModels, stopBegreatConnection } from "../dbservice/BegreatDBModel";

export class BegreatMongoComponent implements IBaseComponent {
  private static readonly CONN_OPTIONS: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: 8000,
    heartbeatFrequencyMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    retryReads: true,
    maxPoolSize: 10,
    minPoolSize: 0,
    family: 4,
  };

  init() {}

  async start() {
    const sysCfgComp = ComponentManager.instance.getComponent(EComName.SysCfgComponent);
    const dbCfg = sysCfgComp.db_global;
    if (!dbCfg) throw new Error("[Begreat] db_global not configured");

    await this.waitForTcp(dbCfg.host, dbCfg.port ?? 27017);
    await this.connectWithRetry(dbCfg);
  }

  async afterStart() {}

  async stop() {
    await stopBegreatConnection();
  }

  private async waitForTcp(host: string, port: number, maxAttempts = 20): Promise<void> {
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = new net.Socket();
          socket.setTimeout(3000);
          socket.connect(port, host, () => { socket.destroy(); resolve(); });
          socket.on("error", (err) => { socket.destroy(); reject(err); });
          socket.on("timeout", () => { socket.destroy(); reject(new Error("timeout")); });
        });
        logger.info(`[Begreat] MongoDB TCP reachable: ${host}:${port}`);
        return;
      } catch {
        if (i === maxAttempts) throw new Error(`[Begreat] MongoDB ${host}:${port} not reachable after ${maxAttempts} attempts`);
        const delay = Math.min(2000 * i, 15000);
        logger.warn(`[Begreat] Waiting for MongoDB, retry in ${delay}ms (${i}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private async connectWithRetry(dbCfg: DBCfg, baseDelayMs = 3000): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.connect(dbCfg);
        return;
      } catch (err) {
        const delay = Math.min(baseDelayMs * attempt, 30000);
        logger.warn(`[Begreat] MongoDB connect attempt ${attempt} failed: ${(err as Error).message} — retry in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private async connect(dbCfg: DBCfg): Promise<void> {
    const url = buildMongoUrl(dbCfg);
    const connection = mongoose.createConnection(url, BegreatMongoComponent.CONN_OPTIONS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (connection as any).$initialConnection?.catch(() => {});
    connection.on("error", () => {});

    try {
      await connection.asPromise();
    } catch (err) {
      connection.removeAllListeners();
      try { await connection.close(true); } catch {}
      throw err;
    }

    logger.info("[Begreat] MongoDB connected:", dbCfg.db);

    connection.removeAllListeners("error");
    connection.on("error",        (e: Error) => logger.error("[Begreat] MongoDB error:", e.message));
    connection.on("disconnected", ()         => logger.warn("[Begreat] MongoDB disconnected, auto-reconnect"));
    connection.on("reconnected",  ()         => logger.info("[Begreat] MongoDB reconnected"));

    initializeBegreatModels(connection);
  }
}
