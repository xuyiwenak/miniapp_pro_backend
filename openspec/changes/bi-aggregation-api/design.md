# Design: BI 聚合引擎 + 查询 API

## Context

BI 系统当前架构分为四层——采集层（BiAnalyticsComponent + 中间件）已完成，存储层（bi_events/bi_metrics entity + MongoDB 索引）已完成，聚合层和分析层待实现。本变更补齐后两层。

关键约束：
- mandis 和 begreat 共享同一个 MongoDB 数据库（`art_backend`），`bi_events` 通过 `appName` 字段区分来源
- mandis 使用 `ComponentManager` 注册组件，begreat 也使用同一套 IBaseComponent 体系
- 现有 `BiAnalyticsComponent` 是单例模式（每个 app 注册一个实例），聚合和查询需要跨 app 工作
- spec 定义了性能目标：聚合 < 10s（小时）/ < 60s（天），查询 < 500ms（7 天范围）

## Goals / Non-Goals

**Goals:**
- 实现 BiAggregator：从 `bi_events` 聚合到 `bi_metrics_hourly`，再从 `bi_metrics_hourly` 汇总到 `bi_metrics_daily`
- 实现 BiAggregationJob：Cron 定时调度，小时聚合每 5 分钟执行，日聚合每天凌晨执行
- 实现 BiAnalyticsService：6 个查询方法，优先查聚合表（快），降级查原始事件表（慢但准确）
- 实现 6 个 REST 端点，admin JWT 鉴权，Zod 参数校验
- begreat 后端接入 BI：注册组件 + 挂载中间件

**Non-Goals:**
- 不实现实时聚合（事件插入时触发）—— Cron 方案更简单，5 分钟延迟可接受
- 不实现数据归档到 S3/OSS（spec 中提及但非当前优先级）
- 不实现 Prometheus 指标暴露（独立的可观测性变更）
- 不实现前端 Dashboard（Change 2）
- 不实现 decorator 打点方式（当前环境以 Express 中间件 + 手动调用为主）

## Decisions

### D1：聚合策略——Cron 定时 vs 事件触发

**选择：** Cron 定时任务（小时聚合每 5 分钟，日聚合每天 01:00 UTC+8）。

**原因：**
- 当前事件量级（预估 < 1000/分钟）不需要实时聚合
- Cron 方案实现简单：`node-cron` 单库依赖，无需分布式锁
- 5 分钟延迟对 Dashboard 场景完全可接受（Dashboard 按分钟刷新已足够）
- 聚合失败不影响事件采集，下次 Cron 触发时重试

**放弃方案：** 事件触发（每次 `insertMany` 后触发聚合）——耦合采集和聚合，聚合失败可能阻塞采集；高并发时需要分布式锁防重。

---

### D2：日聚合数据源——小时表 vs 原始事件

**选择：** 从 `bi_metrics_hourly` 汇总到 `bi_metrics_daily`（如 spec 所定义）。

**原因：**
- 小时表 < 8760 行/年（24h × 365d），日聚合只需扫描 24 行小时记录
- 从原始事件聚合需要扫描全天数万条记录，违背聚合分层的目的
- 加权平均的计算（avgDurationMs = Σ(hourly.avgDurationMs × hourly.totalEvents) / ΣtotalEvents）语义正确

**权衡：** uniqueUsers 和 uniqueSessions 跨小时去重需要从原始事件重算，但当前数据量下误差可接受（小时表已记录独立计数，日表求和近似）。后续若需精确去重，在日聚合时单独查原始事件。

---

### D3：查询架构——Service 层位于路由和 MongoDB 之间

**选择：** 新建 `src/apps/bi/BiAnalyticsService.ts` 作为查询服务层，路由文件只负责参数校验和响应格式化。

```
routes/bi.ts               ← Zod 校验 + JSON 响应
    ↓
BiAnalyticsService         ← 查询策略（优先聚合表 → 降级原始表）
    ↓
Mongoose Models            ← BiMetricsHourly / BiMetricsDaily / BiEvent
```

**原因：**
- Service 层可被多个路由模块复用（mandis 和 begreat 后端可以用同一套查询逻辑）
- 查询策略（聚合表优先 / 降级逻辑）封装在 Service 内，路由不感知
- 方便单元测试——Service 可 mock Mongoose Model

---

### D4：API 鉴权——复用现有 admin JWT 中间件

**选择：** BI 查询端点使用 mandis 现有的 `authMiddleware`（JWT 校验 + level 检查）。

