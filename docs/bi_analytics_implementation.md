# BI Analytics 实现文档

## 概述

本文档描述了 BI 数据分析系统的实现，遵循 OpenSpec: `art_backend/openspec/specs/bi-analytics/spec.md`

## 实现内容

### Phase 1: 基础设施

#### 1. 数据模型（Entity Layer）

**文件：** `src/entity/biEvent.entity.ts`

定义了三个核心 Collection：
- `bi_events` - 原始事件存储（90天 TTL）
- `bi_metrics_hourly` - 小时级聚合指标（1年 TTL）
- `bi_metrics_daily` - 天级聚合指标（无限期）

**事件类型：**
- `upload_file` - 文件上传事件
- `qwen_analyze` - Qwen AI 分析事件
- `api_request` - API 请求事件

**索引：**
- 时间索引：`{ timestamp: -1 }`
- 复合索引：`{ eventType: 1, timestamp: -1 }`
- 用户索引：`{ userId: 1, timestamp: -1 }`
- 应用索引：`{ appName: 1, timestamp: -1 }`
- 会话索引：`{ sessionId: 1, timestamp: -1 }`
- 状态索引：`{ "data.status": 1, timestamp: -1 }`

#### 2. 核心组件（Component Layer）

**文件：** `src/component/BiAnalyticsComponent.ts`

实现了 `IBaseComponent` 接口的 BI 分析组件，功能包括：

- **异步事件收集**：不阻塞主线程，使用内存队列缓冲
- **批量插入**：每 5 秒或累积 100 条事件时批量写入 MongoDB
- **错误处理**：失败时记录日志，不影响主业务逻辑
- **IP 匿名化**：自动匿名化 IP 地址（GDPR 合规）

**主要方法：**
- `track()` - 通用事件追踪
- `trackUploadFile()` - 文件上传追踪
- `trackQwenAnalyze()` - Qwen AI 分析追踪
- `trackApiRequest()` - API 请求追踪

### Phase 2: 自动追踪

#### 3. 文件上传事件追踪

**文件：** `src/apps/mandis/miniapp/routes/api.ts`

在以下端点添加了追踪：
- `POST /api/upload` - 通用文件上传
- `POST /api/uploadAvatar` - 头像上传

**追踪数据：**
- `bytes` - 文件大小
- `contentType` - MIME 类型
- `width` / `height` - 图片尺寸
- `durationMs` - 上传耗时
- `status` - 成功/失败状态
- `errorCode` / `errorMessage` - 错误信息（如果失败）

#### 4. Qwen AI 分析事件追踪

**文件：** `src/util/qwenVlAnalyzer.ts`

修改了 `analyzeArtwork()` 函数，添加：

**追踪数据：**
- `promptTokens` - 输入 tokens
- `completionTokens` - 输出 tokens
- `totalTokens` - 总 tokens
- `durationMs` - 分析耗时
- `model` - 模型名称（如 `qwen-vl-plus`）
- `cost` - 成本计算（人民币）
- `status` - 成功/失败状态
- `workId` - 作品 ID（可选）
- `imageUrl` - 图片 URL

**成本计算：**
```typescript
// Qwen VL Plus 定价
const QWEN_VL_PLUS_INPUT_PRICE = 0.008;  // ¥0.008 / 1k tokens
const QWEN_VL_PLUS_OUTPUT_PRICE = 0.008; // ¥0.008 / 1k tokens

cost = (promptTokens / 1000) * 0.008 + (completionTokens / 1000) * 0.008
```

**错误场景追踪：**
- JSON 解析失败
- API 错误
- 空内容返回
- 非艺术作品（NOT_ARTWORK）

#### 5. API 请求中间件追踪

**文件：** `src/shared/miniapp/middleware/biTracking.ts`

实现了 Express 中间件，自动追踪所有 API 请求。

**追踪数据：**
- `endpoint` - API 路径
- `method` - HTTP 方法
- `statusCode` - HTTP 状态码
- `durationMs` - 请求耗时
- `requestSize` - 请求大小（字节）
- `responseSize` - 响应大小（字节）
- `status` - 成功/失败状态
- `errorCode` / `errorMessage` - 错误信息

**应用位置：**
`src/apps/mandis/miniapp/server.ts` - 所有 miniapp REST API 路由

## 组件注册

**文件：** `src/apps/mandis/front.ts`

```typescript
const biAnalyticsComp = new BiAnalyticsComponent();
biAnalyticsComp.init({
  enabled: args.environment !== 'test', // 测试环境禁用
  appName: 'mandis',
  appVersion: '1.0.0',
  platform: 'api',
});
ComponentManager.instance.register('BiAnalytics', biAnalyticsComp);
```

## 数据隐私与安全

### IP 匿名化

自动匿名化客户端 IP 地址，符合 GDPR 要求：

- **IPv4**：`192.168.1.123` → `192.168.1.0`
- **IPv6**：保留前 48 位，其余置零

### PII 排除

