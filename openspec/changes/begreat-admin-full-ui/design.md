## Context

commander 是统一管理后台，BeGreat 子区域此前从 begreat-admin-panel change 迁移而来，共实现了测评/支付/邀请/配置/职业共 6 个页面。用户管理相关的后端 API（`/begreat-admin/users` 和 `/begreat-admin/users/:openId/timeline`）已在后端完整实现，但前端页面从未建立。同时随着页面数量增加，侧边栏导航已有 6 个扁平项，可读性下降。

## Goals / Non-Goals

**Goals:**
- 建立 BeGreat 用户管理前端（列表 + 时间线详情）
- 重组 BeGreat 侧边导航为分层结构，运营类页面收入"运营支持"折叠分组
- 修复已有页面中路由跳转路径错误（3处 bug）
- TypeScript 编译零报错

**Non-Goals:**
- 不新增后端 API
- 不实现常模管理页（后端无对应 API）
- 不修改 Mandis 区域
- 不改变认证逻辑

## Decisions

### D1 — 导航分层用 Ant Design Menu 内嵌子菜单

Ant Design Menu `mode="inline"` 原生支持多层 children，侧边栏 collapsed 时自动折叠。无需引入额外依赖。

alternative: 用 Tabs 做顶层切换，内嵌子 Menu —— 层级更多但实现更复杂，不必要。

### D2 — openKeys 改为受控状态

原 `defaultOpenKeys` 只在首次渲染时生效，路由切换后无法更新展开状态。改用 `useState` + 两个 `useEffect`：
1. app 切换时重算 openKeys
2. pathname 变化时自动展开匹配的父级分组

用户手动折叠/展开由 `onOpenChange` 处理，状态持久到当前会话。

### D3 — 时间线事件着色方案

按运营视角分 4 种色系：
- 蓝/青：测评相关（session_start / session_complete）
- 金/绿：支付相关（payment_created / payment_success）
- 橙/紫：邀请相关（invite_code_generated / invite_redeemed）
- 红：管理员干预（admin_grant）

使用 Ant Design Timeline `items[].color` 和 `items[].dot` 实现图标+颜色双重区分。

### D4 — 用户时间线页不做额外统计 API 调用

直接从 timeline 事件列表中 count 得到测评次数和付费次数，在页面 header 展示摘要 Tag，无需额外调用 `/begreat-admin/users` API。

## Risks / Trade-offs

- [openKeys 受控状态] 每次 pathname 变化都 setState，若路由切换频繁可能触发额外渲染 → 影响极小，Menu 本身渲染代价低
- [时间线事件 detail 字段结构] detail 字段为 `Record<string, unknown>`，前端 key 展示依赖后端返回的字段名，若后端字段命名调整需同步更新 EVENT_META → 可接受，后端字段在 spec 中已固定
