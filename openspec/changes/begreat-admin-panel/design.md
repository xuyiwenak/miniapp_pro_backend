## Context

begreat 后端使用 Node.js + TypeScript + Express，已有一套 `/admin/` 路由（`internal_server_token` 鉴权）用于开发者 curl 操作。MongoDB 数据层通过 `BegreatDBModel.ts` 统一管理。现有功能完整，运营侧的痛点纯粹是"操作界面"缺失：掉单修复要改数据库、改价格要 SSH 上服务器、手动解锁要跑脚本。

前端目前有 `art_web/`（C 端艺术工作室门户，React + Vite + Tailwind）。begreat 后台与其品牌定位完全不同，需要独立项目。新建 `begreat_frontend/` 与 `art_web/` 平行放置，独立 git 仓库，部署方式与 `art_web` 一致：`npm run build` 产出 `dist/`，Nginx 静态伺服。

## Goals / Non-Goals

**Goals:**
- 建立独立的 admin JWT 鉴权体系，与用户 JWT 完全隔离
- 新增 `/begreat-admin/` API 路由，覆盖 8 大管理能力
- 建立 `begreat_frontend/` 独立前端项目（与 art_web/ 平行，独立 git 仓库），提供完整运营操作界面
- 掉单检测与一键修复，解决付费成功但报告未解锁的核心投诉场景
- 用户行为时间线，支持快速追查单用户全路径

**Non-Goals:**
- 不实现多角色/权限组（单 admin 账号足够，后期扩展）
- 不实现操作审计日志（后期迭代）
- 不修改现有小程序 API 或 `/admin/` 旧路由（向后兼容）
- 不实现报告内容编辑（报告由算法生成，不允许手动改）
- 不实现常模数据（norms）的 UI 管理（数据科学工作，保留脚本操作）

## Decisions

### D1：独立 Admin JWT，不复用 internal_server_token

**选择：** 新建 `admins` MongoDB 集合，username + bcrypt 密码，颁发 HS256 JWT（独立 secret，存于环境变量 `BEGREAT_ADMIN_JWT_SECRET`）。

**原因：** `internal_server_token` 是静态长 token，所有人共用，无法追溯操作人身份，无法轮转。独立 JWT 支持过期时间（24h），更安全，且为后续多账号/日志审计打基础。

**放弃方案：** 复用用户 JWT secret——用户 token 和 admin token 共享 secret 存在提权风险。

---

### D2：后端路由结构——新 prefix 不破坏现有接口

```
/begreat-admin/auth/login
/begreat-admin/auth/me
/begreat-admin/dashboard/stats
/begreat-admin/users
/begreat-admin/users/:openId/timeline
/begreat-admin/sessions
/begreat-admin/sessions/:sessionId
/begreat-admin/sessions/:sessionId/grant
/begreat-admin/payments
/begreat-admin/payments/anomalies
/begreat-admin/payments/fix-anomaly
/begreat-admin/invites/stats
/begreat-admin/invites
/begreat-admin/config           (GET + POST)
/begreat-admin/config/reload
/begreat-admin/occupations
/begreat-admin/occupations/seed (GET + POST)
```

文件结构：
```
src/apps/begreat/miniapp/routes/
├── begreatAdmin.ts              ← 主路由，挂载子路由
└── begreatAdmin/
    ├── auth.ts
    ├── dashboard.ts
    ├── users.ts
    ├── sessions.ts
    ├── payments.ts
    ├── invites.ts
    ├── config.ts
    └── occupations.ts
```

**原因：** 子路由分文件便于并行开发和测试，与现有 `routes/` 目录风格一致。

---

### D3：掉单检测算法

**定义：** `payments` 集合中 `status = 'success'` 但对应 `sessionId` 在 `assessmentsessions` 中 `status` 不为 `'paid'` 的记录。

**检测接口：** `GET /begreat-admin/payments/anomalies`  
MongoDB 聚合：先查所有 `success` 支付，再 `$lookup` join session，过滤 session status ≠ paid。

