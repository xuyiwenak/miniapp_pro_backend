# BI Analytics - Middleware & Tracking

## 中间件和打点方案设计

### 1. 核心 BiAnalytics 类

```typescript
// src/util/BiAnalytics.ts
import { v4 as uuidv4 } from 'uuid';
import { MongoClient, Db, Collection } from 'mongodb';
import type { BiEvent, EventType, EventData, EventContext } from '../entity/BiEvent';
import { BiEventSchema } from '../entity/BiEventSchema';
import { gameLogger as logger } from './logger';

const SCHEMA_VERSION = 'v1';

export interface TrackOptions {
  eventType: EventType;
  data: EventData;
  context?: Partial<EventContext>;
}

/**
 * BI数据采集核心类
 * 提供事件追踪、上下文管理、批量发送等功能
 */
export class BiAnalytics {
  private static instance: BiAnalytics;
  private db: Db | null = null;
  private collection: Collection<BiEvent> | null = null;
  private eventQueue: BiEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000; // 5秒刷新一次

  // 全局上下文（从环境变量或配置读取）
  private globalContext: Partial<EventContext> = {
    appName: (process.env.APP_NAME as any) || 'art_backend',
    platform: 'api',
    appVersion: process.env.APP_VERSION || '1.0.0',
  };

  private constructor() {
    this.startFlushInterval();
  }

  static getInstance(): BiAnalytics {
    if (!BiAnalytics.instance) {
      BiAnalytics.instance = new BiAnalytics();
    }
    return BiAnalytics.instance;
  }

  /**
   * 初始化MongoDB连接
   */
  async initialize(db: Db): Promise<void> {
    this.db = db;
    this.collection = db.collection<BiEvent>('bi_events');
    logger.info('BiAnalytics initialized');
  }

  /**
   * 设置全局上下文（应用级别的公共字段）
   */
  setGlobalContext(context: Partial<EventContext>): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  /**
   * 追踪事件（主方法）
   */
  async track(options: TrackOptions): Promise<void> {
    try {
      const event = this.buildEvent(options);

      // 验证数据
      const validated = BiEventSchema.parse(event);

      // 加入队列
      this.eventQueue.push(validated as BiEvent);

      // 如果队列达到批量大小，立即刷新
      if (this.eventQueue.length >= this.BATCH_SIZE) {
        await this.flush();
      }
    } catch (error) {
      logger.error('BiAnalytics.track failed', {
        error: error instanceof Error ? error.message : String(error),
        eventType: options.eventType,
      });
      // 不抛出异常，避免影响业务逻辑
    }
  }

  /**
   * 构建事件对象
   */
  private buildEvent(options: TrackOptions): Partial<BiEvent> {
    const now = new Date();

    // 从请求上下文获取sessionId和requestId（如果有的话）
    const requestContext = this.getRequestContext();

    return {
      eventId: uuidv4(),
      eventType: options.eventType,
      timestamp: now,
      userId: options.context?.userId ?? requestContext.userId ?? null,
      sessionId: options.context?.sessionId ?? requestContext.sessionId ?? this.generateSessionId(),
      requestId: options.context?.requestId ?? requestContext.requestId ?? uuidv4(),
      appName: options.context?.appName ?? this.globalContext.appName!,
      platform: options.context?.platform ?? this.globalContext.platform!,
      appVersion: options.context?.appVersion ?? this.globalContext.appVersion!,
      ipAddress: options.context?.ipAddress ?? requestContext.ipAddress ?? '0.0.0.0',
      userAgent: options.context?.userAgent ?? requestContext.userAgent ?? 'Unknown',
      data: options.data,
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
    };
  }

  /**
   * 从AsyncLocalStorage获取请求上下文（如果使用了中间件）
   */
  private getRequestContext(): Partial<EventContext> {
    // 这里可以集成 AsyncLocalStorage 来传递请求上下文
    // 暂时返回空对象
    return {};
  }

  /**
   * 生成会话ID（简单实现，实际应该从cookie或token获取）
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * 刷新队列到数据库
   */
  private async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;
    if (!this.collection) {
      logger.warn('BiAnalytics: collection not initialized, events dropped', {
        count: this.eventQueue.length,
      });
      this.eventQueue = [];
      return;
    }

    const eventsToInsert = this.eventQueue.splice(0, this.BATCH_SIZE);

    try {
      await this.collection.insertMany(eventsToInsert, { ordered: false });
      logger.info('BiAnalytics: flushed events', { count: eventsToInsert.length });
    } catch (error) {
      logger.error('BiAnalytics: flush failed', {
        error: error instanceof Error ? error.message : String(error),
        count: eventsToInsert.length,
      });
      // 失败的事件写入文件日志作为备份
      eventsToInsert.forEach((event) => {
        logger.error('BiAnalytics: lost event', { event });
      });
    }
  }

  /**
   * 启动定时刷新
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      void this.flush();
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * 优雅关闭：刷新所有待发送事件
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
    logger.info('BiAnalytics shutdown complete');
  }

  /**
   * 静态方法：快捷追踪
   */
  static async track(options: TrackOptions): Promise<void> {
    return BiAnalytics.getInstance().track(options);
  }
}

// 优雅退出时刷新队列
process.on('SIGTERM', () => {
  void BiAnalytics.getInstance().shutdown();
});

process.on('SIGINT', () => {
  void BiAnalytics.getInstance().shutdown();
});
```

