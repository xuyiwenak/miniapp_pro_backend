## 1. 后端：管理员鉴权体系

- [x] 1.1 新建 `src/apps/begreat/entity/admin.entity.ts`，定义 `IAdmin` 接口（adminId、username、passwordHash、createdAt）和 Mongoose Schema
- [x] 1.2 在 `BegreatDBModel.ts` 中新增 `AdminModel`（collection: `admins`）
- [x] 1.3 新建 `src/apps/begreat/miniapp/routes/begreatAdmin/auth.ts`，实现 `POST /begreat-admin/auth/init-admin`（仅集合为空时可用，bcrypt cost 12）
- [x] 1.4 在 `auth.ts` 实现 `POST /begreat-admin/auth/login`（username+password 验证，颁发 HS256 JWT，有效期 24h，secret 取 `process.env.BEGREAT_ADMIN_JWT_SECRET`）
- [x] 1.5 在 `auth.ts` 实现 `GET /begreat-admin/auth/me`（返回 adminId、username）
- [x] 1.6 新建 `adminJwtAuth` 中间件（验证 Bearer token，解码 payload 注入 `req.admin`，失败返回 401）
- [x] 1.7 新建 `src/apps/begreat/miniapp/routes/begreatAdmin.ts` 主路由文件，挂载 auth 子路由，所有非 auth 路由使用 `adminJwtAuth` 中间件
- [x] 1.8 在 `src/apps/begreat/miniapp/server.ts` 挂载 `/begreat-admin` 路由
- [x] 1.9 在 `.env.example` 和 `sysconfig` 文档中说明 `BEGREAT_ADMIN_JWT_SECRET` 环境变量

## 2. 后端：数据大盘接口

- [x] 2.1 新建 `routes/begreatAdmin/dashboard.ts`，实现 `GET /begreat-admin/dashboard/stats`（聚合今日新增、完成数、付费数、收入、历史累计、掉单数、转化率）
- [x] 2.2 实现 `GET /begreat-admin/dashboard/trend?days=N`（按自然日聚合，缺数据的日期填 0，上限 30 天）

## 3. 后端：用户管理接口

- [x] 3.1 新建 `routes/begreatAdmin/users.ts`，实现 `GET /begreat-admin/users`（按 openId 聚合 session 数据，支持 openId 精确搜索和日期范围筛选，分页）
- [x] 3.2 实现 `GET /begreat-admin/users/:openId/timeline`（聚合 assessmentsessions、payments、invitecodes、inviterewards 四张表的事件，返回统一 `TimelineEvent[]`，按 timestamp 降序）

## 4. 后端：测评管理接口

- [x] 4.1 新建 `routes/begreatAdmin/sessions.ts`，实现 `GET /begreat-admin/sessions`（支持 status 多值筛选、openId 筛选、日期范围、分页）
- [x] 4.2 实现 `GET /begreat-admin/sessions/:sessionId`（返回完整 session 详情，不含 answers）
- [x] 4.3 实现 `POST /begreat-admin/sessions/:sessionId/grant`（手动解锁报告，grantReason 必填，status=in_progress 时拒绝，幂等处理已 paid 的情况）

## 5. 后端：支付管理接口

- [x] 5.1 新建 `routes/begreatAdmin/payments.ts`，实现 `GET /begreat-admin/payments`（支持 status 筛选、openId 筛选、日期范围、分页）
- [x] 5.2 实现 `GET /begreat-admin/payments/anomalies`（MongoDB 聚合：payments[status=success] JOIN sessions，过滤 session.status ≠ paid，invite_unlocked 不视为掉单）
- [x] 5.3 实现 `POST /begreat-admin/payments/fix-anomaly`（入参 sessionId+outTradeNo+reason，双字段校验防误操作，将 session 改为 paid，grantReason 加 '[掉单修复]' 前缀，幂等处理）

## 6. 后端：邀请管理接口

- [x] 6.1 新建 `routes/begreatAdmin/invites.ts`，实现 `GET /begreat-admin/invites/stats`（总邀请码数、兑换数、解锁数、转化率、Top10 邀请人）
- [x] 6.2 实现 `GET /begreat-admin/invites`（邀请码列表，含 recentRedeems，支持 openId 筛选和分页）

## 7. 后端：配置管理接口

- [x] 7.1 新建 `routes/begreatAdmin/config.ts`，实现 `GET /begreat-admin/config`（返回 getRuntimeConfig()）
- [x] 7.2 实现 `POST /begreat-admin/config`（partial update：读文件→合并→写回→热加载，price_fen 范围校验 100–99900）
- [x] 7.3 实现 `POST /begreat-admin/config/reload`（调用 reloadRuntimeConfig()，返回当前配置）

## 8. 后端：职业管理接口

- [x] 8.1 新建 `routes/begreatAdmin/occupations.ts`，实现 `GET /begreat-admin/occupations`（从 occupationnorms 集合实时查询，支持 isActive 筛选和分页）
- [x] 8.2 实现 `GET /begreat-admin/occupations/seed`（预览 seed 文件，不写库）
- [x] 8.3 实现 `POST /begreat-admin/occupations/seed`（按 code upsert，支持 reset=true，迁移自旧 /admin/occupations/seed）
- [x] 8.4 在 `begreatAdmin.ts` 主路由汇总挂载所有子路由（dashboard、users、sessions、payments、invites、config、occupations）

