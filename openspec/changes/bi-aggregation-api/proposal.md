# Change: BI 聚合引擎 + 查询 API + begreat 后端接入

## Why

当前 BI 系统的 Phase 1-2 已完成——事件采集层运作正常：`BiAnalyticsComponent` 已在 mandis 后端注册，`biTrackingMiddleware` 自动追踪所有 API 请求，`api.ts` 和 `qwenVlAnalyzer.ts` 中已嵌入上传和 AI 分析的打点。原始事件持续写入 `bi_events` 集合。

但存在三个缺口，使得收集到的数据**无法被消费**：

1. **无聚合层**：`bi_metrics_hourly` 和 `bi_metrics_daily` 表为空——`BiAggregator` 类仅在 spec 文档中定义，未实际实现。所有查询只能扫 `bi_events` 原始表，性能不可接受（7 天范围需扫描数十万文档）。

2. **无查询入口**：spec 定义的 6 个 REST 端点（`/api/bi/metrics`、`/api/bi/trends`、`/api/bi/errors`、`/api/bi/costs`、`/api/bi/performance`、`/api/bi/dashboard`）全部未实现。前端 Dashboard 无法获取任何 BI 数据。

3. **begreat 完全离线**：begreat 后端（`src/apps/begreat/`）未注册 `BiAnalyticsComponent`，也未挂载 `biTrackingMiddleware`。begreat 的 assessment、payment、invite 等 API 请求完全未被追踪，`appName: 'begreat'` 的事件量为零。

## What Changes

### 新增

- **BiAggregator 类** (`src/component/BiAggregator.ts`)：实现小时级和天级聚合管道，从 `bi_events` 读取 → 计算分位数/分类汇总 → upsert 到 `bi_metrics_hourly` / `bi_metrics_daily`
- **BiAggregationJob 类** (`src/jobs/BiAggregationJob.ts`)：Cron 定时任务调度——每 5 分钟执行小时聚合（聚合上一个完整小时），每天 01:00 UTC+8 执行日聚合（从小时表汇总）
- **BiAnalyticsService 类** (`src/apps/bi/BiAnalyticsService.ts`)：查询服务层，封装对聚合表和原始事件表的查询逻辑，提供 trend/error/cost/performance/dashboard 方法
- **BI 查询路由** (`src/apps/mandis/miniapp/routes/bi.ts`)：6 个 REST 端点，admin JWT 鉴权，Zod 参数校验
- **前端 client-event 端点** (`POST /api/bi/client-event`)：接收前端 SDK 发送的客户端事件（page_view、user_action、client_error），为 Phase 2b 前端 SDK 做准备

### 修改

- **begreat/front.ts**：注册 `BiAnalyticsComponent`，appName='begreat'
- **begreat/miniapp/server.ts**：挂载 `biTrackingMiddleware`
- **biEvent.entity.ts**：新增 `client_event` 事件类型

### 不涉及

- 不修改现有的 mandis 打点代码（`api.ts`、`qwenVlAnalyzer.ts`、`biTracking.ts`）
- 不修改 `BiAnalyticsComponent` 核心逻辑（队列、批量写入不变）
- 不涉及前端 Dashboard（由 Change 2 `bi-dashboard-integration` 负责）

## Capabilities

### New Capabilities

- `bi-aggregation-engine`：聚合管道 + 定时调度，将原始事件转化为可查询的指标表
- `bi-query-api`：RESTful 查询接口，支持按 appName/eventType/时间范围/粒度查询
- `begreat-bi-integration`：begreat 后端接入通用 BI 追踪体系

### Modified Capabilities

- `bi-analytics`：spec 中定义的聚合和查询需求从"计划中"变为"已实现"；新增 `client_event` 事件类型

## Impact

**新增文件**：
- `src/component/BiAggregator.ts` — 聚合引擎（~250 行）
- `src/jobs/BiAggregationJob.ts` — 定时任务调度（~80 行）
- `src/apps/bi/BiAnalyticsService.ts` — 查询服务层（~350 行）
- `src/apps/mandis/miniapp/routes/bi.ts` — BI 查询路由（~120 行）

**修改文件**：
- `src/apps/begreat/front.ts` — 注册 BiAnalyticsComponent（+8 行）
- `src/apps/begreat/miniapp/server.ts` — 挂载 biTrackingMiddleware（+3 行）
- `src/entity/biEvent.entity.ts` — 新增 client_event 事件类型（+15 行）

**依赖**：
- 新增 npm 依赖：`cron`、`@types/cron`（定时任务）
- 无破坏性变更：所有现有接口和打点逻辑不变

**部署**：
- begreat 后端需重启以加载新注册的组件和中间件
- mandis 后端需重启以加载新路由 `/api/bi/*`
- MongoDB 索引已存在于 entity 定义中，无需额外迁移