### 2. TypeScript 装饰器

```typescript
// src/common/BiDecorators.ts
import { BiAnalytics } from '../util/BiAnalytics';
import type { EventType, EventData } from '../entity/BiEvent';
import { gameLogger as logger } from '../util/logger';

export interface TrackEventOptions {
  /**
   * 从方法参数中提取上下文的函数
   */
  extractContext?: (args: any[]) => Record<string, any>;

  /**
   * 从方法返回值中提取额外数据的函数
   */
  extractResult?: (result: any) => Record<string, any>;

  /**
   * 是否记录错误（默认true）
   */
  trackErrors?: boolean;
}

/**
 * 装饰器：自动追踪方法执行
 *
 * @example
 * class UploadService {
 *   @TrackEvent('upload_file', {
 *     extractContext: (args) => ({ contentType: args[0].mimetype })
 *   })
 *   async uploadFile(file: Express.Multer.File): Promise<string> {
 *     // ... 上传逻辑
 *   }
 * }
 */
export function TrackEvent(eventType: EventType, options: TrackEventOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      let status: 'success' | 'failed' = 'success';
      let errorCode: string | undefined;
      let errorMessage: string | undefined;
      let result: any;

      try {
        // 执行原方法
        result = await originalMethod.apply(this, args);
        return result;
      } catch (error) {
        status = 'failed';
        errorCode = (error as any).code || 'UNKNOWN_ERROR';
        errorMessage = error instanceof Error ? error.message : String(error);
        throw error; // 继续抛出错误
      } finally {
        const durationMs = Date.now() - startTime;

        // 构建事件数据
        const contextData = options.extractContext?.(args) || {};
        const resultData = result && options.extractResult?.(result) || {};

        const data: Partial<EventData> = {
          ...contextData,
          ...resultData,
          durationMs,
          status,
          errorCode,
          errorMessage,
        };

        // 异步发送事件（不阻塞）
        void BiAnalytics.track({
          eventType,
          data: data as EventData,
        }).catch((err) => {
          logger.error('TrackEvent decorator failed', { error: err });
        });
      }
    };

    return descriptor;
  };
}

/**
 * 装饰器：追踪上传操作
 *
 * @example
 * class OssUploader {
 *   @TrackUpload()
 *   async upload(file: Buffer, contentType: string): Promise<string> {
 *     // ... 上传到OSS
 *   }
 * }
 */
export function TrackUpload(options: TrackEventOptions = {}) {
  return TrackEvent('upload_file', {
    extractContext: (args) => {
      const [file, contentType] = args;
      return {
        bytes: file?.length || file?.size || 0,
        contentType: contentType || file?.mimetype || 'unknown',
        width: file?.width,
        height: file?.height,
      };
    },
    ...options,
  });
}

/**
 * 装饰器：追踪AI分析操作
 *
 * @example
 * class QwenAnalyzer {
 *   @TrackAiAnalysis('qwen-vl-plus')
 *   async analyze(imageUrl: string): Promise<AnalysisResult> {
 *     // ... AI分析
 *   }
 * }
 */
export function TrackAiAnalysis(model: string, options: TrackEventOptions = {}) {
  return TrackEvent('qwen_analyze', {
    extractResult: (result) => {
      return {
        promptTokens: result?.usage?.prompt_tokens || 0,
        completionTokens: result?.usage?.completion_tokens || 0,
        totalTokens: result?.usage?.total_tokens || 0,
        model,
        cost: calculateCost(result?.usage?.total_tokens || 0, model),
      };
    },
    ...options,
  });
}

/**
 * 计算AI调用成本（根据token数量和模型）
 */
function calculateCost(tokens: number, model: string): number {
  const PRICING: Record<string, number> = {
    'qwen-vl-plus': 0.008 / 1000, // $0.008 per 1K tokens
    'qwen-vl-max': 0.02 / 1000,   // $0.02 per 1K tokens
  };

  const pricePerToken = PRICING[model] || 0.01 / 1000;
  return tokens * pricePerToken;
}
```