## 9. 前端：项目初始化

- [x] 9.1 在项目根目录执行 `npm create vite@latest begreat_frontend -- --template react-ts`，与 art_web/ 平行放置，初始化独立 git 仓库
- [x] 9.2 安装依赖：`antd`、`@ant-design/plots`、`react-router-dom`、`zustand`、`axios`、`dayjs`
- [x] 9.3 配置 `vite.config.ts`：base 路径、API proxy（开发时代理 `/begreat-admin` 到后端）
- [x] 9.4 配置 TypeScript strict 模式，设置 `@` 路径别名
- [x] 9.5 封装 `src/api/adminApi.ts`：Axios 实例，baseURL 从环境变量读取，自动注入 Authorization header，401 时跳转 /login
- [x] 9.6 实现 Zustand `useAuthStore`：存储 token 和 adminInfo，持久化到 localStorage

## 10. 前端：登录页 + 路由守卫

- [x] 10.1 实现 `src/pages/Login.tsx`：username/password 表单，调用 login 接口，成功后跳转 /dashboard
- [x] 10.2 实现路由守卫组件 `AuthGuard`：未登录时重定向 /login，已登录时校验 /auth/me
- [x] 10.3 配置 `src/router.tsx`：React Router v6，定义所有路由，非登录页包裹 AuthGuard
- [x] 10.4 实现侧边栏 Layout：Ant Design `Layout` + `Menu`，包含所有模块导航项

## 11. 前端：数据大盘页面

- [x] 11.1 实现 `src/pages/Dashboard.tsx`：4 个 KPI 卡片（今日新增、完成数、付费转化率、今日收入）+ 掉单预警 Badge
- [x] 11.2 集成折线趋势图（@ant-design/plots Line），显示最近 7 天新增/完成/付费趋势
- [x] 11.3 掉单预警：anomalyCount > 0 时展示醒目红色提示，点击跳转 /payments/anomalies

## 12. 前端：用户管理页面

- [x] 12.1 实现 `src/pages/Users.tsx`：Ant Design Table，支持 openId 搜索框、日期范围选择器、分页
- [x] 12.2 实现 `src/pages/UserDetail.tsx`：展示用户基础信息 + Ant Design Timeline 组件渲染行为时间线
- [x] 12.3 时间线事件图标区分：不同 type 使用不同颜色和图标（测评=蓝、支付=绿、邀请=橙、管理员操作=红）

## 13. 前端：测评管理页面

- [x] 13.1 实现 `src/pages/Sessions.tsx`：Table + 状态 Tag 色彩区分（in_progress=灰、completed=蓝、paid=绿、invite_unlocked=橙），支持多状态筛选
- [x] 13.2 实现 `src/pages/SessionDetail.tsx`：展示五维雷达图（@ant-design/plots Radar）+ 职业匹配列表（含 matchScore 进度条）
- [x] 13.3 在 SessionDetail 实现手动解锁操作：确认弹窗（含 grantReason 输入框），调用 grant 接口，成功后刷新状态

## 14. 前端：支付管理页面（重点）

- [x] 14.1 实现 `src/pages/Payments.tsx`：支付记录 Table，status Tag 色彩区分，支持状态和日期筛选
- [x] 14.2 实现 `src/pages/PaymentAnomalies.tsx`：掉单检测页，Table 展示所有异常记录（含支付时间、session 当前状态）
- [x] 14.3 在掉单列表每行提供"修复"按钮，弹窗要求输入修复原因（reason），确认后调用 fix-anomaly 接口
- [x] 14.4 修复成功后实时从列表移除该条记录，顶部显示成功提示，Dashboard 的 anomalyCount 联动更新

## 15. 前端：邀请统计页面

- [x] 15.1 实现 `src/pages/Invites.tsx`：顶部 3 个统计卡片（总邀请码、兑换次数、转化率）+ Top10 邀请人排行表
- [x] 15.2 邀请码明细 Table（含 recentRedeems 展开列）

## 16. 前端：系统配置页面

- [x] 16.1 实现 `src/pages/Config.tsx`：加载 GET /config 数据，渲染可编辑表单（price_fen 数字输入、payment_enabled 开关、dev_openids 标签输入）
- [x] 16.2 "保存配置"按钮调用 POST /config，成功提示"配置已保存并热加载生效"
- [x] 16.3 "手动热加载"按钮调用 POST /config/reload（用于服务器直接修改文件后的场景）
- [x] 16.4 payment_enabled=false 时页面显示醒目黄色横幅提示"支付已关闭（审核模式）"

## 17. 前端：职业管理页面

- [x] 17.1 实现 `src/pages/Occupations.tsx`：Table 展示职业列表（code、title、isActive、五维要求值），支持 isActive 筛选
- [x] 17.2 "导入 Seed 数据"按钮：先调用 GET seed 预览（弹窗展示记录数），确认后调用 POST seed 执行导入
- [x] 17.3 支持 reset=true 的"清空重导"选项（二次确认弹窗，文字警告"此操作将清空所有职业数据"）
