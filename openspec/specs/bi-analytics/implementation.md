# BI Analytics - Implementation Guide

## MongoDB 数据模型设计

### 1. Collection: `bi_events` (原始事件表)

#### TypeScript 类型定义

```typescript
// src/entity/BiEvent.ts
import { ObjectId } from 'mongodb';

export const EVENT_TYPES = {
  UPLOAD_FILE: 'upload_file',
  QWEN_ANALYZE: 'qwen_analyze',
  API_REQUEST: 'api_request',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

export const APP_NAMES = {
  MANDIS: 'mandis',
  BEGREAT: 'begreat',
  ART_WEB: 'art_web',
  ART_BACKEND: 'art_backend',
} as const;

export type AppName = typeof APP_NAMES[keyof typeof APP_NAMES];

export const PLATFORMS = {
  MINIPROGRAM: 'miniprogram',
  WEB: 'web',
  API: 'api',
} as const;

export type Platform = typeof PLATFORMS[keyof typeof PLATFORMS];

export interface EventContext {
  userId: string | null;
  sessionId: string;
  requestId: string;
  appName: AppName;
  platform: Platform;
  appVersion: string;
  ipAddress: string;
  userAgent: string;
}

export interface UploadFileData {
  bytes: number;
  contentType: string;
  width?: number;
  height?: number;
  durationMs: number;
  status: 'success' | 'failed';
  errorCode?: string;
  errorMessage?: string;
}

export interface QwenAnalyzeData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  cost: number;
  durationMs: number;
  workId?: string;
  imageUrl?: string;
  status: 'success' | 'failed';
  errorCode?: string;
  errorMessage?: string;
}

export interface ApiRequestData {
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestSize: number;
  responseSize: number;
  status: 'success' | 'failed';
  errorCode?: string;
  errorMessage?: string;
}

export type EventData = UploadFileData | QwenAnalyzeData | ApiRequestData;

export interface BiEvent {
  _id: ObjectId;
  eventId: string;
  eventType: EventType;
  timestamp: Date;

  // Context
  userId: string | null;
  sessionId: string;
  requestId: string;
  appName: AppName;
  platform: Platform;
  appVersion: string;
  ipAddress: string;
  userAgent: string;

  // Event-specific data
  data: EventData;

  // Metadata
  schemaVersion: string;
  createdAt: Date;
}
```

#### Zod Schema 验证

```typescript
// src/entity/BiEventSchema.ts
import { z } from 'zod';
import { EVENT_TYPES, APP_NAMES, PLATFORMS } from './BiEvent';

export const EventContextSchema = z.object({
  userId: z.string().nullable(),
  sessionId: z.string().min(1).max(64),
  requestId: z.string().min(1).max(64),
  appName: z.enum([APP_NAMES.MANDIS, APP_NAMES.BEGREAT, APP_NAMES.ART_WEB, APP_NAMES.ART_BACKEND]),
  platform: z.enum([PLATFORMS.MINIPROGRAM, PLATFORMS.WEB, PLATFORMS.API]),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+$/), // semver
  ipAddress: z.string().ip(),
  userAgent: z.string().max(512),
});

export const UploadFileDataSchema = z.object({
  bytes: z.number().int().min(0).max(100 * 1024 * 1024), // max 100MB
  contentType: z.string().min(1).max(128),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  durationMs: z.number().int().min(0).max(300000), // max 5 minutes
  status: z.enum(['success', 'failed']),
  errorCode: z.string().max(64).optional(),
  errorMessage: z.string().max(1024).optional(),
});

export const QwenAnalyzeDataSchema = z.object({
  promptTokens: z.number().int().min(0).max(100000),
  completionTokens: z.number().int().min(0).max(100000),
  totalTokens: z.number().int().min(0).max(200000),
  model: z.string().min(1).max(64),
  cost: z.number().min(0).max(1000), // max $1000 per request
  durationMs: z.number().int().min(0).max(600000), // max 10 minutes
  workId: z.string().optional(),
  imageUrl: z.string().url().max(2048).optional(),
  status: z.enum(['success', 'failed']),
  errorCode: z.string().max(64).optional(),
  errorMessage: z.string().max(1024).optional(),
});

export const ApiRequestDataSchema = z.object({
  endpoint: z.string().min(1).max(256),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  statusCode: z.number().int().min(100).max(599),
  durationMs: z.number().int().min(0).max(300000),
  requestSize: z.number().int().min(0).max(10 * 1024 * 1024), // max 10MB
  responseSize: z.number().int().min(0).max(10 * 1024 * 1024),
  status: z.enum(['success', 'failed']),
  errorCode: z.string().max(64).optional(),
  errorMessage: z.string().max(1024).optional(),
});

export const BiEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum([EVENT_TYPES.UPLOAD_FILE, EVENT_TYPES.QWEN_ANALYZE, EVENT_TYPES.API_REQUEST]),
  timestamp: z.date(),
  userId: z.string().nullable(),
  sessionId: z.string().min(1).max(64),
  requestId: z.string().min(1).max(64),
  appName: z.enum([APP_NAMES.MANDIS, APP_NAMES.BEGREAT, APP_NAMES.ART_WEB, APP_NAMES.ART_BACKEND]),
  platform: z.enum([PLATFORMS.MINIPROGRAM, PLATFORMS.WEB, PLATFORMS.API]),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  ipAddress: z.string().ip(),
  userAgent: z.string().max(512),
  data: z.union([UploadFileDataSchema, QwenAnalyzeDataSchema, ApiRequestDataSchema]),
  schemaVersion: z.string().default('v1'),
  createdAt: z.date().default(() => new Date()),
});
```

