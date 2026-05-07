## 1. 聚合引擎：BiAggregator

- [ ] 1.1 新建 `src/component/BiAggregator.ts`，实现 `BiAggregator` 类（遵循 IBaseComponent 接口）
- [ ] 1.2 实现 `aggregateHourly(periodStart, periodEnd)` 方法——从 `bi_events` 按 (appName, eventType) 分组聚合，MongoDB aggregation pipeline 使用 `$group` + `$cond` 分别计算三类子指标
- [ ] 1.3 实现性能分位数计算——收集 `durationMs` 数组到内存，排序后取 P50/P95/P99（MongoDB 聚合不支持分位数）
- [ ] 1.4 实现子指标计算——upload 类（totalBytes, avgBytes, contentTypes Map）、qwen 类（totalTokens, totalCost, models Map）、api 类（endpoints Map, statusCodes Map, requestBytes, responseBytes）
- [ ] 1.5 实现 `aggregateHourlyForType(appName, eventType, periodStart, periodEnd)` ——单类型聚合，`updateOne` upsert 到 `bi_metrics_hourly`，totalEvents=0 时跳过
- [ ] 1.6 实现 `aggregateDaily(periodStart, periodEnd)` 方法——从 `bi_metrics_hourly` 汇总 24 条小时记录，加权平均 duration，Map 合并 contentTypes/models/endpoints
- [ ] 1.7 实现辅助方法——`percentile(arr, p)`、`countOccurrences(arr)`、`mergeMaps(maps[])`
- [ ] 1.8 处理边界——无事件时跳过、空 duration 数组时返回 0、`$$REMOVE` 处理非本类型的子指标

## 2. 定时调度：BiAggregationJob

- [ ] 2.1 新建 `src/jobs/BiAggregationJob.ts`，使用 `node-cron` 库
- [ ] 2.2 配置小时聚合 Cron——`*/5 * * * *`（每 5 分钟），聚合 periodStart = 上一个完整小时，periodEnd = 当前整点
- [ ] 2.3 配置日聚合 Cron——`0 1 * * *`（每天 01:00 UTC+8 = Asia/Shanghai），聚合 periodStart = 昨天 00:00，periodEnd = 今天 00:00
- [ ] 2.4 Cron 执行时 try-catch，失败记录 `gameLogger.error`，连续失败 5 次时输出告警日志
- [ ] 2.5 在 `front.ts` 中实例化并启动——`environment !== 'test'` 时调用 `job.start()`
- [ ] 2.6 实现 `stop()` 方法——停止所有 Cron 任务，在进程退出时调用

## 3. 后端依赖：安装 node-cron

- [ ] 3.1 `cd art_backend && npm install cron @types/cron`
- [ ] 3.2 验证 TypeScript 编译通过

## 4. 查询服务层：BiAnalyticsService

- [ ] 4.1 新建 `src/apps/bi/BiAnalyticsService.ts`，构造函数接受 Mongoose Models（BiEvent, BiMetricsHourly, BiMetricsDaily）
- [ ] 4.2 实现 `queryTrends(startTime, endTime, granularity, metrics, appName?, eventType?)` ——查聚合表，返回时间序列数组，计算 successRate
- [ ] 4.3 实现 `queryErrorAnalysis(startTime, endTime, appName?, limit?)` ——查 `bi_events` 聚合（按 `data.errorCode` 分组），过滤 status=failed，返回 Top N 错误及影响用户数
- [ ] 4.4 实现 `queryCostAnalysis(startTime, endTime, appName?, groupBy)` ——查 `bi_events`（eventType=qwen_analyze, status=success），按 model/天/小时分组，返回 totalCost + totalTokens + breakdown
- [ ] 4.5 实现 `queryPerformanceAnalysis(startTime, endTime, appName?, eventType?)` ——查 `bi_events` 收集 durationMs，内存计算 P50/P95/P99
- [ ] 4.6 实现 `queryUploadStats(startTime, endTime, appName?)` ——查 `bi_events`（eventType=upload_file, status=success），统计 contentTypes 分布、文件大小分布
- [ ] 4.7 实现 `getDashboardSummary(timeRange, appName?)` ——并行查询 overview（totalEvents/totalUsers/successRate/avgResponseTime）、costs、topErrors、recentActivity
- [ ] 4.8 所有方法优先查聚合表（hourly/daily），仅在需要细粒度数据（如具体 errorCode、contentType 分布）时查原始 `bi_events`

## 5. REST 端点：routes/bi.ts

