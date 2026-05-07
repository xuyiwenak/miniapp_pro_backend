## 1. art_web：项目准备

- [ ] 1.1 安装 Recharts：`cd art_web && npm install recharts`
- [ ] 1.2 验证 TypeScript 编译通过，确认 Recharts 类型定义可用

## 2. art_web：前端 BI SDK

- [ ] 2.1 新建 `art_web/src/utils/bi.ts`——实现 `init()`、`trackPageView()`、`trackAction()`、`trackError()`
- [ ] 2.2 `trackPageView(page)` 使用 `navigator.sendBeacon` 发送 `{ eventSubType: 'page_view', page }` 到 `POST /api/bi/client-event`
- [ ] 2.3 `trackAction(action, meta?)` 发送 `{ eventSubType: 'user_action', action, ...meta }`
- [ ] 2.4 `trackError(error)` 发送 `{ eventSubType: 'client_error', errorMessage, errorStack }`，stack 截断至 500 字符
- [ ] 2.5 实现 `sendBeacon` 降级策略：sendBeacon → fetch keepalive → 普通 fetch
- [ ] 2.6 实现内存请求队列（最多缓存 10 条，超过时批量发送）
- [ ] 2.7 在 `main.tsx` 中调用 `bi.init({ appName: 'art_web', apiBase: '/api/bi' })`

## 3. art_web：路由级页面追踪

- [ ] 3.1 在 `App.tsx` 中使用 `useLocation` 监听路由变化，每次变化调用 `bi.trackPageView(location.pathname)`
- [ ] 3.2 实现 ErrorBoundary 组件，在 `componentDidCatch` 中调用 `bi.trackError(error)`
- [ ] 3.3 在 `App.tsx` 中包裹 ErrorBoundary

## 4. art_web：useDashboard Hook

- [ ] 4.1 新建 `art_web/src/hooks/useDashboard.ts`
- [ ] 4.2 实现 `useBiDashboard(timeRange, appName?)` ——调用 `GET /api/bi/dashboard`，60s 自动轮询
- [ ] 4.3 返回 `{ overview, qwenCosts, topErrors, recentActivity, isLoading, error }`
- [ ] 4.4 实现 `useBiTrends(timeRange, appName?)` ——调用 `GET /api/bi/trends`
- [ ] 4.5 Hook 内部处理 loading/error/data 三态

## 5. art_web：BI 组件库

- [ ] 5.1 新建 `art_web/src/components/bi/MetricsCard.tsx`——Tailwind 卡片，标题 + 数值 + 趋势箭头（↑/↓），使用品牌色 `--color-navy` 背景
- [ ] 5.2 新建 `art_web/src/components/bi/TrendChart.tsx`——Recharts `<LineChart>`，显示 totalEvents + successRate 双 Y 轴
- [ ] 5.3 新建 `art_web/src/components/bi/ErrorTable.tsx`——简易表格，列：errorCode / count / rate，Top 5
- [ ] 5.4 新建 `art_web/src/components/bi/CostPieChart.tsx`——Recharts `<PieChart>`，按 model 分组显示 Qwen 成本占比
- [ ] 5.5 新建 `art_web/src/components/bi/BiDashboardSection.tsx`——组合上述组件的整体布局，接收 `timeRange` prop

## 6. art_web：改造 DashboardPage

- [ ] 6.1 修改 `art_web/src/pages/admin/DashboardPage.tsx`——在现有业务 Stats 卡片下方挂载 `<BiDashboardSection timeRange="7d" />`
- [ ] 6.2 BI 分区使用 `React.lazy` 懒加载（`const BiDashboardSection = lazy(() => import('...'))`），减少首屏 bundle
- [ ] 6.3 添加 Loading 骨架屏（Suspense fallback）
- [ ] 6.4 如果 BI API 不可用（如后端未部署），BI 分区显示"监控数据收集中"空状态，不影响业务卡片

## 7. begreat_frontend：项目准备

- [ ] 7.1 无需安装新依赖（@ant-design/plots 已安装）
- [ ] 7.2 评估是否引入 `@tanstack/react-query`——如果团队拒绝，使用手动轮询方案

## 8. begreat_frontend：前端 BI SDK

- [ ] 8.1 复制 `art_web/src/utils/bi.ts` 到 `begreat_frontend/src/utils/bi.ts`
- [ ] 8.2 修改 `bi.init({ appName: 'begreat_frontend', apiBase: '/begreat-admin/bi' })`（注意 begreat 的 API base 不同）
- [ ] 8.3 在 `main.tsx` 中调用 init
- [ ] 8.4 在路由切换和 ErrorBoundary 中接入追踪（参照 art_web 任务 3.1-3.3）

## 9. begreat_frontend：useDashboard Hook

- [ ] 9.1 新建 `begreat_frontend/src/hooks/useDashboard.ts`
- [ ] 9.2 适配 begreat 的 API 层（使用 `dashboardApi` 而非直接 fetch）
- [ ] 9.3 实现与 art_web 相同的 Hook 接口：`useBiDashboard`、`useBiTrends`
- [ ] 9.4 60s 自动轮询，处理 loading/error/data 三态

## 10. begreat_frontend：BI 组件

- [ ] 10.1 新建 `begreat_frontend/src/components/bi/ApiPerformanceCard.tsx`——Ant Design `<Card>` + @ant-design/plots `<Line>`
- [ ] 10.2 新建 `begreat_frontend/src/components/bi/QwenCostPanel.tsx`——Ant Design `<Card>` + `<Column>` 柱状图，显示每日 token 用量和成本
- [ ] 10.3 新建 `begreat_frontend/src/components/bi/UploadStatsPanel.tsx`——上传统计面板（文件类型 + 大小分布）
- [ ] 10.4 新建 `begreat_frontend/src/components/bi/BiMonitorSection.tsx`——组合上述组件

## 11. begreat_frontend：改造 Dashboard 页面

- [ ] 11.1 修改 `begreat_frontend/src/pages/Dashboard/index.tsx`——在现有 KPI 卡片 + 趋势图下方挂载 `<BiMonitorSection />`
- [ ] 11.2 BI 监控分区使用折叠面板（Ant Design `<Collapse>`），默认展开，运营人员可按需收起
- [ ] 11.3 如果 BI API 不可用，显示 Ant Design `<Alert type="info" message="系统监控数据收集中，请稍后刷新" />`

## 12. 验证

- [ ] 12.1 art_web：打开 `/admin/dashboard`，确认业务统计卡片正常显示，BI 分区有数据（或显示"数据收集中"）
- [ ] 12.2 art_web：在浏览器控制台执行 `fetch('/api/bi/client-event', { method: 'POST', body: JSON.stringify({ eventSubType: 'page_view', page: '/test' }), headers: { 'Content-Type': 'application/json' } })`，确认 200 返回
- [ ] 12.3 art_web：导航到不同页面，在 Network 面板确认 `client-event` 请求已发送
- [ ] 12.4 art_web：触发一个 JS 错误（如访问 undefined.property），确认错误事件已发送
- [ ] 12.5 begreat_frontend：打开 `/dashboard`，确认 BI 监控面板显示（或显示"数据收集中"）
- [ ] 12.6 begreat_frontend：确认路由切换时 client-event 已发送到 begreat 后端

## 13. 文档

- [ ] 13.1 更新 art_web README.md——说明 BI Dashboard 功能和使用方式
- [ ] 13.2 更新 begreat_frontend README.md——同上
