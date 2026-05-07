## 1. 项目初始化

- [x] 1.1 复制 `begreat_frontend/` → `commander/`，修改 `package.json` 的 `name` 为 `commander`
- [x] 1.2 清理 begreat 专属页面（保留 `pages/` 下所有文件作为 begreat 专区参考，后续迁移）
- [x] 1.3 安装 art_web 需要的额外依赖（如有——当前 Ant Design 体系已全覆盖）

## 2. 状态管理：appStore + authStore

- [x] 2.1 新建 `commander/src/store/appStore.ts` —— Zustand store，`currentApp: 'mandis' | 'begreat'`，`setApp(app)` + `persist` 到 localStorage
- [x] 2.2 修改 `commander/src/store/authStore.ts` —— 扩展为双 token 支持：
  ```typescript
  mandisToken: string | null;
  begreatToken: string | null;
  loginMandis(account, password): Promise<void>;
  loginBegreat(username, password): Promise<void>;
  activeToken(): string | null;  // 根据 currentApp 返回对应 token
  ```
- [x] 2.3 `loginMandis` 调 `POST /login/postPasswordLogin`（mandis 后端），写入 `mandisToken`
- [x] 2.4 `loginBegreat` 调 `POST /begreat-admin/auth/login`（begreat 后端），写入 `begreatToken`

## 3. API 层：axios 适配双后端

- [x] 3.1 新建 `commander/src/api/client.ts` —— axios 实例
- [x] 3.2 request interceptor：根据 `appStore.currentApp` 选择 baseURL 和注入对应 token
  ```typescript
  const APP_BASE = { mandis: '/api', begreat: '/begreat-admin/api' };
  ```
- [x] 3.3 response interceptor：根据 `currentApp` 做格式归一化（D4）
  - mandis: `{ success: true, data: ... }` → 提取 `res.data.data`
  - begreat: `{ data: { data: ... } }` → 提取 `res.data.data.data`
- [x] 3.4 错误处理：401 → 清除对应 app 的 token → 跳转登录

## 4. Layout：App 切换 + 动态 Nav

- [x] 4.1 改造 `commander/src/components/layout/AppLayout.tsx`
- [x] 4.2 顶部 Header：Ant Design `<Segmented>` 组件，`[mandis | begreat]` 切换，绑定 `appStore.setApp()`
- [x] 4.3 左侧 Nav 动态渲染——根据 `currentApp` 显示不同的菜单项：
  ```typescript
  const COMMON_NAV = [
    { key: '/dashboard',       label: 'BI 仪表盘',   icon: <DashboardOutlined /> },
    { key: '/system',          label: '系统监控',     icon: <MonitorOutlined /> },
  ];
  const MANDIS_NAV = [
    { key: '/mandis/users',    label: '用户管理',     icon: <TeamOutlined /> },
    { key: '/mandis/works',    label: '作品管理',     icon: <ImageOutlined /> },
    { key: '/mandis/feedback', label: '反馈管理',     icon: <MessageOutlined /> },
  ];
  const BEGREAT_NAV = [
    { key: '/begreat/sessions',   label: '测评记录',  icon: <FileTextOutlined /> },
    { key: '/begreat/payments',   label: '支付管理',  icon: <PayCircleOutlined /> },
    { key: '/begreat/anomalies',  label: '掉单修复',  icon: <WarningOutlined /> },
    { key: '/begreat/invites',    label: '邀请裂变',  icon: <GiftOutlined /> },
    { key: '/begreat/config',     label: '系统配置',  icon: <SettingOutlined /> },
    { key: '/begreat/occupations',label: '职业管理',  icon: <BranchesOutlined /> },
  ];
  ```
- [x] 4.4 用户信息区：显示当前登录的 admin 信息（根据 `currentApp` 取对应 `adminInfo`）

## 5. 品牌主题：Ant Design theme token（D5）

- [x] 5.1 新建 `commander/src/config/theme.ts`
  ```typescript
  export const APP_THEMES = {
    mandis: {
      colorPrimary:   '#4DBFB4',      // teal
      colorBgLayout:  '#F9F4EF',      // cream
      colorTextBase:  '#1B3A6B',      // navy
      borderRadius:   8,
    },
    begreat: {
      colorPrimary:   '#1677ff',
      colorBgLayout:  '#f5f5f5',
      colorTextBase:  '#000000',
      borderRadius:   6,
    },
  };
  ```