#### MongoDB 索引创建脚本

```typescript
// scripts/createBiIndexes.ts
import { MongoClient } from 'mongodb';

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'art_backend';

async function createBiEventIndexes() {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection('bi_events');

    console.log('Creating indexes for bi_events...');

    // 时间索引（最常用，按时间倒序查询）
    await collection.createIndex(
      { timestamp: -1 },
      { name: 'idx_timestamp', background: true }
    );

    // 事件类型 + 时间索引
    await collection.createIndex(
      { eventType: 1, timestamp: -1 },
      { name: 'idx_eventType_timestamp', background: true }
    );

    // 用户 + 时间索引
    await collection.createIndex(
      { userId: 1, timestamp: -1 },
      { name: 'idx_userId_timestamp', background: true }
    );

    // 应用 + 时间索引
    await collection.createIndex(
      { appName: 1, timestamp: -1 },
      { name: 'idx_appName_timestamp', background: true }
    );

    // 状态 + 时间索引（用于错误分析）
    await collection.createIndex(
      { 'data.status': 1, timestamp: -1 },
      { name: 'idx_status_timestamp', background: true }
    );

    // 会话 + 时间索引（用于会话分析）
    await collection.createIndex(
      { sessionId: 1, timestamp: -1 },
      { name: 'idx_sessionId_timestamp', background: true }
    );

    // 事件ID唯一索引（防重）
    await collection.createIndex(
      { eventId: 1 },
      { name: 'idx_eventId', unique: true, background: true }
    );

    // TTL索引（90天自动删除）
    await collection.createIndex(
      { createdAt: 1 },
      { name: 'idx_createdAt_ttl', expireAfterSeconds: 7776000, background: true }
    );

    // 复合索引：应用 + 事件类型 + 时间（用于聚合查询）
    await collection.createIndex(
      { appName: 1, eventType: 1, timestamp: -1 },
      { name: 'idx_app_event_time', background: true }
    );

    console.log('✅ All indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    throw error;
  } finally {
    await client.close();
  }
}

createBiEventIndexes().catch(console.error);
```

### 2. Collection: `bi_metrics_hourly` (小时聚合表)

#### TypeScript 类型定义

