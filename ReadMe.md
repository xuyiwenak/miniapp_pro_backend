# Mandis / 原色有感后端服务

[![Code Review](https://github.com/xuyiwenak/miniapp_pro_backend/actions/workflows/code-review.yml/badge.svg)](https://github.com/xuyiwenak/miniapp_pro_backend/actions/workflows/code-review.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![ESLint](https://img.shields.io/badge/code%20style-ESLint-4B32C3?logo=eslint&logoColor=white)](https://eslint.org)

本仓库是 ArtJoy（原色有感）产品的后端与教育版 Web 工作区，基于 Node.js + TypeScript + TSRPC。
同时提供：

- BeGreat 与 Mandis 的 TSRPC HTTP / WebSocket 服务
- 个人创作、小程序与教育课堂 REST 接口
- Mandis 教育版的学生 H5、教师课堂端和个人创作端
- MongoDB / Redis 数据存储，以及 Bull 队列与日志系统
- 基于 Docker / docker-compose 的本地与 ECS 部署能力

## 产品入口

| 目录 | 入口 | 用途 |
|---|---|---|
| `src/apps/begreat` | BeGreat 服务 | BeGreat 业务与相关接口 |
| `src/apps/mandis` | Mandis 服务 | 个人创作、教育课堂、研究数据与实时服务 |
| `mandis_web/apps/creator-web` | `/art/` | 个人用户上传作品、查看个人报告 |
| `mandis_web/apps/student-h5` | `/classroom/` | 学生扫码参与课堂、完成前后测与作品流程 |
| `mandis_web/apps/teacher-web` | `/teacher/` | 教师/科研工作者创建课堂、查看进度与研究结果 |

教育课堂参与者默认保持匿名，仅使用课堂内随机编号；流程为“课前测评 → 线下创作 → 上传作品/教师代传 →
课后测评 → 作品回响”。VAD 与 I-PANAS-SF 是研究测量，不用于教师评分或心理诊断。

---

## 功能概览

- **小程序业务接口**
  - 用户登录与 Token 管理
  - 作品上传与管理
  - 疗愈记录、数据统计
  - 反馈系统（`/api/feedback`）
- **TSRPC 实时服务**
  - WebSocket 服务器
  - 统一的协议定义和类型安全
- **基础设施**
  - MongoDB：持久化用户信息、作品、反馈等
  - Redis：会话 / Token / 队列等
  - Bull 定时任务 & 队列
  - log4js 日志系统，按天滚动日志
- **部署运维**
  - 支持 PM2 启动（本地）
  - 支持 Docker / docker-compose 本地一键启动
  - 适配 ECS + 阿里云 ACR 镜像部署（生产）
  - **`development` / `production` 两套 sysconfig** 说明见 [`docs/CONFIG_ENVIRONMENTS.md`](docs/CONFIG_ENVIRONMENTS.md)
  - ECS 上 **git pull 后启动**、挂载见 [`docs/DEPLOY_ECS.md`](docs/DEPLOY_ECS.md)

---

## 技术栈

- **运行环境**：Node.js 24+（推荐与生产镜像一致）
- **语言**：TypeScript
- **通信框架**：TSRPC（HTTP + WebSocket）
- **数据库**：MongoDB（通过 `mongoose`）
- **缓存 / 队列**：Redis（通过 `ioredis`、`bull`）
- **日志**：log4js
- **文档**：Swagger UI（自动生成 OpenAPI）
- **容器化**：Docker + docker-compose

---

## 环境与安装

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 本地开发时构建一次（或使用 ts-node 按需调整）
npm run build

# 3. 使用 PM2 启动（可选，本地调试）
pm2 start pm2_config.json
```

> 项目已提供 `docker-compose.yml`，也可以通过 Docker 在本地一次性启 Mongo + 后端 + Nginx（见下文“Docker 部署”）。

### Mandis Web 开发

在 `mandis_web/` 目录执行，三个应用可独立启动：

```bash
npm install
npm run dev:creator
npm run dev:student
npm run dev:teacher
```

构建全部教育版 Web 应用：

```bash
npm run build
```

### 提交前验证

后端常用检查如下；GitHub Actions 的 Code Review 工作流会执行这四项检查：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

依赖安全审计不作为当前 Code Review 的阻断条件。生产依赖升级或安全修复请单独评估并记录原因。

---

## 项目结构（art_backend）

> 只列出与业务 / 部署强相关的部分，省略无关细节。

```text
art_backend/
├── src/                     # 源码
│   ├── api/                 # TSRPC / HTTP API 注册
│   │   └── public/front/    # 对前端 / 小程序开放的接口
│   ├── miniapp/             # 小程序 REST 服务
│   │   ├── routes/          # Express 路由（login / work / feedback / dataCenter / ...）
│   │   ├── middleware/      # 鉴权、统一响应中间件
│   │   ├── server.ts        # 小程序 HTTP 服务入口
│   │   └── tokenStore.ts    # 小程序 Token 存储
│   ├── entity/              # Mongoose 实体（work / feedback / healingReport / personalInfo 等）
│   ├── component/           # 组件系统（DonkJS 核心）
│   ├── common/              # 通用类型、装饰器、WebsocketGameServer 等
│   ├── shared/              # 共享枚举、TSRPC 协议（serviceProto 等）
│   ├── sysconfig/           # 系统配置（development=本机 | production=Docker/线上）
│   │   ├── development/
│   │   └── production/
│   ├── util/                # 工具方法
│   │   ├── logger.ts        # 日志封装（gameLogger / serverLogger / csv logger）
│   │   ├── wxAccessToken.ts # 微信 token 获取与缓存
│   │   ├── imageUploader.ts # 图片上传（OSS / COS）
│   │   └── ...
│   ├── front.ts             # TSRPC + WebSocket 入口（编译后为 dist/front.js）
│   └── httpServer.ts        # HTTP 服务器入口
│
├── dist/                    # TypeScript 编译产物（Docker 镜像和 PM2 运行都基于此）
├── mandis_web/              # Mandis 教育版 Web workspace
│   ├── apps/                # creator-web / student-h5 / teacher-web
│   └── packages/common/     # 跨端课堂类型与文案
├── docs/                    # 文档（tsrpc 生成的 openapi 等）
├── logs/                    # 默认日志输出目录
├── docker-compose.yml       # 本地 / 服务器一键编排（Mongo + Backend + Nginx）
├── Dockerfile               # 后端多阶段构建镜像
├── pm2_config.json          # PM2 启动配置（本地 / 非容器部署）
├── package.json             # npm 脚本与依赖
└── tsconfig.json            # TypeScript 编译配置
```

---

## 配置说明

### 系统配置

配置文件位于 `src/sysconfig/` 目录下，由 `ENV` / `environment` 选择子目录：

- **`development/`**：本机开发（Mongo/Redis 一般为 `127.0.0.1`），默认未设置环境变量时使用
- **`production/`**：Docker / ECS（Mongo `mongo`、Redis `redis` 等服务名）

详见 [`docs/CONFIG_ENVIRONMENTS.md`](docs/CONFIG_ENVIRONMENTS.md)。

主要配置文件包括：

- `log_config.json`: 日志系统配置
- `db_config.json`: 数据库配置
- `server_auth_config.json`: 服务器认证配置
- `zone_config.json`: 区域配置

### PM2 配置（本地 / 非 Docker 部署）

PM2 配置文件为 `pm2_config.json`，定义了应用的启动参数：

```json
{
  "apps": [
    {
      "name": "front_1",
      "script": "front.js",
      "cwd": "./dist",
      "env": {
        "id": "1",
        "internalIP": "127.0.0.1",
        "gameType": "donk",
        "port": "41001",
        "httpPort": "41003",
        "environment": "development"
      },
      "node_args": "--inspect=41002",
      "windowsHide": false
    }
  ]
}
```

---

## 开发指南

### 组件开发

1. 创建组件类，继承自 `BaseComponent`
2. 实现 `init()`、`start()` 和 `stop()` 方法
3. 在 `front.ts` 中注册和启动组件

### Miniapp 反馈接口（/api/feedback）

本项目为小程序提供了「问题反馈 / 联系客服」能力，接口挂载在 `miniapp` REST 服务下的 `/api/feedback` 路由上，并通过 MongoDB 进行持久化存储。

#### 数据结构（Feedback）

- `userId`: 用户唯一标识（从小程序端 `Authorization` Bearer Token 中解析）
- `title`: 问题标题（必填，最多 30 字）
- `content`: 问题描述（必填，最多 300 字）
- `status`: 处理状态，`pending | processing | resolved`，默认 `pending`
- `reply`: 客服回复内容（可选）
- `createdAt` / `updatedAt`: 创建 / 更新时间（由 mongoose `timestamps` 自动维护）

#### 接口列表

- `POST /api/feedback`（需要登录）
  - 请求体：`{ data: { title: string, content: string } }`
  - 行为：为当前用户创建一条新的反馈记录，初始 `status = "pending"`。
  - 响应：`{ code: 200, success: true, data: { id: string } }`

- `GET /api/feedback`（需要登录）
  - 行为：按 `createdAt` 倒序返回当前登录用户的所有反馈列表。
  - 响应：
    ```json
    {
      "code": 200,
      "success": true,
      "data": {
        "list": [
          {
            "id": "xxxx",
            "title": "标题",
            "content": "问题描述",
            "status": "pending",
            "reply": "",
            "createdAt": "2026-03-10T10:00:00.000Z"
          }
        ]
      }
    }
    ```

- `PATCH /api/feedback/:id`（后台使用，需要登录）
  - 请求体：`{ data: { status?: "pending" | "processing" | "resolved", reply?: string } }`
  - 行为：在确保 `userId` 匹配的前提下，更新指定反馈的处理状态与回复内容。
  - 响应：`{ code: 200, success: true, data: { id, status, reply } }`

#### 小程序前端调用约定

小程序端通过 `art_app/api/request.js` 暴露的 `request` 方法调用，如：

```js
// 创建反馈
request('/api/feedback', 'POST', { data: { title, content } });

// 获取当前用户反馈列表
request('/api/feedback', 'GET');
```

请求会自动携带 `Authorization: Bearer <access_token>` 头部，用于服务端识别 `userId`。

### 日志使用

```javascript
import { gameLogger, serverLogger } from "./util/logger";

// 游戏日志
gameLogger.log("游戏信息");
gameLogger.error("游戏错误");

// 服务器日志
serverLogger.info("服务器信息");
serverLogger.warn("服务器警告");
```

---

## 分支与发布流程

| 分支 | 用途 |
|------|------|
| `master` | 日常开发、功能合入 |
| `release` | **线上环境**，ECS 只从此分支拉取，禁止直接往 `release` 提交 |

**后端发布步骤**（本地执行）：

```bash
# 确保工作区干净，然后：
./scripts/release.sh

# 非交互模式（CI 或确认无误时）：
./scripts/release.sh --yes
```

脚本会自动完成：
1. `git pull origin master`（拉最新 master）
2. 切换到 `release`，合并 master（保留 merge commit）
3. `git push origin release`
4. 切回原分支

> 使用 Apple Silicon 开发机时，请在本地执行 `./scripts/deploy_amd64_image.sh`；它会构建 x86_64 镜像、传到 ECS，并在服务器端不经构建地重启应用服务。

### 按变更范围发布（推荐）

从工作区根目录执行智能发布计划，先预览再执行：

```bash
cd /Users/evan/art_theroy
./deploy.sh smart
./deploy.sh smart --execute
```

纯前端变更可以只发布对应的 Mandis Web 应用：

```bash
./deploy.sh creator-web
./deploy.sh student-h5
./deploy.sh teacher-web
```

详细的发布单元和镜像复用规则见 [`docs/SMART_DEPLOYMENT.md`](docs/SMART_DEPLOYMENT.md)。不要使用 `scp` 覆盖服务器源码；服务器源码和配置统一通过 Git 同步。

---

## 部署说明

### 1. 本地 Docker / docker-compose

在仓库根目录（包含 `docker-compose.yml` 的目录）执行：

```bash
docker compose up -d
```

默认会启动：

- `mongo`：本地 MongoDB
- `backend_app`：本服务（使用 `art_backend/Dockerfile` 构建）
- `nginx`：统一对外 HTTP 入口（静态资源 + 反向代理到 backend）

### 2. 服务器部署（Apple Silicon 本地构建 + docker-compose）

典型流程：

1. 先执行 `./scripts/release.sh`，将代码发布至 `release` 分支；
2. 在本地执行：

```bash
./scripts/deploy_amd64_image.sh
```

脚本只会构建 `origin/release` 的精确提交，强制输出 `linux/amd64` 镜像并通过 SSH 导入 ECS；ECS 校验同一提交后，仅执行加载镜像和 `docker compose up -d --no-build`。

### 监控和维护

```bash
# 查看应用列表
pm2 list

# 查看实时日志
pm2 logs

# 重启应用
pm2 restart <app_name>

# 停止应用
pm2 stop <app_name>

# 移除应用
pm2 delete <app_name>

# 查看应用详情
pm2 show <app_name>
```

---

## API 文档

项目启动后，可以通过以下地址访问 Swagger UI 文档（端口按实际配置为准）：

- 本机：`http://localhost:39999/api-docs`
- 服务器：`http://<服务器域名或 IP>:39999/api-docs`

---

## 许可证

MIT License
