import { v4 as uuidv4 } from 'uuid';
import { IBaseComponent } from '../common/BaseComponent';
import {
  type IBiEvent,
  type EventType,
  type Platform,
  type AppName,
  type IEventContext,
  type EventData,
  type IUploadFileData,
  type IQwenAnalyzeData,
  type IApiRequestData,
  type IClientEventData,
} from '../entity/biEvent.entity';
import { getBiModelManager } from '../dbservice/model/BiDBModel';
import { gameLogger } from '../util/logger';

// 追踪配置选项
export interface IBiAnalyticsConfig {
  enabled: boolean;
  appName: AppName;
  appVersion: string;
  platform: Platform;
}

// 事件追踪参数
export interface ITrackEventParams {
  eventType: EventType;
  data: EventData;
  context?: Partial<IEventContext>;
}

/**
 * BI 分析组件
 * 实现 OpenSpec: art_backend/openspec/specs/bi-analytics/spec.md
 *
 * 功能：
 * 1. 异步收集事件数据（不阻塞主线程）
 * 2. 提供文件上传、Qwen AI 分析、API 请求追踪
 * 3. 自动记录上下文信息（userId, sessionId, timestamp）
 */
export class BiAnalyticsComponent implements IBaseComponent {
  private config!: IBiAnalyticsConfig;
  private eventQueue: ITrackEventParams[] = [];
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout;

  private readonly BATCH_SIZE = 100; // 批量插入大小
  private readonly PROCESSING_INTERVAL_MS = 5000; // 5秒处理一次队列

  init(config: IBiAnalyticsConfig) {
    this.config = {
      enabled: config.enabled ?? true,
      appName: config.appName,
      appVersion: config.appVersion,
      platform: config.platform,
    };

    gameLogger.info('BiAnalyticsComponent initialized', {
      appName: this.config.appName,
      enabled: this.config.enabled,
    });
  }

  async start() {
    if (!this.config.enabled) {
      gameLogger.info('BiAnalyticsComponent disabled');
      return;
    }

    // 启动定时处理队列
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.PROCESSING_INTERVAL_MS);

    gameLogger.info('BiAnalyticsComponent started');
  }

  async afterStart() {
    // 不依赖其他组件
  }

  async stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    // 处理剩余队列
    await this.processQueue();

    gameLogger.info('BiAnalyticsComponent stopped');
  }

  /**
   * 追踪事件（异步，不阻塞）
   * @param params 事件参数
   */
  track(params: ITrackEventParams): void {
    if (!this.config.enabled) {
      return;
    }

    try {
      this.eventQueue.push(params);

      // 如果队列过大，立即处理
      if (this.eventQueue.length >= this.BATCH_SIZE) {
        this.processQueue();
      }
    } catch (error) {
      gameLogger.error('Failed to enqueue event', {
        error: error instanceof Error ? error.message : String(error),
        eventType: params.eventType,
      });
    }
  }

  /**
   * 追踪文件上传事件
   */
  trackUploadFile(data: IUploadFileData, context?: Partial<IEventContext>): void {
    this.track({
      eventType: 'upload_file',
      data,
      context,
    });
  }

  /**
   * 追踪 Qwen AI 分析事件
   */
  trackQwenAnalyze(data: IQwenAnalyzeData, context?: Partial<IEventContext>): void {
    this.track({
      eventType: 'qwen_analyze',
      data,
      context,
    });
  }

  /**
   * 追踪 API 请求事件
   */
  trackApiRequest(data: IApiRequestData, context?: Partial<IEventContext>): void {
    this.track({
      eventType: 'api_request',
      data,
      context,
    });
  }

  /**
   * 追踪客户端事件（前端 SDK 发送）
   */
  trackClientEvent(data: IClientEventData, context?: Partial<IEventContext>): void {
    this.track({
      eventType: 'client_event',
      data,
      context,
    });
  }

  /**
   * 批量处理事件队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const batch = this.eventQueue.splice(0, this.BATCH_SIZE);
      const events = batch.map((params) => this.buildEvent(params));

      await getBiModelManager().getBiEventModel().insertMany(events, { ordered: false });

      gameLogger.debug('BiAnalytics events inserted', {
        count: events.length,
      });
    } catch (error) {
      gameLogger.error('Failed to process event queue', {
        error: error instanceof Error ? error.message : String(error),
        queueSize: this.eventQueue.length,
      });

      // 失败时不丢弃事件，下次继续处理
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 构建事件对象
   */
  private buildEvent(params: ITrackEventParams): Omit<IBiEvent, '_id'> {
    const now = new Date();

    return {
      eventId: uuidv4(),
      eventType: params.eventType,
      timestamp: now,
      userId: params.context?.userId ?? null,
      sessionId: params.context?.sessionId ?? this.generateSessionId(),
      requestId: params.context?.requestId ?? uuidv4(),
      appName: params.context?.appName ?? this.config.appName,
      platform: params.context?.platform ?? this.config.platform,
      appVersion: params.context?.appVersion ?? this.config.appVersion,
      ipAddress: params.context?.ipAddress ?? '0.0.0.0',
      userAgent: params.context?.userAgent ?? 'unknown',
      data: params.data,
      createdAt: now,
      schemaVersion: 'v1',
    };
  }

  /**
   * 生成会话 ID（简单实现，实际应从 Redis 或 JWT 获取）
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 匿名化 IP 地址（GDPR 合规）
   * @param ip 原始 IP 地址
   * @returns 匿名化后的 IP 地址
   */
  static anonymizeIp(ip: string): string {
    // IPv4: 192.168.1.123 -> 192.168.1.0
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        parts[3] = '0';
        return parts.join('.');
      }
    }

    // IPv6: 简化处理，保留前 48 位
    if (ip.includes(':')) {
      const parts = ip.split(':');
      if (parts.length >= 3) {
        return parts.slice(0, 3).join(':') + '::0';
      }
    }

    return ip;
  }
}
