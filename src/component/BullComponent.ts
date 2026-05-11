import Bull from 'bull';
import { Logger } from 'log4js';
import {
  ComponentManager,
  EComName,
  IBaseComponent,
} from '../common/BaseComponent';

export class BullComponent implements IBaseComponent {
  // Bull queue instance for managing jobs
  private queue: Bull.Queue;

  // Logger instance for logging messages
  private gameLogger: Logger | Console;

  constructor(
    queueName: string,
    options?: Bull.QueueOptions,
    gameLogger?: Logger
  ) {
    // Initialize the Bull queue with the given name and options
    this.queue = new Bull(queueName, options);

    // Use the provided logger or default to console
    this.gameLogger = gameLogger || console;
  }

  async sendMessage<TMessage, TResult>(
    message: TMessage,
  ): Promise<Bull.Job<TResult>> {
    const job = await this.queue.add(message);
    return job as Bull.Job<TResult>;
  }

  processMessages(
    concurrency: number,
    processor: Bull.ProcessCallbackFunction<unknown> | Bull.ProcessPromiseFunction<unknown>,
  ): void {
    this.queue.process(concurrency, processor as Bull.ProcessCallbackFunction<unknown>);
  }

  async getQueueMetrics(): Promise<{ active: number; completed: number; failed: number }> {
    const [active, completed, failed] = await Promise.all([
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);
    return { active, completed, failed };
  }

  // 关闭旧队列后再创建新队列，避免泄漏 Redis 连接
  async setQueueOptions(options: Bull.QueueOptions): Promise<void> {
    await this.queue.close();
    this.queue = new Bull(this.queue.name, options);
  }

  async init(): Promise<void> {}

  async start(): Promise<void> {}

  async afterStart(): Promise<void> {
    const sysCfgComp = ComponentManager.instance.getComponent(EComName.SysCfgComponent);
    const redisOptions = sysCfgComp.redis_global;
    if (!redisOptions) {
      throw new Error('BullComponent: redis_global config is missing');
    }
    await this.setQueueOptions({
      redis: { host: redisOptions.host, port: redisOptions.port, db: redisOptions.db },
    });
    this.gameLogger.log('Bull queue connected to Redis server');
  }

  async stop(): Promise<void> {
    this.gameLogger.log('Waiting for all message callbacks to complete...');
    await this.queue.close();
    this.gameLogger.log('Bull queue resources released.');
  }

  setMockqueue(mockQueue: Bull.Queue): void {
    this.queue = mockQueue;
  }
}
