import { Schema, model } from 'mongoose';

// 事件类型常量
export const EVENT_TYPE_UPLOAD_FILE = 'upload_file';
export const EVENT_TYPE_QWEN_ANALYZE = 'qwen_analyze';
export const EVENT_TYPE_API_REQUEST = 'api_request';
export const EVENT_TYPE_CLIENT_EVENT = 'client_event';

export type EventType =
  | typeof EVENT_TYPE_UPLOAD_FILE
  | typeof EVENT_TYPE_QWEN_ANALYZE
  | typeof EVENT_TYPE_API_REQUEST
  | typeof EVENT_TYPE_CLIENT_EVENT;

export type EventStatus = 'success' | 'failed';

export type Platform = 'miniprogram' | 'web' | 'api';

export type AppName = 'mandis' | 'begreat' | 'art_web' | 'art_backend';

// 事件上下文接口
export interface IEventContext {
  eventId: string;
  eventType: EventType;
  timestamp: Date;
  userId: string | null;
  sessionId: string;
  requestId: string;
  appName: AppName;
  platform: Platform;
  appVersion: string;
  ipAddress: string;
  userAgent: string;
}

// 文件上传事件数据
export interface IUploadFileData {
  bytes: number;
  contentType: string;
  width?: number;
  height?: number;
  durationMs: number;
  status: EventStatus;
  errorCode?: string;
  errorMessage?: string;
}

// Qwen AI 分析事件数据
export interface IQwenAnalyzeData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  model: string;
  cost: number;
  status: EventStatus;
  errorCode?: string;
  errorMessage?: string;
  workId?: string;
  imageUrl?: string;
}

// API 请求事件数据
export interface IApiRequestData {
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestSize: number;
  responseSize: number;
  status: EventStatus;
  errorCode?: string;
  errorMessage?: string;
}

// 客户端事件数据（前端 SDK 发送）
export interface IClientEventData {
  eventSubType: 'page_view' | 'user_action' | 'client_error';
  page?: string;
  action?: string;
  errorMessage?: string;
  errorStack?: string;
  durationMs?: number;
  status: EventStatus;
}

// 通用事件数据类型
export type EventData = IUploadFileData | IQwenAnalyzeData | IApiRequestData | IClientEventData;

// BI 事件主接口
export interface IBiEvent extends IEventContext {
  data: EventData;
  createdAt: Date;
  schemaVersion: string;
}

// Mongoose Schema 定义
const BiEventSchema = new Schema<IBiEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: {
      type: String,
      required: true,
      enum: [EVENT_TYPE_UPLOAD_FILE, EVENT_TYPE_QWEN_ANALYZE, EVENT_TYPE_API_REQUEST, EVENT_TYPE_CLIENT_EVENT],
      index: true,
    },
    timestamp: { type: Date, required: true, index: true },

    // Context
    userId: { type: String, default: null, index: true },
    sessionId: { type: String, required: true, index: true },
    requestId: { type: String, required: true },
    appName: {
      type: String,
      required: true,
      enum: ['mandis', 'begreat', 'art_web', 'art_backend'],
      index: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ['miniprogram', 'web', 'api'],
    },
    appVersion: { type: String, required: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true },

    // Event-specific data
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },

    // Metadata
    createdAt: { type: Date, default: Date.now },
    schemaVersion: { type: String, default: 'v1' },
  },
  {
    collection: 'bi_events',
    timestamps: false,
  }
);

// 复合索引
BiEventSchema.index({ eventType: 1, timestamp: -1 });
BiEventSchema.index({ userId: 1, timestamp: -1 });
BiEventSchema.index({ appName: 1, timestamp: -1 });
BiEventSchema.index({ sessionId: 1, timestamp: -1 });
BiEventSchema.index({ 'data.status': 1, timestamp: -1 });

// TTL 索引：90 天后自动删除
const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60;
BiEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS_IN_SECONDS });

export const BiEvent = model<IBiEvent>('BiEvent', BiEventSchema);