- [x] 5.2 `AppLayout` 中 `<ConfigProvider theme={APP_THEMES[currentApp]}>` 包裹内容区
- [x] 5.3 切换 app 时 Ant Design 组件自动适配对应主题

## 6. 路由：公共页 + 专区页

- [x] 6.1 修改 `commander/src/router.tsx`，路由结构：
  ```
  /login                    → 登录页（统一）
  /dashboard                → BI 仪表盘（公共）
  /system                   → 系统监控（公共）
  /mandis/users             → mandis 用户管理
  /mandis/works             → mandis 作品管理
  /mandis/feedback          → mandis 反馈管理
  /begreat/sessions         → begreat 测评记录
  /begreat/sessions/:id     → begreat 测评详情
  /begreat/payments         → begreat 支付管理
  /begreat/anomalies        → begreat 掉单修复
  /begreat/invites          → begreat 邀请裂变
  /begreat/config           → begreat 系统配置
  /begreat/occupations      → begreat 职业管理
  ```
- [x] 6.2 AuthGuard 改造：支持双 token 校验（mandis token 只检查存在，begreat token 调 `/auth/me` 验证）
- [x] 6.3 `basename` 设为 `/`（专属域名根路径访问）

## 7. 登录页：统一入口 + 选择后端

- [x] 7.1 改造 `commander/src/pages/Login.tsx`
- [x] 7.2 表单：username + password + App 选择（Segmented: mandis / begreat）
- [x] 7.3 提交时根据选中的 app 调 `loginMandis()` 或 `loginBegreat()`
- [x] 7.4 登录成功后跳转 `/dashboard`，`appStore` 自动切换

## 8. 从 begreat_frontend 迁移页面

- [x] 8.1 复制 `begreat_frontend/src/pages/` 下所有文件到 `commander/src/pages/begreat/`
- [x] 8.2 复制 `begreat_frontend/src/api/begreatApi.ts`（现有 adminApi 拆分出 begreat 专属部分）
- [x] 8.3 调整 import 路径、API 调用改用统一的 `client.ts`
- [x] 8.4 验证所有 begreat 页面在 commander 内功能正常

## 9. 从 art_web 迁移页面（Ant Design 重写）

- [x] 9.1 新建 `commander/src/pages/mandis/UsersPage.tsx` —— Ant Design `<Table>` + 搜索框 + 分页
- [x] 9.2 新建 `commander/src/pages/mandis/WorksPage.tsx` —— Ant Design `<Table>` + 状态 Tag
- [x] 9.3 新建 `commander/src/pages/mandis/FeedbackPage.tsx` —— Ant Design `<Table>` + 回复操作
- [x] 9.4 新建 `commander/src/api/mandisApi.ts` —— 迁移 art_web `adminApi.ts` 中的 mandis 专属接口（users/works/feedback），改用 axios
- [x] 9.5 品牌一致性：使用 `APP_THEMES.mandis` 的配色，页面级 `ConfigProvider` 覆写

## 10. 公共 BI Dashboard（D8 三层过滤）

- [x] 10.1 新建 `commander/src/config/biPanels.ts` —— 声明式面板配置
  ```typescript
  export const BI_PANELS = [
    { key: 'apiPerformance',  label: 'API 性能',   visible: ['mandis','begreat'], component: ApiPerformancePanel },
    { key: 'errorAnalysis',   label: '错误分析',   visible: ['mandis','begreat'], component: ErrorAnalysisPanel },
    { key: 'uploadStats',     label: '上传统计',   visible: ['mandis'],          component: UploadStatsPanel },
    { key: 'qwenCosts',       label: 'Qwen 成本',  visible: ['mandis'],          component: QwenCostPanel },
    { key: 'hotEndpoints',    label: '热门端点',   visible: ['mandis','begreat'], component: HotEndpointsPanel },
  ];
  ```
