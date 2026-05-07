# Design: BI Dashboard 集成（art_web + begreat_frontend）

## Context

Change 1 (`bi-aggregation-api`) 完成后，后端 BI 系统具备完整能力：
- `bi_metrics_hourly` / `bi_metrics_daily` 聚合表有持续数据写入
- 6 个 REST 端点 (`/api/bi/*`) 可查询指标、趋势、错误、成本、性能
- `POST /api/bi/client-event` 可接收前端事件
- begreat 后端已接入 BI 追踪

本变更（Change 2）负责消费层的实现——两个管理后台的前端 Dashboard 改造 + 客户端 BI SDK。

关键约束：
- `art_web`：React 19 + Vite + Tailwind CSS + react-router-dom v7，当前仅 3 个 npm 依赖（lucide-react, react, react-dom, react-router-dom），极度轻量
- `begreat_frontend`：React + Vite + Ant Design 5 + @ant-design/plots + axios + zustand，已有完整的后台管理框架
- 两个项目**技术栈不同**（Tailwind vs Ant Design），共享纯逻辑（hooks/utils）但不共享 UI 组件
- mandis 后端和 begreat 后端各自提供 `/api/bi/*` 端点（先只 mandis 实现；begreat 在 Change 1 任务 7 中接入）

## Goals / Non-Goals

**Goals:**
- art_web：在现有 Admin Dashboard（`DashboardPage.tsx`）中新增 BI 监控模块，保留现有业务统计卡片
- begreat_frontend：在现有 Dashboard（`Dashboard/index.tsx`）中新增系统性能 + 成本分析面板
- 实现前端 BI SDK——`src/utils/bi.ts`，提供页面浏览自动追踪、手动打点、错误捕获
- 实现共享 Hook——`useDashboard`（统一管理业务 API + BI API 的数据聚合）
- 两个 Dashboard 不破坏现有功能，BI 数据以"新增面板"形式嵌入

**Non-Goals:**
- 不替换现有业务 KPI 卡片（保留各项目的业务特有指标）
- 不实现实时 WebSocket 推送（轮询 60s 足够）
- 不修改后端 `/api/bi/*` 的响应格式
- 不在小程序（art_app / mandis）中实现 Dashboard——仅 Web 后台

## Decisions

### D1：图表库选择——art_web 用 Recharts，begreat_frontend 沿用 @ant-design/plots

**选择：** art_web 安装 `recharts`（轻量，2 个依赖），begreat_frontend 继续使用已安装的 `@ant-design/plots`。

**原因：**
- art_web 当前仅有 3 个依赖（lucide-react + react + react-dom + react-router-dom），无 UI 框架，Tailwind 做样式。引入 Ant Design 会带 40+ 依赖，违背 art_web 的极简定位
- Recharts 仅依赖 `d3-shape` + `d3-scale`，安装体积 < 100KB gzipped，与 Tailwind 风格兼容
- begreat_frontend 已有 Ant Design + @ant-design/plots 的完整生态，新增图表无需额外依赖

| 项目 | 图表库 | 理由 |
|------|--------|------|
| art_web | Recharts | 轻量，与 Tailwind 栈匹配，不需要 UI 框架 |
| begreat_frontend | @ant-design/plots | 已安装，与 Ant Design 生态一致 |

**权衡：** 两套图表库意味着共享代码只到 Hook 层，UI 组件各自实现。但两个项目的样式体系本就不同（Tailwind vs Ant Design），UI 层共享本就不现实。

---

### D2：前端 BI SDK 架构——轻量工具模块，不引入第三方埋点库

**选择：** 新建 `src/utils/bi.ts`，纯函数模块，不依赖任何第三方库。

```typescript
// 核心 API
bi.init({ appName: 'art_web', apiBase: '/api/bi' })
bi.trackPageView(page: string)           // 路由切换时调用
bi.trackAction(action: string, meta?: {}) // 按钮点击时调用
bi.trackError(error: Error)              // ErrorBoundary 中调用
```

**实现细节：**
- 使用 `navigator.sendBeacon()` 发送事件（页面卸载时也不丢数据）
- 降级到 `fetch` keepalive（sendBeacon 不可用时）
- 内部维护请求队列（最多缓存 10 条，超出时批量发送）
- 自动收集 `userAgent`、`screenResolution`、`timestamp`（客户端时间，服务端以接收时间为准）

**原因：**
- 需求简单（3 种事件类型），不需要引入 Google Analytics / 百度统计等级别的 SDK
- `sendBeacon` 是 W3C 标准，所有现代浏览器支持
- 纯函数模块可被 art_web 和 begreat_frontend 直接复制使用（或后续提升为共享 npm 包）

---

### D3：数据获取策略——React Query（begreat）vs 手动 useEffect（art_web）

**选择：** begreat_frontend 可选安装 `@tanstack/react-query`（如果团队认可），art_web 使用手动 `useEffect` + `setInterval` 轮询。

**原因：**
- React Query 提供缓存、去重、后台刷新、错误重试，但引入新依赖需要团队共识
- art_web 的 Dashboard 数据源简单（2-3 个 API），手动 `useEffect` 足够，不引入新依赖
- 如果 begreat_frontend 团队不接受新依赖，则退回到手动轮询——两种方式都定义在 `useDashboard` Hook 内部，外部接口不变