系统不存储以下敏感信息：
- 用户密码或 token
- 文件内容或图片数据
- 用户姓名、邮箱、手机号

仅存储 `userId`（匿名标识符）。

## 性能优化

### 异步处理

- 事件追踪完全异步，不阻塞主业务逻辑
- 使用内存队列缓冲，批量写入数据库
- 插入失败时自动重试（下次定时任务）

### 批量插入

- 每 5 秒处理一次队列
- 每次最多插入 100 条事件
- 使用 `insertMany()` 批量操作

### 索引优化

所有查询字段都添加了索引：
- 单字段索引：`timestamp`, `eventType`, `userId`, `appName`, `sessionId`
- 复合索引：`{ eventType: 1, timestamp: -1 }`
- TTL 索引：自动清理过期数据

## 使用示例

### 手动追踪事件

```typescript
import { ComponentManager } from '../common/BaseComponent';
import { BiAnalyticsComponent } from '../component/BiAnalyticsComponent';

const biAnalytics = ComponentManager.instance.getComponentByKey<BiAnalyticsComponent>('BiAnalytics');

// 追踪文件上传
biAnalytics?.trackUploadFile({
  bytes: 1024000,
  contentType: 'image/jpeg',
  width: 1920,
  height: 1080,
  durationMs: 2345,
  status: 'success',
}, {
  userId: 'user_123',
  ipAddress: '192.168.1.100',
  userAgent: 'Mozilla/5.0...',
});

// 追踪 Qwen AI 分析
biAnalytics?.trackQwenAnalyze({
  promptTokens: 1500,
  completionTokens: 800,
  totalTokens: 2300,
  durationMs: 5600,
  model: 'qwen-vl-plus',
  cost: 0.0184,
  status: 'success',
  workId: 'work_abc123',
}, {
  userId: 'user_123',
});
```

### 查询事件数据

```typescript
import { BiEvent } from '../entity/biEvent.entity';

// 查询最近 24 小时的上传事件
const uploadEvents = await BiEvent.find({
  eventType: 'upload_file',
  timestamp: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
}).limit(100).lean();

// 统计 Qwen 成本
const qwenEvents = await BiEvent.aggregate([
  { $match: { eventType: 'qwen_analyze', 'data.status': 'success' } },
  { $group: {
    _id: null,
    totalCost: { $sum: '$data.cost' },
    totalTokens: { $sum: '$data.totalTokens' },
    count: { $sum: 1 },
  }},
]);

console.log('Total Qwen cost:', qwenEvents[0].totalCost.toFixed(2), 'CNY');
```

## 下一步计划（Phase 3 & 4）

### Phase 3: 聚合和分析

- [ ] 实现小时级聚合管道
- [ ] 实现天级聚合管道
- [ ] 添加 Cron 定时任务
- [ ] 实现数据保留策略

### Phase 4: 查询和可视化

- [ ] 实现查询 API：`GET /api/bi/metrics`
- [ ] 实现趋势分析：`GET /api/bi/trends`
- [ ] 实现错误分析：`GET /api/bi/errors`
- [ ] 实现成本分析：`GET /api/bi/costs`
- [ ] 前端 Dashboard（可选）

## 监控指标

当前可监控的关键指标：

1. **文件上传**
   - 上传成功率
   - 平均上传时间
   - 文件大小分布
   - 内容类型分布

2. **Qwen AI 分析**
   - 分析成功率
   - Token 用量
   - 每日成本
   - 平均响应时间
   - 错误类型分布

3. **API 请求**
   - 请求量（QPS）
   - 响应时间（P50, P95, P99）
   - 错误率
   - 端点热度排行

## 故障排查

### 事件未记录

1. 检查组件是否启用：
   ```typescript
   const biAnalytics = ComponentManager.instance.getComponentByKey('BiAnalytics');
   console.log('BI Analytics enabled:', biAnalytics?.config?.enabled);
   ```

2. 检查 MongoDB 连接状态

3. 查看日志：
   ```bash
   grep "BiAnalytics" logs/game.log
   ```

### 成本计算不准确

确认 Qwen VL 定价是否更新，修改 `qwenVlAnalyzer.ts` 中的常量：
```typescript
const QWEN_VL_PLUS_INPUT_PRICE = 0.008;  // 更新此值
const QWEN_VL_PLUS_OUTPUT_PRICE = 0.008; // 更新此值
```

## 编码规范遵循

✅ 所有代码遵循 `art_backend/CODING_GUIDELINES.md`：
- 使用 TypeScript strict mode
- 遵循 `IBaseComponent` 模式
- 使用 Zod 校验（未来可添加）
- 结构化日志
- 错误处理
- 命名规范（camelCase, PascalCase, UPPER_SNAKE_CASE）
- 无硬编码配置
- IP 匿名化（GDPR）

## 参考文档

- OpenSpec: `art_backend/openspec/specs/bi-analytics/spec.md`
- 编码规范: `art_backend/CODING_GUIDELINES.md`
- 项目规范: `CLAUDE.md`