**修复接口：** `POST /begreat-admin/payments/fix-anomaly`  
入参：`{ sessionId, outTradeNo, reason }`  
操作：将 session status 改为 `'paid'`，写入 `paidAt`、`grantedByAdmin: true`、`grantReason`（包含掉单修复标记）。使用事务保证原子性。

**原因：** 掉单是微信支付 notify 回调失败的已知问题，需要运营能自助修复而不是找开发。

---

### D4：用户时间线聚合策略

时间线数据来自多个集合，采用后端聚合而非前端多请求：

```typescript
// 聚合来源
assessmentsessions  → 测评开始/完成/解锁事件
payments            → 支付事件
invitecodes         → 邀请码生成事件
inviterewards       → 邀请兑换事件
```

返回统一的 `TimelineEvent[]`：
```typescript
interface TimelineEvent {
  type: 'session_start' | 'session_complete' | 'payment' | 'invite_send' | 'invite_redeem' | 'admin_grant';
  timestamp: Date;
  detail: Record<string, unknown>;
}
```

按 `timestamp` 降序排列，前端用 Ant Design `Timeline` 组件渲染。

---

### D5：前端技术栈

| 选项 | 选择 | 理由 |
|------|------|------|
| UI 框架 | Ant Design 5.x | 后台管理场景最成熟，Table/Form/Timeline 开箱即用 |
| 图表 | Ant Design Charts（@ant-design/plots） | 与 Antd 同生态，避免额外依赖 |
| 状态管理 | Zustand | 轻量，后台状态简单，无需 Redux |
| HTTP | Axios + 封装 adminApi | 统一处理 401 跳转登录、baseURL 配置 |
| 路由 | React Router v6 | 标准选择，loader/action 支持好 |
| 构建 | Vite + TypeScript strict | 与 art_web 保持一致 |

---

### D6：Admin 首次账号初始化

后端在 `src/apps/begreat/miniapp/routes/begreatAdmin/auth.ts` 提供一个**一次性初始化接口**：

`POST /begreat-admin/auth/init-admin`  
- 仅当 `admins` 集合为空时可调用（否则返回 409）
- 接收 `{ username, password }`，写入首个 admin 账号
- 生产环境通过 curl 调用一次，之后接口自动失效

**原因：** 避免在代码/配置文件中硬编码默认密码；操作简单且安全。

---

### D7：runtime_config 写入

`POST /begreat-admin/config` 接收 `{ price_fen?, payment_enabled?, dev_openids? }`：
1. 读取现有 `runtime_config.json`
2. 合并更新字段（partial update）
3. 写回文件
4. 自动调用 `reloadRuntimeConfig()` 热加载

**原因：** 保持文件为单一事实来源，写接口和热加载合并为一步，减少运营操作步骤。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 掉单修复误操作（修复未实际支付的 session） | 修复接口要求同时提供 `sessionId` + `outTradeNo`，双字段校验；写入 grantReason 留审计痕迹 |
| Admin JWT secret 泄露 | 存于环境变量 `BEGREAT_ADMIN_JWT_SECRET`，不入代码库；JWT 有效期 24h |
| runtime_config.json 并发写入 | 当前单进程部署风险极低；后续多实例部署时需迁移到 DB 存储 |
| 前端 begreat_frontend/ 部署路径冲突 | Nginx `begreat.conf` 新增 `location /admin/` 静态伺服 dist/，与小程序 API `/begreat-admin/` 在 URL 层面区分 |
| 时间线聚合性能（用户事件多时） | 按 openId 索引查询，控制单次返回 200 条，生产中单用户事件量极小，无需分页 |

## Migration Plan

1. **后端先行**：新增 `/begreat-admin/` 路由，不改动任何现有接口，零风险上线
2. **初始化 admin 账号**：部署后 curl 调用一次 `POST /begreat-admin/auth/init-admin`
3. **前端部署**：`begreat_frontend/` 执行 `npm run build`，`dist/` 上传至服务器，`begreat.conf` 新增 `location /admin/` 静态伺服
4. **旧 `/admin/` 路由**：保留不动，现有 curl 脚本继续可用，后期视情况废弃

**回滚：** 仅需从 Nginx 移除前端 location，后端路由删除不影响任何现有功能。