**默认方案：** 两个项目都使用手动 `useEffect` + 60s 轮询，`useDashboard` Hook 封装此逻辑。后续可替换内部实现为 React Query 而不改 Hook 接口。

---

### D4：Dashboard 布局——混合模式（业务指标 + BI 监控分区）

**选择：** 不替换现有 Dashboard，在现有页面中新增 BI 监控分区。

**art_web 布局：**
```
┌────────────────────────────────────────┐
│  业务概览 (现有，不改)                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │用户数│ │作品数│ │反馈  │ │...   │  │  ← 保留
│  └──────┘ └──────┘ └──────┘ └──────┘  │
├────────────────────────────────────────┤
│  BI 系统监控 (新增)                     │
│  ┌──────────────┐ ┌──────────────┐     │
│  │ 趋势折线图   │ │ 错误 Top5    │     │
│  └──────────────┘ └──────────────┘     │
│  ┌──────────────┐ ┌──────────────┐     │
│  │ Qwen 成本    │ │ API 性能     │     │
│  └──────────────┘ └──────────────┘     │
└────────────────────────────────────────┘
```

**begreat_frontend 布局：**
```
┌────────────────────────────────────────┐
│  KPI 卡片 (现有，不改)                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │新增  │ │完成  │ │转化率│ │收入  │  │  ← 保留
│  └──────┘ └──────┘ └──────┘ └──────┘  │
├────────────────────────────────────────┤
│  BI 系统监控 (新增)                     │
│  ┌──────────────────────────────────┐  │
│  │ API 性能 + 错误率 趋势 (Line)    │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────┐ ┌──────────────┐     │
│  │ Qwen Token   │ │ 上传量统计   │     │
│  │ 用量/成本    │ │              │     │
│  └──────────────┘ └──────────────┘     │
└────────────────────────────────────────┘
```

**原因：**
- 业务指标（用户数、作品数、付费转化率）是运营日常关注的核心，不应被替换
- BI 监控指标（API 性能、错误率、成本）是技术运维视角，补充而非替代
- 两个项目的业务指标完全不同（art_web 关注作品和反馈，begreat 关注测评和支付），BI 通用指标作为公共层叠加

---

### D5：品牌适配——遵循各项目的设计系统

| 项目 | 设计系统 | BI 组件样式 |
|------|---------|-------------|
| art_web | Tailwind + 品牌色 tokens（navy/pink/teal） | 使用 CSS 变量 `--color-*`，与现有页面一致 |
| begreat_frontend | Ant Design 5 theme tokens | 使用 `antd` 默认主题，与现有后台一致 |

**原因：** art_web 有明确的品牌设计规范（CLAUDE.md 中定义），BI Dashboard 作为管理后台的一部分应遵循同一套视觉语言。

---

### D6：共享代码策略——复制优于抽象

**选择：** `useDashboard` Hook 和 `bi.ts` SDK 在两个项目中分别实现（允许微小差异），不创建共享 npm 包或 monorepo 引用。

**原因：**
- 两个项目已有独立的 `src/api/` 层（art_web 用 fetch，begreat_frontend 用 axios），强行统一会增加适配成本
- BI SDK 核心逻辑 < 80 行，复制维护成本低于抽象共享层
- 后续如果出现第三个项目需要 BI SDK，再提升为 `@art/bi-sdk` npm 包

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| art_web 安装 Recharts 增加 bundle 大小 | Recharts tree-shaking 友好，Dashboard 页面懒加载 (`React.lazy`) |
| 两个项目的 BI 组件 UI 不一致 | 各自遵循本项目的设计系统，不一致是可接受的——用户不会同时打开两个后台 |
| `useDashboard` 轮询增加后端负载 | 60s 间隔，预估 QPS < 0.02/用户，后端聚合表查询 < 500ms |
| 前端 SDK 的 `sendBeacon` 在某些浏览器不可用 | 降级到 `fetch` keepalive，再降级到普通 `fetch` |
| begreat 后端 BI API 尚未部署（Change 1 依赖） | begreat_frontend 的 BI 面板初始状态显示"数据收集中"，API 可用后自动显示 |

## Migration Plan

1. **安装依赖**：art_web 安装 `recharts`；begreat_frontend 无新增依赖
2. **实现前端 SDK**：在两个项目中分别创建 `src/utils/bi.ts`
3. **实现 useDashboard Hook**：分别创建，适配各项目的 API 层
4. **改造 art_web Dashboard**：在 `DashboardPage.tsx` 中新增 BI 监控分区（懒加载）
5. **改造 begreat_frontend Dashboard**：在 `Dashboard/index.tsx` 中新增 BI 面板
6. **验证**：确认两个 Dashboard 的 BI 数据从 `/api/bi/dashboard` 正确加载
7. **部署**：前端 `npm run build`，Nginx 静态伺服，无后端变更

**回滚**：删除 BI 分区的 JSX 代码即可恢复原 Dashboard，不影响业务指标展示。
