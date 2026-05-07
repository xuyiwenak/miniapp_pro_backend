# BI Analytics System - 完整设计文档

## 概述

这是一个为 **art_backend**、**mandis**、**begreat** 等项目设计的通用BI数据采集系统。系统提供了从数据采集、存储、聚合到分析呈现的完整解决方案。

## 核心功能

### 1. 已实现的打点场景

根据你的需求，系统已经设计了以下打点场景：

#### `/api/upload` 上传记录
- ✅ 文件大小 (bytes)
- ✅ 文件类型 (contentType)
- ✅ 图片尺寸 (width, height)
- ✅ 上传耗时 (durationMs)
- ✅ 成功/失败状态
- ✅ 错误码和错误信息

#### Qwen 分析记录
- ✅ Token使用量 (promptTokens, completionTokens, totalTokens)
- ✅ 调用耗时 (durationMs)
- ✅ 成本计算 (cost)
- ✅ 模型版本 (model)
- ✅ 成功/失败状态
- ✅ 错误码和错误信息

#### API 请求记录 (通用)
- ✅ 接口路径 (endpoint)
- ✅ HTTP方法 (method)
- ✅ 状态码 (statusCode)
- ✅ 请求/响应大小
- ✅ 处理耗时
- ✅ 成功/失败状态

### 2. 通用上下文字段

每个事件都会自动附加以下上下文信息：

- 用户ID (userId)
- 会话ID (sessionId)
- 请求ID (requestId)
- 应用名称 (appName: mandis, begreat, art_backend)
- 平台类型 (platform: miniprogram, web, api)
- 应用版本 (appVersion)
- IP地址（匿名化，GDPR合规）
- User Agent
- 时间戳 (timestamp)

## 文档结构

本设计包含以下文档：

```
bi-analytics/
├── README.md                  # 本文档（总览）
├── spec.md                    # OpenSpec规范（需求定义）
├── implementation.md          # MongoDB数据模型和索引设计
├── middleware.md              # 中间件和打点方案（装饰器、工具函数）
├── analytics.md               # 数据分析和可视化方案
└── supplementary.md           # 补充字段和边界场景处理
```

### 快速导航

| 文档 | 内容 | 适用场景 |
|------|------|----------|
| **spec.md** | 需求规范、场景定义、非功能需求 | 了解系统设计目标和约束 |
| **implementation.md** | TypeScript类型、Zod验证、MongoDB索引 | 实现数据模型和数据库 |
| **middleware.md** | BiAnalytics核心类、装饰器、Express中间件 | 集成打点到现有代码 |
| **analytics.md** | REST API、聚合查询、Dashboard设计 | 实现数据分析和可视化 |
| **supplementary.md** | 补充字段、边界场景、最佳实践 | 解决特殊需求和问题 |

## 快速开始

### 1. 初始化数据库

```bash
# 创建集合和索引
npm run create:bi:indexes

# 或手动执行脚本
node scripts/createBiIndexes.ts
```

### 2. 集成到应用

#### 方式1：使用装饰器（推荐）

```typescript
import { TrackEvent, TrackUpload, TrackAiAnalysis } from './common/BiDecorators';

class UploadService {
  @TrackUpload()
  async uploadFile(file: Express.Multer.File): Promise<string> {
    // ... 上传逻辑
    return 'https://oss.example.com/image.jpg';
  }
}

class QwenService {
  @TrackAiAnalysis('qwen-vl-plus')
  async analyzeArtwork(imageUrl: string): Promise<any> {
    // ... AI分析逻辑
    return { insight: '...', scores: {...} };
  }
}
```

#### 方式2：使用Express中间件

```typescript
import { trackApiRequest } from './util/biMiddleware';

const app = express();

// 自动追踪所有/api路径的请求
app.use('/api', trackApiRequest({
  ignorePaths: [/\/health$/, /\/ping$/],
}));
```

#### 方式3：手动打点

```typescript
import { BiAnalytics } from './util/BiAnalytics';
import { EVENT_TYPES } from './entity/BiEvent';

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
```

### 3. 查询数据

#### REST API查询

```bash
# 查询过去7天的指标
GET /api/bi/metrics?startTime=2026-04-29T00:00:00Z&endTime=2026-05-06T00:00:00Z&granularity=daily&appName=mandis

# 查询错误分析
GET /api/bi/errors?startTime=2026-05-05T00:00:00Z&endTime=2026-05-06T00:00:00Z&appName=mandis

# 查询Qwen成本
GET /api/bi/costs?startTime=2026-04-01T00:00:00Z&endTime=2026-05-01T00:00:00Z&groupBy=day

# 获取Dashboard总览
GET /api/bi/dashboard?timeRange=7d&appName=mandis
```

#### 使用Service直接查询

```typescript
import { BiAnalyticsService } from './apps/bi/BiAnalyticsService';

const service = new BiAnalyticsService(db);

// 查询趋势
const trends = await service.queryTrends(
  new Date('2026-04-29'),
  new Date('2026-05-06'),
  'daily',
  ['totalEvents', 'successRate'],
  'mandis',
);

// 查询成本
const costs = await service.queryCostAnalysis(
  new Date('2026-04-01'),
  new Date('2026-05-01'),
  'mandis',
  'day',
);

console.log(`Qwen总成本: $${costs.totalCost.toFixed(2)}`);
console.log(`Qwen总Token: ${costs.totalTokens.toLocaleString()}`);
```