### 3. Express 中间件

```typescript
// src/util/biMiddleware.ts
import type { Request, Response, NextFunction } from 'express';
import { BiAnalytics } from './BiAnalytics';
import { EVENT_TYPES } from '../entity/BiEvent';

/**
 * IP地址匿名化（GDPR合规）
 */
function anonymizeIp(ip: string): string {
  if (ip.includes('.')) {
    // IPv4: 192.168.1.123 -> 192.168.1.0
    const parts = ip.split('.');
    parts[3] = '0';
    return parts.join('.');
  } else if (ip.includes(':')) {
    // IPv6: 截断后80位
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':') + '::0';
  }
  return '0.0.0.0';
}

/**
 * 从请求中提取用户ID（从JWT token或session）
 */
function extractUserId(req: Request): string | null {
  // 从JWT token中提取
  const user = (req as any).user;
  if (user?.uid) return user.uid;
  if (user?.id) return user.id;

  // 从session中提取
  const session = (req as any).session;
  if (session?.userId) return session.userId;

  return null;
}

/**
 * 生成或获取sessionId
 */
function getSessionId(req: Request): string {
  // 从cookie中获取
  const sessionId = req.cookies?.sessionId;
  if (sessionId) return sessionId;

  // 从header中获取
  const headerSessionId = req.headers['x-session-id'] as string;
  if (headerSessionId) return headerSessionId;

  // 生成新的sessionId
  return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Express中间件：自动追踪API请求
 *
 * @example
 * app.use('/api', trackApiRequest());
 */
export function trackApiRequest(options: {
  /**
   * 忽略的路径（正则表达式数组）
   */
  ignorePaths?: RegExp[];

  /**
   * 是否追踪请求体大小（默认true）
   */
  trackRequestSize?: boolean;

  /**
   * 是否追踪响应体大小（默认true）
   */
  trackResponseSize?: boolean;
} = {}) {
  const {
    ignorePaths = [/\/health$/, /\/ping$/],
    trackRequestSize = true,
    trackResponseSize = true,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // 检查是否忽略此路径
    const shouldIgnore = ignorePaths.some((pattern) => pattern.test(req.path));
    if (shouldIgnore) {
      return next();
    }

    const startTime = Date.now();

    // 保存原始的res.json和res.send方法
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    let responseSize = 0;

    // 重写res.json
    res.json = function (body: any) {
      if (trackResponseSize) {
        responseSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
      }
      return originalJson(body);
    };

    // 重写res.send
    res.send = function (body: any) {
      if (trackResponseSize && body) {
        responseSize = Buffer.byteLength(String(body), 'utf8');
      }
      return originalSend(body);
    };

    // 响应完成时记录事件
    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const requestSize = trackRequestSize
        ? parseInt(req.headers['content-length'] || '0', 10)
        : 0;

      const status = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failed';
      const errorCode = status === 'failed' ? `HTTP_${res.statusCode}` : undefined;

      void BiAnalytics.track({
        eventType: EVENT_TYPES.API_REQUEST,
        data: {
          endpoint: req.path,
          method: req.method,
          statusCode: res.statusCode,
          durationMs,
          requestSize,
          responseSize,
          status,
          errorCode,
          errorMessage: status === 'failed' ? res.statusMessage : undefined,
        },
        context: {
          userId: extractUserId(req),
          sessionId: getSessionId(req),
          requestId: req.headers['x-request-id'] as string || undefined,
          ipAddress: anonymizeIp(req.ip || req.socket.remoteAddress || '0.0.0.0'),
          userAgent: req.headers['user-agent'] || 'Unknown',
        },
      }).catch((err) => {
        console.error('trackApiRequest middleware failed:', err);
      });
    });

    next();
  };
}
```