```typescript
// src/entity/BiMetrics.ts
import { ObjectId } from 'mongodb';
import type { AppName, EventType } from './BiEvent';

export interface UploadMetrics {
  totalBytes: number;
  avgBytes: number;
  totalImages: number;
  contentTypes: Record<string, number>;
}

export interface QwenMetrics {
  totalTokens: number;
  totalCost: number;
  avgTokensPerRequest: number;
  models: Record<string, number>;
}

export interface ApiMetrics {
  endpoints: Record<string, number>;
  statusCodes: Record<string, number>;
  totalRequestBytes: number;
  totalResponseBytes: number;
}

export interface BiMetricsHourly {
  _id: ObjectId;
  periodStart: Date;
  periodEnd: Date;
  appName: AppName;
  eventType: EventType;

  // Counts
  totalEvents: number;
  successCount: number;
  failedCount: number;
  uniqueUsers: number;
  uniqueSessions: number;

  // Performance metrics (in milliseconds)
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  maxDurationMs: number;

  // Event-specific metrics
  upload?: UploadMetrics;
  qwen?: QwenMetrics;
  api?: ApiMetrics;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface BiMetricsDaily extends Omit<BiMetricsHourly, '_id'> {
  _id: ObjectId;
}
```

#### 聚合查询示例