### 4. 启动定时任务

```typescript
// src/index.ts
import { BiAggregationJob } from './jobs/BiAggregationJob';

const aggregationJob = new BiAggregationJob(db);
aggregationJob.start(); // 启动小时聚合和日聚合定时任务
```

## 数据流程图

```
┌─────────────────────────────────────────────────────────────┐
│  数据采集层 (Collection Layer)                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ 装饰器       │  │ 中间件       │  │ 手动打点     │       │
│  │ @TrackEvent  │  │ trackApi     │  │ BiAnalytics  │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └─────────────────┴─────────────────┘                │
│                           │                                  │
│                           ▼                                  │
│                  ┌─────────────────┐                         │
│                  │  BiAnalytics    │                         │
│                  │  核心类         │                         │
│                  │  - 队列管理     │                         │
│                  │  - 批量写入     │                         │
│                  │  - 错误处理     │                         │
│                  └────────┬────────┘                         │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  存储层 (Storage Layer)                                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│                  ┌─────────────────┐                         │
│                  │  bi_events      │                         │
│                  │  原始事件表     │                         │
│                  │  - 90天TTL      │                         │
│                  │  - 8个索引      │                         │
│                  └────────┬────────┘                         │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  聚合层 (Aggregation Layer)                                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────┐                │
│  │  BiAggregationJob (Cron 定时任务)       │                │
│  ├─────────────────────────────────────────┤                │
│  │  - 小时聚合: 每5分钟执行                │                │
│  │  - 日聚合: 每天凌晨1点执行              │                │
│  └────────┬──────────────┬─────────────────┘                │
│           │              │                                   │
│           ▼              ▼                                   │
│  ┌────────────────┐  ┌────────────────┐                     │
│  │ bi_metrics     │  │ bi_metrics     │                     │
│  │ _hourly        │  │ _daily         │                     │
│  │ 小时聚合表     │  │ 日聚合表       │                     │
│  └────────────────┘  └────────────────┘                     │
│                                                               │
└───────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  分析层 (Analytics Layer)                                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────┐                │
│  │  BiAnalyticsService                     │                │
│  ├─────────────────────────────────────────┤                │
│  │  - queryTrends()       趋势查询         │                │
│  │  - queryErrorAnalysis() 错误分析        │                │
│  │  - queryCostAnalysis()  成本分析        │                │
│  │  - queryPerformance()   性能分析        │                │
│  │  - getDashboard()       总览数据        │                │
│  └────────┬────────────────────────────────┘                │
│           │                                                  │
└───────────┼──────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│  展示层 (Presentation Layer)                                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  REST API    │  │  Dashboard   │  │  报表导出    │       │
│  │  /api/bi/*   │  │  React + 图表│  │  Excel/PDF   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## MongoDB 集合设计

### bi_events (原始事件表)

```javascript
{
  _id: ObjectId,
  eventId: "uuid-v4",
  eventType: "upload_file" | "qwen_analyze" | "api_request",
  timestamp: ISODate("2026-05-06T14:23:45Z"),

  // 上下文
  userId: "user_123",
  sessionId: "session_abc",
  requestId: "req_xyz",
  appName: "mandis",
  platform: "miniprogram",
  appVersion: "1.2.3",
  ipAddress: "192.168.1.0", // 匿名化
  userAgent: "Mozilla/5.0 ...",

  // 事件数据
  data: {
    // upload_file
    bytes: 1024000,
    contentType: "image/jpeg",
    width: 1920,
    height: 1080,
    durationMs: 234,
    status: "success",

    // qwen_analyze
    promptTokens: 1234,
    completionTokens: 567,
    totalTokens: 1801,
    model: "qwen-vl-plus",
    cost: 0.0234,

    // api_request
    endpoint: "/api/works/list",
    method: "GET",
    statusCode: 200,
    requestSize: 0,
    responseSize: 4567,
  },

  // 元数据
  schemaVersion: "v1",
  createdAt: ISODate("2026-05-06T14:23:45Z"),
}
```

**索引 (8个)**:
1. `{ timestamp: -1 }` - 时间查询
2. `{ eventType: 1, timestamp: -1 }` - 按事件类型查询
3. `{ userId: 1, timestamp: -1 }` - 用户行为分析
4. `{ appName: 1, timestamp: -1 }` - 应用维度分析
5. `{ "data.status": 1, timestamp: -1 }` - 错误分析
6. `{ sessionId: 1, timestamp: -1 }` - 会话分析
7. `{ eventId: 1 }` (unique) - 防重
8. `{ createdAt: 1 }` (TTL 90天) - 自动清理

### bi_metrics_hourly / bi_metrics_daily (聚合表)

```javascript
{
  _id: ObjectId,
  periodStart: ISODate("2026-05-06T14:00:00Z"),
  periodEnd: ISODate("2026-05-06T15:00:00Z"),
  appName: "mandis",
  eventType: "upload_file",

  // 统计指标
  totalEvents: 1234,
  successCount: 1200,
  failedCount: 34,
  uniqueUsers: 567,
  uniqueSessions: 789,

  // 性能指标
  avgDurationMs: 234,
  p50DurationMs: 200,
  p95DurationMs: 500,
  p99DurationMs: 800,
  maxDurationMs: 1200,

  // 上传特定指标
  upload: {
    totalBytes: 123456789,
    avgBytes: 100000,
    totalImages: 1200,
    contentTypes: {
      "image/jpeg": 800,
      "image/png": 400,
    },
  },

  // Qwen特定指标
  qwen: {
    totalTokens: 456789,
    totalCost: 12.34,
    avgTokensPerRequest: 380,
    models: {
      "qwen-vl-plus": 1100,
      "qwen-vl-max": 134,
    },
  },

  // API特定指标
  api: {
    endpoints: {
      "/api/works/list": 500,
      "/api/user/profile": 300,
    },
    statusCodes: {
      "200": 1150,
      "500": 50,
    },
    totalRequestBytes: 12345,
    totalResponseBytes: 567890,
  },

  createdAt: ISODate("2026-05-06T15:05:00Z"),
  updatedAt: ISODate("2026-05-06T15:05:00Z"),
}
```

## 性能指标

| 指标 | 目标值 | 备注 |
|------|--------|------|
| 事件插入延迟 | < 50ms (P95) | 异步非阻塞 |
| 批量写入大小 | 100条/批次 | 或5秒刷新 |
| 查询响应时间 | < 500ms | 7天范围查询 |
| 聚合计算时间 | < 10秒/小时 | 小时聚合 |
| 聚合计算时间 | < 60秒/天 | 日聚合 |
| 峰值吞吐量 | 10,000事件/分钟 | 支持高峰流量 |
| 数据丢失率 | < 0.01% | 正常情况下 |

## 成本估算

### MongoDB存储成本

假设：
- 平均每个事件 1KB
- 每天 100万事件
- 保留90天

**存储量**: 100万 × 1KB × 90天 = 90GB

**MongoDB Atlas成本** (M10实例):
- $57/月 (支持10GB存储 + 自动扩展)
- 超出部分: $0.25/GB/月
- **月成本**: ~$77

### Qwen API成本

假设：
- qwen-vl-plus: ¥0.008/1K tokens
- 每天1000次分析调用
- 平均每次1800 tokens

**月成本**: 1000 × 30 × 1800 × 0.008 / 1000 = ¥432 ≈ $60

### 总成本估算

- MongoDB: $77/月
- Qwen API: $60/月
- 服务器/带宽: $50/月 (按需)

**总计**: ~$187/月 (可根据实际情况调整)

## 安全与合规

- ✅ **IP匿名化**: 符合GDPR要求
- ✅ **PII保护**: 不存储密码、token等敏感信息
- ✅ **数据加密**: MongoDB传输加密 (TLS)
- ✅ **访问控制**: BI API需要管理员权限
- ✅ **数据保留**: 90天TTL自动删除
- ✅ **审计日志**: 所有查询操作记录

## 扩展性

### 水平扩展

- MongoDB Sharding (当数据量>100M时)
- 读写分离 (Primary + Secondary replicas)

### 垂直扩展

- 升级MongoDB实例 (M10 → M20 → M30)
- 增加内存/CPU资源

### 功能扩展

- 添加新事件类型（参考 `supplementary.md`）
- 集成插件系统（地理位置、设备指纹等）
- 实时告警（错误率超阈值、成本超预算）

## 实施路线图

### Phase 1: 核心功能 (2周)

- ✅ MongoDB数据模型设计
- ✅ BiAnalytics核心类实现
- ✅ 装饰器和中间件实现
- ✅ 集成到upload和qwen接口

### Phase 2: 聚合和查询 (2周)

- ⏳ 实现聚合任务 (BiAggregator)
- ⏳ 配置Cron定时任务
- ⏳ 实现REST API (BiAnalyticsController)
- ⏳ 单元测试和集成测试

### Phase 3: 可视化 (2周)

- ⏳ 开发Dashboard前端 (React)
- ⏳ 集成图表库 (Recharts/ECharts)
- ⏳ 实现实时刷新和筛选
- ⏳ 响应式设计 (移动端适配)

### Phase 4: 优化和扩展 (持续)

- ⏳ 性能优化 (查询缓存、索引优化)
- ⏳ 告警功能 (钉钉/企业微信通知)
- ⏳ 导出功能 (Excel/PDF报表)
- ⏳ 用户行为分析 (漏斗、留存、路径分析)

## 常见问题

请参考 `supplementary.md` 的 FAQ 部分。

## 联系和支持

如有问题或建议，请：

1. 查阅本文档和相关规范文档
2. 检查 `supplementary.md` 的FAQ部分
3. 联系开发团队

---

**文档版本**: v1.0
**最后更新**: 2026-05-06
**维护者**: BI Analytics Team
