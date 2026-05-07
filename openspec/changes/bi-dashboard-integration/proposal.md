## Why

当前 `art_web` 和 `begreat_frontend` 的管理后台 Dashboard 分别维护独立的统计逻辑和 UI，缺乏系统级监控能力（API 性能、错误分析、成本追踪）。通用 BI 模块（`bi-analytics`）已提供完整的数据采集和分析能力，但前端尚未集成。本次变更将完全替换现有 Dashboard，统一使用 BI 模块，实现标准化的数据可视化和监控能力。

## What Changes

- **替换 art_web Dashboard**：用 BI 模块驱动的新 Dashboard 替换 `/src/pages/admin/DashboardPage.tsx`，支持业务指标 + 系统监控 + 错误分析
- **替换 begreat_frontend Dashboard**：用 BI 模块驱动的新 Dashboard 替换 `/src/pages/Dashboard/index.tsx`，保留业务特定指标，新增系统性能和成本分析
- **安装依赖**：为 `art_web` 安装 `@ant-design/plots` 或 `recharts` 图表库
- **新增 API 集成**：前端调用 `/api/bi/*` 系列接口（dashboard、metrics、trends、errors、costs）
- **共享组件库**：提取可复用的 Dashboard 组件（MetricsCard、TrendChart、ErrorTable 等）
- **数据聚合 Hook**：实现 `useDashboard` Hook 统一管理业务 API + BI API 数据获取

## Capabilities

### New Capabilities
- `frontend-bi-integration`: 前端集成通用 BI 模块的标准方案，包括 API 调用、数据聚合、图表组件、缓存策略

### Modified Capabilities
- `bi-analytics`: 可能需要调整 API 响应格式以适配前端需求（如添加时间范围预设、appName 过滤优化）

## Impact

**代码影响**：
- `art_web/src/pages/admin/DashboardPage.tsx` - 完全重写
- `begreat_frontend/src/pages/Dashboard/index.tsx` - 完全重写
- 新增 `shared/hooks/useDashboard.ts` - 跨项目复用
- 新增 `shared/components/dashboard/*` - 可复用组件

**API 影响**：
- 依赖后端 BI API（`/api/bi/dashboard`, `/api/bi/metrics` 等）需已实现
- 现有业务 API（`/admin/stats`, `/begreat-admin/dashboard/stats`）保持不变，作为补充数据源

**用户影响**：
- Dashboard UI 完全重构，需要用户适应新界面
- 提供更丰富的监控能力（系统性能、错误分析、成本可见性）
- 可能需要管理员培训文档

**依赖**：
- `@ant-design/plots` (begreat_frontend 已安装, art_web 需安装)
- `react-query` 或 `swr` (推荐用于数据缓存和刷新)
- 后端 BI 模块的 aggregation jobs 需正常运行
