# 小程序后端服务

本目录为小程序的 **后端服务**，基于 Node.js + TypeScript + TSRPC，  
同时提供：

- TSRPC HTTP / WebSocket 服务（游戏 / 会话等实时能力）
- 小程序 REST 接口（登录、作品、记录、反馈等）
- MongoDB / Redis 数据存储
- 基于 Docker / docker-compose 的一键部署能力，阿里腾讯云ecs实例

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
│   ├── sysconfig/           # 系统配置（按环境划分）
│   │   └── development/
│   ├── util/                # 工具方法
│   │   ├── logger.ts        # 日志封装（gameLogger / serverLogger / csv logger）
│   │   ├── wxAccessToken.ts # 微信 token 获取与缓存
│   │   ├── imageUploader.ts # 图片上传（OSS / COS）
│   │   └── ...
│   ├── front.ts             # TSRPC + WebSocket 入口（编译后为 dist/front.js）
│   └── httpServer.ts        # HTTP 服务器入口
│
├── dist/                    # TypeScript 编译产物（Docker 镜像和 PM2 运行都基于此）
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

配置文件位于 `src/sysconfig/` 目录下，根据环境分为不同子目录：

- `development/`: 开发环境配置
- `production/`: 生产环境配置

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

### 2. 服务器部署（ECS + ACR + docker-compose）

典型流程（建议）：

1. 在本地 / CI 内使用 `Dockerfile` 构建镜像并推送到阿里云 ACR；
2. 在 ECS 上准备好 `docker-compose.yml`（使用远程镜像地址 `registry.cn-xxx.aliyuncs.com/<namespace>/<repo>:tag`）；
3. 通过 GitHub Actions 或手动 SSH 到 ECS 执行：

```bash
docker compose pull
docker compose up -d
```

> 当前项目已经在尝试使用 GitHub Actions + 阿里云 ACR 做自动构建和部署，  
> 根据你实际 CI 配置调整镜像地址和 tag 即可。

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