- [x] 10.2 新建 `commander/src/hooks/useBiDashboard.ts` —— 调用 `GET /api/bi/dashboard?appName={currentApp}`，60s 轮询
- [x] 10.3 新建 `commander/src/hooks/useBiTrends.ts` —— 调用 `GET /api/bi/trends?appName={currentApp}`
- [x] 10.4 实现 `ApiPerformancePanel.tsx` —— Recharts/plots `<Line>` 趋势图（公共）
- [x] 10.5 实现 `ErrorAnalysisPanel.tsx` —— Ant Design `<Table>` Top 5 错误（公共）
- [x] 10.6 实现 `UploadStatsPanel.tsx` —— 文件类型 + 大小分布（mandis 专属）
- [x] 10.7 实现 `QwenCostPanel.tsx` —— 成本饼图（mandis 专属，第三层：totalCost=0 → `<Empty>`）
- [x] 10.8 实现 `HotEndpointsPanel.tsx` —— 端点排行柱状图（公共）
- [x] 10.9 实现 `DashboardPage.tsx` —— 组合面板，按 `visible` 过滤 + `<Empty>` 占位

## 11. 系统监控页（从 art_web SystemPage 迁移）

- [x] 11.1 从 art_web 迁移 SystemPage 到 `commander/src/pages/SystemPage.tsx`（Ant Design 重写）
- [x] 11.2 CPU/内存/容器状态卡片，Ant Design `<Card>` + `<Statistic>`
- [x] 11.3 日志查看、容器重启、部署按钮

## 12. 前端 BI SDK

- [x] 12.1 新建 `commander/src/utils/bi.ts` —— `init()`、`trackPageView()`、`trackAction()`、`trackError()`
- [x] 12.2 `init({ appName: 'commander', apiBase })` 根据 `appStore.currentApp` 动态设置 apiBase
- [x] 12.3 `trackPageView(page)` 发送到 `POST /api/bi/client-event`（mandis 后端）
- [x] 12.4 `navigator.sendBeacon` → `fetch` keepalive 降级
- [x] 12.5 ErrorBoundary 包裹 App，`componentDidCatch` 调用 `bi.trackError()`
- [x] 12.6 路由切换监听 `useLocation` → `bi.trackPageView()`

## 13. 后端适配

- [x] 13.1 修改 `art_backend/src/apps/mandis/miniapp/server.ts` —— 删除 `express.static(adminPanelDir)`（不再需要 Express serve 前端）
- [x] 13.2 修改 `art_backend/Dockerfile` —— 删除 `COPY admin-panel ./admin-panel`
- [x] 13.3 Nginx: **新建** `nginx/conf.d/commander.conf`——参照 mandis.conf 模板，domain 为 `commander.autorecordarchery.xyz`
- [x] 13.4 Nginx: 简化 `begreat.conf`——删除 `/admin/` 静态文件 serve 相关 location 块（共 3 个 block），begreat 域名的管理后台迁移到 commander 域名
- [x] 13.5 SSL: 为 commander 域名申请证书（Let's Encrypt certbot），证书路径 `/etc/nginx/ssl/commander/`

## 14. docker-compose 适配

- [x] 14.1 修改 `docker-compose.yml` —— Nginx volumes：
  ```yaml
  # 删除:
  - ./begreat_frontend/dist:/usr/share/nginx/html/begreat-admin:ro
  # 新增:
  - ./commander/dist:/usr/share/nginx/html/commander:ro
  ```
- [x] 14.2 如根目录和 `art_backend/` 下各有一份 docker-compose.yml，两处同步修改
- [x] 14.3 确认后端构建不受影响：`docker compose build begreat_app` 通过

## 15. 部署

- [x] 15.1 `cd commander && npm run build` → 产出 `dist/`
- [x] 15.2 `rsync -avz commander/dist/ bn:/path/to/art_theroy/commander/dist/`
- [x] 15.3 `ssh bn "cd /path/to/art_theroy && docker compose build begreat_app && docker compose up -d"`
- [x] 15.4 `docker exec art-nginx nginx -s reload`
- [x] 15.5 验证：
  - `https://commander.autorecordarchery.xyz/` → 打开 Commander 登录页
  - 登录 mandis → 主题切换 navy/teal，mandis 专属面板显示
  - 切换到 begreat → 主题切换 Ant Design 默认蓝，begreat 专属面板显示
  - BI Dashboard → 两个 app 的数据都能查询，面板按 `visible` 配置正确显隐
  - API 调用：mandis 走 `/api/*`，begreat 走 `/begreat-admin/*`

## 16. 清理（观察期 1 周后）

- [x] 16.1 删除 `art_web/` 目录
- [x] 16.2 删除 `begreat_frontend/` 目录
- [x] 16.3 删除服务器上 `/usr/share/nginx/html/begreat-admin/` 旧构建产物
- [x] 16.4 删除 `art_backend/Dockerfile` 中 `admin-panel` 相关行（如未删除）
