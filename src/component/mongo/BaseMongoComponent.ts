import * as net from 'net';
import * as mongoose from 'mongoose';
import { DBCfg } from '../../common/CommonType';
import { gameLogger as logger } from '../../util/logger';
import { buildMongoUrl } from '../../util/mongo_url';

type ConnectionHooks<T> = {
  connectedLog: string;
  errorLog: string;
  disconnectedLog: string;
  reconnectedLog: string;
  onConnected: (connection: mongoose.Connection) => Promise<T> | T;
};

export abstract class BaseMongoComponent {
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

  init(): void {}

  async afterStart(): Promise<void> {}

  protected async waitForTcp(host: string, port: number, maxAttempts = 20): Promise<void> {
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = new net.Socket();
          socket.setTimeout(3000);
          socket.connect(port, host, () => {
            socket.destroy();
            resolve();
          });
          socket.on('error', (err) => {
            socket.destroy();
            reject(err);
          });
          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('timeout'));
          });
        });
        logger.info(`MongoDB TCP reachable: ${host}:${port}`);
        return;
      } catch {
        if (i === maxAttempts) {
          throw new Error(`MongoDB ${host}:${port} not reachable after ${maxAttempts} attempts`);
        }
        const delay = Math.min(2000 * i, 15000);
        logger.warn(`Waiting for MongoDB ${host}:${port}, retry in ${delay}ms (${i}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  protected async connectWithRetry<T>(
    connectFn: () => Promise<T>,
    baseDelayMs = 3000,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await connectFn();
      } catch (err) {
        const delayMs = Math.min(baseDelayMs * attempt, 30000);
        logger.warn(
          `MongoDB connection attempt ${attempt} failed: ${(err as Error).message} — retrying in ${delayMs}ms`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  protected async connectDb<T>(dbConfig: DBCfg, hooks: ConnectionHooks<T>): Promise<T> {
    const url = buildMongoUrl(dbConfig);
    const connection = mongoose.createConnection(url, BaseMongoComponent.CONN_OPTIONS);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (connection as any).$initialConnection?.catch(() => {});
    connection.on('error', () => {});

    try {
      await connection.asPromise();
    } catch (err) {
      connection.removeAllListeners();
      try {
        await connection.close(true);
      } catch {
        // Connection close may fail if already disconnected; safe to ignore
      }
      throw err;
    }

    logger.info(hooks.connectedLog, dbConfig.db);
    connection.removeAllListeners('error');
    connection.on('error', (error: Error) => logger.error(hooks.errorLog, error.message));
    connection.on('disconnected', () => logger.warn(hooks.disconnectedLog, dbConfig.db));
    connection.on('reconnected', () => logger.info(hooks.reconnectedLog, dbConfig.db));

    return hooks.onConnected(connection);
  }
}