```typescript
// src/component/BiAnalyticsComponent.ts
import { MongoClient, Db, Collection } from 'mongodb';
import type { BiEvent, BiMetricsHourly } from '../entity/BiEvent';

export class BiAnalyticsComponent {
  private db: Db;
  private eventsCollection: Collection<BiEvent>;
  private hourlyMetricsCollection: Collection<BiMetricsHourly>;

  /**
   * 小时级别聚合：计算某一小时的指标
   */
  async aggregateHourlyMetrics(
    appName: string,
    eventType: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const pipeline = [
      // 1. 过滤时间范围和类型
      {
        $match: {
          appName,
          eventType,
          timestamp: { $gte: periodStart, $lt: periodEnd },
        },
      },

      // 2. 分组计算基础指标
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$data.status', 'success'] }, 1, 0] },
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$data.status', 'failed'] }, 1, 0] },
          },
          uniqueUsers: { $addToSet: '$userId' },
          uniqueSessions: { $addToSet: '$sessionId' },

          // 收集所有duration用于计算分位数
          durations: { $push: '$data.durationMs' },

          // 上传相关指标
          uploadBytes: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'upload_file'] },
                '$data.bytes',
                '$$REMOVE',
              ],
            },
          },
          uploadContentTypes: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'upload_file'] },
                '$data.contentType',
                '$$REMOVE',
              ],
            },
          },

          // Qwen相关指标
          qwenTokens: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'qwen_analyze'] },
                '$data.totalTokens',
                '$$REMOVE',
              ],
            },
          },
          qwenCosts: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'qwen_analyze'] },
                '$data.cost',
                '$$REMOVE',
              ],
            },
          },
          qwenModels: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'qwen_analyze'] },
                '$data.model',
                '$$REMOVE',
              ],
            },
          },

          // API相关指标
          apiEndpoints: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'api_request'] },
                '$data.endpoint',
                '$$REMOVE',
              ],
            },
          },
          apiStatusCodes: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'api_request'] },
                { $toString: '$data.statusCode' },
                '$$REMOVE',
              ],
            },
          },
          apiRequestBytes: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'api_request'] },
                '$data.requestSize',
                '$$REMOVE',
              ],
            },
          },
          apiResponseBytes: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'api_request'] },
                '$data.responseSize',
                '$$REMOVE',
              ],
            },
          },
        },
      },

      // 3. 计算派生指标
      {
        $project: {
          _id: 0,
          periodStart: { $literal: periodStart },
          periodEnd: { $literal: periodEnd },
          appName: { $literal: appName },
          eventType: { $literal: eventType },

          totalEvents: 1,
          successCount: 1,
          failedCount: 1,
          uniqueUsers: { $size: '$uniqueUsers' },
          uniqueSessions: { $size: '$uniqueSessions' },

          // 性能指标（需要在应用层计算分位数，这里只计算平均值和最大值）
          avgDurationMs: { $avg: '$durations' },
          maxDurationMs: { $max: '$durations' },

          // 上传指标
          upload: {
            $cond: [
              { $eq: [eventType, 'upload_file'] },
              {
                totalBytes: { $sum: '$uploadBytes' },
                avgBytes: { $avg: '$uploadBytes' },
                totalImages: { $size: '$uploadBytes' },
                // contentTypes需要在应用层分组
              },
              '$$REMOVE',
            ],
          },

          // Qwen指标
          qwen: {
            $cond: [
              { $eq: [eventType, 'qwen_analyze'] },
              {
                totalTokens: { $sum: '$qwenTokens' },
                totalCost: { $sum: '$qwenCosts' },
                avgTokensPerRequest: { $avg: '$qwenTokens' },
                // models需要在应用层分组
              },
              '$$REMOVE',
            ],
          },

          // API指标
          api: {
            $cond: [
              { $eq: [eventType, 'api_request'] },
              {
                totalRequestBytes: { $sum: '$apiRequestBytes' },
                totalResponseBytes: { $sum: '$apiResponseBytes' },
                // endpoints和statusCodes需要在应用层分组
              },
              '$$REMOVE',
            ],
          },

          createdAt: { $literal: new Date() },
          updatedAt: { $literal: new Date() },
        },
      },

      // 4. 合并到hourly metrics表（upsert）
      {
        $merge: {
          into: 'bi_metrics_hourly',
          on: ['appName', 'eventType', 'periodStart'],
          whenMatched: 'replace',
          whenNotMatched: 'insert',
        },
      },
    ];

    await this.eventsCollection.aggregate(pipeline).toArray();
  }

  /**
   * 计算分位数（需要在内存中处理，MongoDB聚合不支持）
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * 查询指标：按时间范围和条件
   */
  async queryMetrics(
    startTime: Date,
    endTime: Date,
    granularity: 'hourly' | 'daily',
    appName?: string,
    eventType?: string,
  ): Promise<BiMetricsHourly[]> {
    const collection =
      granularity === 'hourly'
        ? this.hourlyMetricsCollection
        : this.db.collection<BiMetricsDaily>('bi_metrics_daily');

    const query: any = {
      periodStart: { $gte: startTime, $lt: endTime },
    };

    if (appName) query.appName = appName;
    if (eventType) query.eventType = eventType;

    return collection.find(query).sort({ periodStart: 1 }).toArray();
  }

  /**
   * 查询错误分析：按错误码分组
   */
  async queryErrorAnalysis(
    startTime: Date,
    endTime: Date,
    appName?: string,
  ): Promise<Array<{ errorCode: string; count: number; rate: number }>> {
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startTime, $lt: endTime },
          'data.status': 'failed',
          ...(appName && { appName }),
        },
      },
      {
        $group: {
          _id: '$data.errorCode',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 20, // Top 20错误
      },
    ];

    const results = await this.eventsCollection.aggregate(pipeline).toArray();
    const totalEvents = await this.eventsCollection.countDocuments({
      timestamp: { $gte: startTime, $lt: endTime },
      ...(appName && { appName }),
    });

    return results.map((r) => ({
      errorCode: r._id,
      count: r.count,
      rate: totalEvents > 0 ? r.count / totalEvents : 0,
    }));
  }

  /**
   * 查询成本分析：Qwen token使用和费用
   */
  async queryCostAnalysis(
    startTime: Date,
    endTime: Date,
    appName?: string,
  ): Promise<{
    totalCost: number;
    totalTokens: number;
    breakdown: Array<{ model: string; tokens: number; cost: number; requests: number }>;
  }> {
    const pipeline = [
      {
        $match: {
          eventType: 'qwen_analyze',
          timestamp: { $gte: startTime, $lt: endTime },
          ...(appName && { appName }),
        },
      },
      {
        $group: {
          _id: '$data.model',
          tokens: { $sum: '$data.totalTokens' },
          cost: { $sum: '$data.cost' },
          requests: { $sum: 1 },
        },
      },
      {
        $sort: { cost: -1 },
      },
    ];

    const results = await this.eventsCollection.aggregate(pipeline).toArray();

    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);

    return {
      totalCost,
      totalTokens,
      breakdown: results.map((r) => ({
        model: r._id,
        tokens: r.tokens,
        cost: r.cost,
        requests: r.requests,
      })),
    };
  }
}
```

### 3. 索引优化策略

