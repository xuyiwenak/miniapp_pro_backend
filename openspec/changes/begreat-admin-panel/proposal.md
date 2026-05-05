## Why

begreat 目前所有运营操作（手动解锁报告、修改价格配置、处理支付掉单、导入职业数据）都依赖 SSH 进服务器执行 curl 或直接改 JSON 文件，运营人员无法自助处理用户投诉，开发介入成本高。现在产品已进入付费阶段，亟需一个 Web 后台让非技术运营人员可以独立完成日常操作。

## What Changes

- **新增** `begreat_admin/` 独立前端项目（React + TypeScript + Vite + Ant Design），与 `art_web/` 平行放置
- **新增** art_backend 中 `/begreat-admin/` 路由前缀下的一整套管理 API（约 17 个接口）
- **新增** `admins` MongoDB 集合，存储管理员账号（username + bcrypt 密码），颁发独立 admin JWT
- **新增** 掉单检测与修复接口：自动发现"已支付但报告未解锁"的异常 session，一键修复
- **新增** 用户行为时间线：将单个用户的登录、测评、支付、邀请事件聚合为可读时间线
- **新增** runtime_config 可视化编辑（价格、支付开关、白名单），替代手动改 JSON 文件
- **迁移** 现有 `/admin/` 路由的功能（reload-config、occupations/seed）到新 `/begreat-admin/` 体系，统一鉴权

## Capabilities

### New Capabilities

- `admin-auth`: 管理员账号体系——注册/登录、bcrypt 密码、独立 admin JWT 鉴权中间件
- `admin-dashboard`: 数据大盘——今日新增用户、测评完成数、付费转化率、总收入 KPI
- `admin-user-management`: 用户管理——分页列表、openId 搜索、用户完整行为时间线
- `admin-session-management`: 测评管理——会话列表/详情（含人格分数+职业匹配）、管理员手动解锁报告
- `admin-payment-management`: 支付管理——支付记录列表、掉单检测（已付款但未解锁）、掉单一键修复
- `admin-invite-management`: 邀请裂变管理——裂变统计、邀请记录列表
- `admin-config-management`: 系统配置管理——可视化编辑 runtime_config（价格/开关/白名单）、热加载
- `admin-occupation-management`: 职业管理——实时查询职业列表、seed 文件导入

### Modified Capabilities

（无现有 spec 层面的行为变更，现有业务逻辑不受影响）

## Impact

**新增文件：**
- `begreat_admin/` — 独立前端项目
- `src/apps/begreat/miniapp/routes/begreatAdmin.ts` — 新路由入口（聚合所有 /begreat-admin/ 子路由）
- `src/apps/begreat/miniapp/routes/begreatAdmin/` — 子路由目录（auth、dashboard、users、sessions、payments、invites、config、occupations）
- `src/apps/begreat/entity/admin.entity.ts` — Admin 实体
- `src/apps/begreat/dbservice/BegreatDBModel.ts` — 新增 AdminModel

**修改文件：**
- `src/apps/begreat/miniapp/server.ts` — 挂载 `/begreat-admin` 路由
- `src/apps/begreat/miniapp/routes/admin.ts` — 保留兼容，逐步废弃（现有 curl 脚本不受影响）

**依赖：**
- 新增 npm 依赖：`bcrypt`、`@types/bcrypt`（后端）
- 新增 npm 依赖：`react-router-dom`、`antd`、`@ant-design/plots`、`zustand`、`axios`（前端）

**无破坏性变更：**现有小程序接口和 `/admin/` 路由不受任何影响。