### 4. 集成到现有代码

#### 4.1 集成到上传接口

```typescript
// src/apps/upload/uploadHandler.ts (示例)
import { BiAnalytics } from '../../util/BiAnalytics';
import { EVENT_TYPES } from '../../entity/BiEvent';
import type { Request, Response } from 'express';

export async function handleUpload(req: Request, res: Response) {
  const startTime = Date.now();
  const file = req.file; // multer上传的文件

  if (!file) {
    return res.status(400).json({ code: 400, message: 'No file uploaded' });
  }

  try {
    // 1. 压缩图片
    const compressed = await compressImage(file.buffer);

    // 2. 上传到OSS
    const url = await uploadToOss(compressed, file.mimetype);

    // 3. 获取图片尺寸
    const { width, height } = await getImageDimensions(compressed);

    const durationMs = Date.now() - startTime;

    // 4. 记录BI事件
    await BiAnalytics.track({
      eventType: EVENT_TYPES.UPLOAD_FILE,
      data: {
        bytes: compressed.length,
        contentType: file.mimetype,
        width,
        height,
        durationMs,
        status: 'success',
      },
      context: {
        userId: (req as any).user?.uid || null,
      },
    });

    return res.json({
      code: 200,
      data: { url },
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // 记录失败事件
    await BiAnalytics.track({
      eventType: EVENT_TYPES.UPLOAD_FILE,
      data: {
        bytes: file.size,
        contentType: file.mimetype,
        durationMs,
        status: 'failed',
        errorCode: (error as any).code || 'UPLOAD_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      context: {
        userId: (req as any).user?.uid || null,
      },
    });

    return res.status(500).json({
      code: 500,
      message: 'Upload failed',
    });
  }
}
```

#### 4.2 集成到Qwen分析

修改现有的 `qwenVlAnalyzer.ts`:

```typescript
// src/util/qwenVlAnalyzer.ts (修改部分)
import { BiAnalytics } from './BiAnalytics';
import { EVENT_TYPES } from '../entity/BiEvent';

// 在parseAnalyzeResponse函数中添加BI打点
function parseAnalyzeResponse(rawBody: string, durationMs: number, imageUrl: string): string {
  let resp: DashScopeResponse;
  try {
    resp = JSON.parse(rawBody) as DashScopeResponse;
  } catch (e) {
    logger.error('QwenVL response JSON parse failed');

    // 记录失败事件
    void BiAnalytics.track({
      eventType: EVENT_TYPES.QWEN_ANALYZE,
      data: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        model: DEFAULT_MODEL,
        cost: 0,
        durationMs,
        imageUrl,
        status: 'failed',
        errorCode: 'JSON_PARSE_ERROR',
        errorMessage: 'Failed to parse Qwen response',
      },
    });

    throw e;
  }

  if (resp.error) {
    // 记录失败事件
    void BiAnalytics.track({
      eventType: EVENT_TYPES.QWEN_ANALYZE,
      data: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        model: DEFAULT_MODEL,
        cost: 0,
        durationMs,
        imageUrl,
        status: 'failed',
        errorCode: resp.error.code || 'QWEN_API_ERROR',
        errorMessage: resp.error.message || 'Unknown error',
      },
    });

    throw new Error(`QwenVL API error: ${resp.error.code} ${resp.error.message}`);
  }

  const content = resp.choices?.[0]?.message?.content;
  if (!content) {
    void BiAnalytics.track({
      eventType: EVENT_TYPES.QWEN_ANALYZE,
      data: {
        promptTokens: resp.usage?.prompt_tokens || 0,
        completionTokens: resp.usage?.completion_tokens || 0,
        totalTokens: resp.usage?.total_tokens || 0,
        model: DEFAULT_MODEL,
        cost: calculateQwenCost(resp.usage?.total_tokens || 0),
        durationMs,
        imageUrl,
        status: 'failed',
        errorCode: 'EMPTY_CONTENT',
        errorMessage: 'QwenVL returned empty content',
      },
    });

    throw new Error('QwenVL returned empty content');
  }

  // 记录成功事件
  const totalTokens = resp.usage?.total_tokens || 0;
  void BiAnalytics.track({
    eventType: EVENT_TYPES.QWEN_ANALYZE,
    data: {
      promptTokens: resp.usage?.prompt_tokens || 0,
      completionTokens: resp.usage?.completion_tokens || 0,
      totalTokens,
      model: DEFAULT_MODEL,
      cost: calculateQwenCost(totalTokens),
      durationMs,
      imageUrl,
      status: 'success',
    },
  });

  logger.info('QwenVL analyze success', {
    promptTokens: resp.usage?.prompt_tokens,
    completionTokens: resp.usage?.completion_tokens,
    totalTokens,
    durationMs,
  });

  const jsonStr = extractJson(content);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return jsonStr;
  }

  if (parsed.error === NOT_ARTWORK_ERROR_CODE) {
    throw new NotArtworkError(String(parsed.reason ?? ''));
  }

  return jsonStr;
}

// 新增：计算Qwen调用成本
function calculateQwenCost(totalTokens: number): number {
  // qwen-vl-plus: ¥0.008/1K tokens ≈ $0.0011/1K tokens
  const PRICE_PER_1K_TOKENS = 0.008 / 1000;
  return totalTokens * PRICE_PER_1K_TOKENS;
}

// 修改analyzeArtwork函数签名，传入imageUrl
export async function analyzeArtwork(
  imageUrl: string,
  desc: string,
  tags: string,
  workId?: string,
): Promise<string> {
  const cfg = getQwenVlConfig();
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  logger.info('QwenVL analyze start', { model: cfg.model ?? DEFAULT_MODEL });

  const requestStartAt = Date.now();
  const postData = buildAnalyzePostData(cfg, imageUrl, desc, tags);
  const fullUrl = new URL(`${baseUrl}/chat/completions`);
  const rawBody = await sendQwenVlRequest(cfg, postData, fullUrl);
  const durationMs = Date.now() - requestStartAt;

  return parseAnalyzeResponse(rawBody, durationMs, imageUrl);
}
```

