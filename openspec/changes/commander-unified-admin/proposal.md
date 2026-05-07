# Change: Commander — 统一管理后台

## Why

当前 `art_web` 和 `begreat_frontend` 是两个独立的前端项目，各自维护独立的 UI 框架（Tailwind vs Ant Design）、HTTP 层（fetch vs axios）、状态管理（localStorage vs Zustand）和鉴权体系。每次跨项目需求（如 BI Dashboard 集成）需要在两套代码里分别实现，维护成本 ×2。

两个后台的用户群体相同（运营/管理员），功能定位相同（数据查看 + 运营操作），视觉风格各自为政。统一后：
- BI Dashboard 只需实现一次
- 系统监控、登录鉴权、权限体系共用
- 新增管理功能（如全局配置、审计日志）只需加一个 Nav 项

## What Changes

### 新增

- **`commander/`** 项目：React + Vite + TypeScript + Ant Design 5，统一管理后台
  - 统一 Layout：侧边栏 + 顶部 App 切换 Tab（mandis / begreat）
  - 统一 Auth：Zustand authStore 支持双 token（mandisToken / begreatToken）
  - 统一 HTTP：axios 实例，根据 app context 切换 baseURL
  - **公共页面**：BI 仪表盘、系统监控、登录页
  - **mandis 专区**：用户管理、作品管理、反馈管理（从 art_web 迁移，Ant Design 重写）
  - **begreat 专区**：测评记录、支付管理、掉单修复、邀请裂变、系统配置、职业管理（从 begreat_frontend 迁移）
- **Nginx 配置**：新建 `commander.conf`（专属域名 `commander.autorecordarchery.xyz`），proxy `/api/` → mandis_app、`/begreat-admin/` → begreat_app，静态文件 serve commander dist/

### 修改

- **art_backend/src/apps/mandis/miniapp/server.ts**：移除 art_web 静态文件 serve（`express.static`），改由 Nginx 直接 serve commander
- **Nginx mandis.conf**：新增 `location /admin/` 块
- **Nginx begreat.conf**：`/admin/` 从 `begreat-admin/` 改为 `commander/`

### 废弃

- **art_web/**：上线 commander 后删除（保留一周观察期）
- **begreat_frontend/**：上线 commander 后删除（保留一周观察期）

### 不涉及

- 不修改后端 API（mandis 和 begreat 的 Express 路由不变）
- 不修改小程序端（art_app / mandis / begreat）
- 不修改数据库结构

## Capabilities

### New Capabilities

- `commander-app-context`：多 app 上下文切换——用户在 mandis 和 begreat 管理视图之间切换，各自的 API base 和菜单项动态变化
- `commander-unified-auth`：双 token 鉴权——mandis JWT 和 begreat JWT 共存，axios interceptor 根据当前 app context 注入对应 token

### Modified Capabilities

- `bi-analytics`：BI Dashboard 从两套实现（Change 2 的设计）简化为一套实现（commander 内的 Ant Design 组件）
- `admin-auth`（mandis 侧）：登录页从 art_web 的 Tailwind 版本迁移到 commander 的 Ant Design 版本

### Removed Capabilities

- （无 spec 层面的移除——两个前台的功能完整保留，只是代码位置变了）

## Impact

**新增文件**：
- `commander/` — 完整前端项目（~50 文件，基于 begreat_frontend 骨架扩展）

**修改文件**：
- `nginx/conf.d/commander.conf` — **新建**，commander 专属域名 server block（+40 行）
- `nginx/conf.d/begreat.conf` — 移除 `/admin/` 静态 serve（-20 行）
- `art_backend/src/apps/mandis/miniapp/server.ts` — 移除 art_web 静态 serve（-2 行）
- `art_backend/Dockerfile` — 移除 `COPY admin-panel`（-1 行）
- `docker-compose.yml` — Nginx volume 从 `begreat_frontend/dist` 改为 `commander/dist`

**废弃文件**（观察期后删除）：
- `art_web/` — 整个项目目录
- `begreat_frontend/` — 整个项目目录

**部署影响**：
- 构建：`cd commander && npm run build`，产出 `dist/`
- 部署：`dist/` 复制到 `/usr/share/nginx/html/commander/`
- Nginx reload
- 零停机——旧 art_web 仍可通过 Express 访问直到 Nginx reload

**依赖**：
- 新增 npm 依赖：commander 继承 begreat_frontend 的全部依赖（antd, @ant-design/plots, axios, zustand, dayjs, react-router-dom）
- 无后端依赖变更
