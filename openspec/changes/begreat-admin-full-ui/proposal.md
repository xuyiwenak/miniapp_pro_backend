## Why

BeGreat 管理后台在 commander 中缺少用户管理模块（无法查看用户列表和行为时间线），同时导航结构随功能增长变得扁平拥挤，并存在多处路由跳转路径错误导致页面跳转失效。本次补全全量功能、重组导航，使运营人员具备完整的用户支持能力。

## What Changes

### 新增
- `commander/src/pages/begreat/Users.tsx`：用户列表页，支持 openId 精确搜索、首次见到日期范围筛选、分页
- `commander/src/pages/begreat/UserDetail.tsx`：用户行为时间线页，聚合测评/支付/邀请/管理员操作等全部事件，按时间倒序展示，事件类型着色区分
- 路由 `/begreat/users` 和 `/begreat/users/:openId`

### 修改
- `AppLayout.tsx` — BEGREAT_NAV 重构为分层结构：新增"数据大盘"顶级入口，将运营类页面收入"运营支持"折叠分组，openKeys 改为受控状态
- `router.tsx` — 注册新路由

### Bug 修复
- `Sessions.tsx`：`navigate('/sessions/:id')` → `navigate('/begreat/sessions/:id')`
- `SessionDetail.tsx`：`navigate('/sessions')` → `navigate('/begreat/sessions')`
- `Dashboard.tsx`：`navigate('/payments/anomalies')` → `navigate('/begreat/anomalies')`

## Capabilities

### New Capabilities
- `begreat-user-management`：管理员查看 BeGreat 用户列表及单用户全量行为时间线

### Modified Capabilities
- `begreat-admin-nav`：导航从扁平结构升级为分层结构，新增"运营支持"分组和"数据大盘"入口

## Impact

**修改文件：**
- `commander/src/components/layout/AppLayout.tsx`
- `commander/src/router.tsx`
- `commander/src/pages/begreat/Sessions.tsx`
- `commander/src/pages/begreat/SessionDetail.tsx`
- `commander/src/pages/begreat/Dashboard.tsx`

**新增文件：**
- `commander/src/pages/begreat/Users.tsx`
- `commander/src/pages/begreat/UserDetail.tsx`

**后端依赖（已就绪）：**
- `GET /begreat-admin/users`（begreat-admin-panel change 已实现）
- `GET /begreat-admin/users/:openId/timeline`（同上）

**不涉及：**
- 后端 API 无需变更
- 认证体系无需变更
- 常模管理页（后端无对应 API，待独立 change）