```
mandis:  GET /api/bi/*  →  authMiddleware → level ≥ 1 (admin)
begreat: GET /api/bi/*  →  adminJwtAuth → (独立的 admin JWT)
```

**原因：**
- mandis 已有 `authMiddleware`，验证 `req.userId` 和 level，admin level ≥ 1
- begreat 已有独立 admin JWT 体系（`adminJwtAuth` 中间件），无需新建
- 两个 app 的 BI 查询路由复用同一个 `BiAnalyticsService`，只在不同 app 的 server.ts 中挂载各自的鉴权中间件

**注意：** Phase 4a 先在 mandis 实现 BI 路由（mandis 是当前唯一有聚合数据的 app）。begreat 的 BI 路由在 Change 2 阶段随 Dashboard 一起接入。

---

### D5：begreat 接入方式——复用现有组件，不创建新类型

**选择：** begreat 使用与 mandis 完全相同的 `BiAnalyticsComponent` 类，仅 `init()` 时传入不同的 `appName: 'begreat'`。

**原因：**
- `BiAnalyticsComponent` 的 `appName` 是配置参数，不是硬编码——设计上已支持多 app
- 每个 app 注册独立实例，各自维护事件队列和批量写入定时器
- 共享同一个 MongoDB `bi_events` 集合，通过 `appName` 字段区分来源

---

### D6：聚合失败处理——静默重试，不阻塞

**选择：** 聚合失败时记录错误日志，在下一个 Cron 周期自动重试。连续失败 5 次后输出告警日志。

**原因：**
- 聚合是幂等操作（upsert by `{appName, eventType, periodStart}`），重试安全
- 不应因聚合失败影响事件采集（采集层和聚合层完全解耦）
- 当前运维环境无钉钉/企微告警通道，告警先走日志，后续接入

---

### D7：client_event 事件类型——前端埋点的后端接收

**选择：** 新增 `client_event` 事件类型，定义三种子类型：`page_view`、`user_action`、`client_error`。通过 `POST /api/bi/client-event` 接收。

```typescript
interface IClientEventData {
  eventSubType: 'page_view' | 'user_action' | 'client_error';
  page?: string;               // page_view: 页面路径
  action?: string;              // user_action: 按钮/操作名称
  errorMessage?: string;        // client_error: 错误消息
  errorStack?: string;          // client_error: 堆栈（截断至 500 字符）
  durationMs?: number;          // page_view: 页面停留时长
}
```

**原因：**
- 前端事件量可能远大于后端（每次路由切换 + 按钮点击），需要独立的端点避免影响 API 请求追踪
- `navigator.sendBeacon` + 独立的轻量端点，不阻塞页面卸载
- 为 Change 2 的前端 SDK 提供接收端

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 聚合任务在 begreat 无数据时仍运行（空转） | BiAggregator 检测到 `totalEvents === 0` 时跳过 upsert |
| Cron 任务在开发环境也运行 | `BiAggregationJob.start()` 仅在 `environment !== 'test'` 时启动 |
| `node-cron` 在 PM2 多实例下重复执行 | 当前单进程部署，风险极低；后续多实例时需加 Redis 分布式锁 |
| daily 聚合首次运行时历史小时数据可能不全 | 日聚合只依赖已有小时数据，缺数据的天份指标为 0，前端展示时标注"数据收集中" |
| client_event 端点可能被滥用（无鉴权刷数据） | 端点使用 `biTrackingMiddleware` 的匿名化逻辑，不强制鉴权但记录 IP；前端 SDK 在后续迭代加 token 校验 |

## Migration Plan

1. **部署 BiAggregator + BiAggregationJob**：在 mandis 和 begreat 的 `front.ts` 中各注册一个 `BiAggregationJob` 实例（或使用共享的单例）
2. **首次运行**：部署后首次 Cron 触发时，聚合上一个完整小时的数据。历史数据不回溯（成本高于价值）
3. **验证**：部署 5 分钟后查询 `bi_metrics_hourly` 确认有数据写入
4. **部署 BI 查询路由**：mandis 新增 `routes/bi.ts` 并挂载到 server.ts
5. **部署 begreat 接入**：修改 `front.ts` + `server.ts`，重启 begreat 后端
6. **回滚**：删除新路由注册和 Cron 任务启动，不影响现有打点

**数据库迁移**：无需——`bi_metrics_hourly` 和 `bi_metrics_daily` 的索引已在 entity 定义中通过 Mongoose 自动创建。