- [ ] 5.1 新建 `src/apps/mandis/miniapp/routes/bi.ts`，Express Router
- [ ] 5.2 实现 `GET /api/bi/metrics` ——Zod 校验 `startTime`(ISO 8601)、`endTime`、`granularity`("hourly"|"daily")、可选 `appName`、`eventType`；调用 `service.queryMetrics()`
- [ ] 5.3 实现 `GET /api/bi/trends` ——Zod 校验参数同上 + `metrics`(string[])，默认 `['totalEvents','successRate','avgDurationMs']`；调用 `service.queryTrends()`
- [ ] 5.4 实现 `GET /api/bi/errors` ——Zod 校验 `startTime`、`endTime`、可选 `appName`、`limit`(默认 20)；调用 `service.queryErrorAnalysis()`
- [ ] 5.5 实现 `GET /api/bi/costs` ——Zod 校验 `startTime`、`endTime`、可选 `appName`、`groupBy`("hour"|"day"|"model")；调用 `service.queryCostAnalysis()`
- [ ] 5.6 实现 `GET /api/bi/performance` ——Zod 校验 `startTime`、`endTime`、可选 `appName`、`eventType`；调用 `service.queryPerformanceAnalysis()`
- [ ] 5.7 实现 `GET /api/bi/dashboard` ——Zod 校验 `timeRange`(如 "7d"/"24h"/"30d")、可选 `appName`；调用 `service.getDashboardSummary()`
- [ ] 5.8 所有端点返回统一格式 `{ code: 200, data: ... }`，参数校验失败返回 `{ code: 400, message: ... }`
- [ ] 5.9 所有端点使用 `authMiddleware`（admin level ≥ 1）

## 6. 前端 client-event 端点

- [ ] 6.1 在 `biEvent.entity.ts` 中新增 `EVENT_TYPE_CLIENT_EVENT = 'client_event'` 及 `EventType` 联合类型
- [ ] 6.2 新增 `IClientEventData` 接口——`eventSubType`（page_view/user_action/client_error）、`page`、`action`、`errorMessage`、`errorStack`、`durationMs`
- [ ] 6.3 在 `routes/bi.ts` 中实现 `POST /api/bi/client-event` ——接受 `{ eventSubType, ... }` 的 JSON body，通过 `BiAnalyticsComponent.track()` 写入；不强制鉴权，但记录 IP
- [ ] 6.4 端点的 `eventId` 由服务端生成（不信任客户端），`timestamp` 取服务端时间

## 7. begreat 后端 BI 接入

- [ ] 7.1 修改 `src/apps/begreat/front.ts`——`import { BiAnalyticsComponent }`，实例化并 `init({ appName: 'begreat', ... })`，注册到 ComponentManager
- [ ] 7.2 修改 `src/apps/begreat/miniapp/server.ts`——`import { biTrackingMiddleware }`，在 `setupCommonMiniappApp` 之后、路由之前挂载 `app.use(biTrackingMiddleware)`
- [ ] 7.3 修改 `src/apps/begreat/front.ts`——注册 `BiAggregationJob`（与 mandis 共享同一个 aggregator 实例或创建新实例）

## 8. 注册与启动

- [ ] 8.1 在 `src/apps/mandis/front.ts` 中注册 `BiAggregationJob`（如果尚未注册）
- [ ] 8.2 在 `src/apps/mandis/miniapp/server.ts` 中挂载 `routes/bi.ts`——`app.use('/api/bi', biRoutes)`
- [ ] 8.3 确认 `bi_metrics_hourly` 和 `bi_metrics_daily` 的 Mongoose Model 已在启动时自动创建索引

## 9. 验证

- [ ] 9.1 部署后等待 5 分钟，查询 `bi_metrics_hourly` 确认有数据写入且 `appName` 包含 'mandis' 和 'begreat'
- [ ] 9.2 调用 `GET /api/bi/dashboard?timeRange=7d` 验证返回结构正确
- [ ] 9.3 调用 `GET /api/bi/errors` 验证错误分析能查到 `api.ts` 中的上传失败事件
- [ ] 9.4 调用 `GET /api/bi/costs` 验证能查到 qwen_analyze 的成本数据
- [ ] 9.5 调用 `POST /api/bi/client-event` 发送一条 `page_view` 事件，查询 `bi_events` 确认写入
- [ ] 9.6 对 begreat 后端发起一个 API 请求（如 `GET /begreat-admin/dashboard/stats`），查询 `bi_events` 确认 `appName: 'begreat'` 的事件已记录