### 5. 初始化和配置

```typescript
// src/index.ts (应用启动文件)
import { MongoClient } from 'mongodb';
import { BiAnalytics } from './util/BiAnalytics';
import { trackApiRequest } from './util/biMiddleware';
import express from 'express';

async function bootstrap() {
  const app = express();

  // 1. 连接MongoDB
  const mongoClient = new MongoClient(process.env.MONGO_URL!);
  await mongoClient.connect();
  const db = mongoClient.db(process.env.DB_NAME!);

  // 2. 初始化BiAnalytics
  await BiAnalytics.getInstance().initialize(db);
  BiAnalytics.getInstance().setGlobalContext({
    appName: 'art_backend',
    platform: 'api',
    appVersion: '1.0.0',
  });

  // 3. 应用中间件（在所有路由之前）
  app.use(express.json());
  app.use(trackApiRequest({
    ignorePaths: [/\/health$/, /\/metrics$/],
  }));

  // 4. 注册路由
  // ...

  // 5. 启动服务器
  app.listen(3000, () => {
    console.log('Server started on port 3000');
  });

  // 6. 优雅关闭
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await BiAnalytics.getInstance().shutdown();
    await mongoClient.close();
    process.exit(0);
  });
}

bootstrap().catch(console.error);
```

### 6. 使用示例总结

```typescript
// 方式1：使用装饰器（推荐）
class MyService {
  @TrackEvent('upload_file', {
    extractContext: (args) => ({ contentType: args[0].mimetype }),
  })
  async uploadFile(file: File): Promise<string> {
    // ... 上传逻辑
  }

  @TrackAiAnalysis('qwen-vl-plus')
  async analyzeImage(imageUrl: string): Promise<any> {
    // ... AI分析逻辑
  }
}

// 方式2：手动调用（灵活）
await BiAnalytics.track({
  eventType: EVENT_TYPES.UPLOAD_FILE,
  data: {
    bytes: 1024000,
    contentType: 'image/jpeg',
    width: 1920,
    height: 1080,
    durationMs: 234,
    status: 'success',
  },
});

// 方式3：Express中间件（自动）
app.use('/api', trackApiRequest());
```

## 下一步

1. 实现聚合查询API（见下一节）
2. 创建定时任务执行小时/天聚合
3. 开发Dashboard可视化界面
4. 配置Prometheus监控指标