#### bi_metrics_hourly 索引

```typescript
// scripts/createBiMetricsIndexes.ts
async function createBiMetricsIndexes() {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // 小时指标表索引
    const hourlyCollection = db.collection('bi_metrics_hourly');

    await hourlyCollection.createIndex(
      { periodStart: -1 },
      { name: 'idx_periodStart', background: true }
    );

    await hourlyCollection.createIndex(
      { appName: 1, eventType: 1, periodStart: -1 },
      { name: 'idx_app_event_period', unique: true, background: true }
    );

    await hourlyCollection.createIndex(
      { appName: 1, periodStart: -1 },
      { name: 'idx_app_period', background: true }
    );

    // 日指标表索引（相同结构）
    const dailyCollection = db.collection('bi_metrics_daily');

    await dailyCollection.createIndex(
      { periodStart: -1 },
      { name: 'idx_periodStart', background: true }
    );

    await dailyCollection.createIndex(
      { appName: 1, eventType: 1, periodStart: -1 },
      { name: 'idx_app_event_period', unique: true, background: true }
    );

    console.log('✅ Metrics indexes created successfully');
  } finally {
    await client.close();
  }
}
```

### 4. 数据库初始化脚本

```bash
# scripts/init_bi_collections.sh
#!/bin/bash

echo "初始化BI分析数据库..."

# 1. 创建集合
mongo "$MONGO_URL/$DB_NAME" <<EOF
db.createCollection("bi_events");
db.createCollection("bi_metrics_hourly");
db.createCollection("bi_metrics_daily");
EOF

# 2. 创建索引
npm run create:bi:indexes

# 3. 验证索引
mongo "$MONGO_URL/$DB_NAME" <<EOF
print("===== bi_events indexes =====");
db.bi_events.getIndexes().forEach(printjson);

print("\n===== bi_metrics_hourly indexes =====");
db.bi_metrics_hourly.getIndexes().forEach(printjson);

print("\n===== bi_metrics_daily indexes =====");
db.bi_metrics_daily.getIndexes().forEach(printjson);
EOF

echo "✅ BI数据库初始化完成"
```

## 使用示例

### 插入事件

```typescript
import { v4 as uuidv4 } from 'uuid';
import { BiAnalytics } from './BiAnalytics';

// 1. 上传文件事件
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
  context: {
    userId: 'user_123',
    appName: APP_NAMES.MANDIS,
    platform: PLATFORMS.MINIPROGRAM,
  },
});

// 2. Qwen分析事件
await BiAnalytics.track({
  eventType: EVENT_TYPES.QWEN_ANALYZE,
  data: {
    promptTokens: 1234,
    completionTokens: 567,
    totalTokens: 1801,
    model: 'qwen-vl-plus',
    cost: 0.0234,
    durationMs: 2345,
    workId: 'work_456',
    status: 'success',
  },
});

// 3. API请求事件
await BiAnalytics.track({
  eventType: EVENT_TYPES.API_REQUEST,
  data: {
    endpoint: '/api/works/list',
    method: 'GET',
    statusCode: 200,
    durationMs: 123,
    requestSize: 0,
    responseSize: 4567,
    status: 'success',
  },
});
```

### 查询示例

```typescript
// 查询过去7天的小时指标
const metrics = await BiAnalytics.queryMetrics(
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  new Date(),
  'hourly',
  APP_NAMES.MANDIS,
  EVENT_TYPES.UPLOAD_FILE,
);

// 查询错误分析
const errors = await BiAnalytics.queryErrorAnalysis(
  new Date(Date.now() - 24 * 60 * 60 * 1000),
  new Date(),
  APP_NAMES.MANDIS,
);

// 查询Qwen成本
const costs = await BiAnalytics.queryCostAnalysis(
  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  new Date(),
);
console.log(`总成本: $${costs.totalCost.toFixed(2)}`);
console.log(`总Token: ${costs.totalTokens.toLocaleString()}`);
```

## 下一步

1. 实现中间件和装饰器（见下一节）
2. 创建定时任务执行聚合
3. 开发查询API接口
4. 搭建可视化Dashboard
