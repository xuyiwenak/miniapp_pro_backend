import { Schema } from 'mongoose';
import { AppName, EventType } from './biEvent.entity';

// 小时级聚合指标接口
export interface IBiMetricsHourly {
  periodStart: Date;
  periodEnd: Date;
  appName: AppName;
  eventType: EventType;

  // 计数统计
  totalEvents: number;
  successCount: number;
  failedCount: number;
  uniqueUsers: number;
  uniqueSessions: number;

  // 性能指标（毫秒）
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  maxDurationMs: number;

  // 上传相关指标
  upload?: {
    totalBytes: number;
    avgBytes: number;
    totalImages: number;
    contentTypes: Record<string, number>;
  };

  // Qwen 相关指标
  qwen?: {
    totalTokens: number;
    totalCost: number;
    avgTokensPerRequest: number;
    models: Record<string, number>;
  };

  // API 相关指标
  api?: {
    endpoints: Record<string, number>;
    statusCodes: Record<string, number>;
    totalRequestBytes: number;
    totalResponseBytes: number;
  };

  // 元数据
  createdAt: Date;
  updatedAt: Date;
}

// 天级聚合指标接口（结构与小时级相同）
export interface IBiMetricsDaily extends IBiMetricsHourly {}

// 小时级指标 Schema
const BiMetricsHourlySchema = new Schema<IBiMetricsHourly>(
  {
    periodStart: { type: Date, required: true, index: true },
    periodEnd: { type: Date, required: true },
    appName: {
      type: String,
      required: true,
      enum: ['mandis', 'begreat', 'art_web', 'art_backend'],
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: ['upload_file', 'qwen_analyze', 'api_request'],
      index: true,
    },

    // 计数统计
    totalEvents: { type: Number, required: true, default: 0 },
    successCount: { type: Number, required: true, default: 0 },
    failedCount: { type: Number, required: true, default: 0 },
    uniqueUsers: { type: Number, required: true, default: 0 },
    uniqueSessions: { type: Number, required: true, default: 0 },

    // 性能指标
    avgDurationMs: { type: Number, required: true, default: 0 },
    p50DurationMs: { type: Number, required: true, default: 0 },
    p95DurationMs: { type: Number, required: true, default: 0 },
    p99DurationMs: { type: Number, required: true, default: 0 },
    maxDurationMs: { type: Number, required: true, default: 0 },

    // 上传指标
    upload: {
      type: {
        totalBytes: { type: Number, default: 0 },
        avgBytes: { type: Number, default: 0 },
        totalImages: { type: Number, default: 0 },
        contentTypes: { type: Object, default: {} },
      },
      default: undefined,
    },

    // Qwen 指标
    qwen: {
      type: {
        totalTokens: { type: Number, default: 0 },
        totalCost: { type: Number, default: 0 },
        avgTokensPerRequest: { type: Number, default: 0 },
        models: { type: Object, default: {} },
      },
      default: undefined,
    },

    // API 指标
    api: {
      type: {
        // plain Object 而非 Map，避免 Mongoose cast 错误
        endpoints: { type: Object, default: {} },
        statusCodes: { type: Object, default: {} },
        totalRequestBytes: { type: Number, default: 0 },
        totalResponseBytes: { type: Number, default: 0 },
      },
      default: undefined,
    },

    // 元数据
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'bi_metrics_hourly',
    timestamps: false,
  }
);

// 复合索引
BiMetricsHourlySchema.index({ appName: 1, eventType: 1, periodStart: -1 });
BiMetricsHourlySchema.index({ appName: 1, periodStart: 1, eventType: 1 }, { unique: true });

// 天级指标 Schema（结构相同，collection 不同）
const BiMetricsDailySchema = new Schema<IBiMetricsDaily>(
  BiMetricsHourlySchema.obj,
  {
    collection: 'bi_metrics_daily',
    timestamps: false,
  }
);

// 复合索引（与小时级相同）
BiMetricsDailySchema.index({ appName: 1, eventType: 1, periodStart: -1 });
BiMetricsDailySchema.index({ appName: 1, periodStart: 1, eventType: 1 }, { unique: true });

// TTL 索引：小时级保留 1 年，天级保留无限期
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
BiMetricsHourlySchema.index({ createdAt: 1 }, { expireAfterSeconds: ONE_YEAR_IN_SECONDS });

// Schemas are exported for connection-based registration (see BiDBModel)
export { BiMetricsHourlySchema, BiMetricsDailySchema };
