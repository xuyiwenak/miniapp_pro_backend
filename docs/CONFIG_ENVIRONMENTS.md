# sysconfig：development 与 production

`src/sysconfig/` 下按 **`environment` / `ENV`** 选择子目录，与代码中 `process.env.environment` 一致。

| 目录 | 用途 |
|------|------|
| **`development/`** | **本机开发**（Mac 等）：Mongo/Redis 使用 **`127.0.0.1`**，默认 `ENV=development` |
| **`production/`** | **Docker / ECS 线上**：Mongo 服务名 **`mongo`**、Redis **`redis`**，与 `docker-compose.yml` 中账号一致 |

## 本地（不跑 Docker）

```bash
export ENV=development
export environment=development   # 可不设，默认即 development
npm run build
node dist/front.js
```

将 `server_auth_config.example.json` 复制为 **`server_auth_config.json`**（已在 .gitignore）。

## Docker / ECS

`docker-compose.yml` 中 `backend_app` 已设置 **`ENV=production`**，并挂载 `./src/sysconfig:/app/config`，实际读取 **`src/sysconfig/production/`**。

```bash
docker compose up -d --build
```

请在 ECS 上放置 **`src/sysconfig/production/server_auth_config.json`**（勿提交密钥到 Git）。

## 说明

- `development/db_config.json`：无 Mongo 账号字段，直连本机实例。
- `production/db_config.json`：含 `user` / `password` / `authSource`，连接串由 `buildMongoUrl` 生成。

### 路径解析（`log_config` 与其它 sysconfig JSON）

读取配置时**优先** `SYSCONFIG_ROOT/<environment>/`（例如挂载后的 `/app/config/production/`），若该路径下文件不存在则**回退**到镜像内 `dist/sysconfig/<environment>/`（构建时 `copy-config` 生成）。  
镜像内默认 `SYSCONFIG_ROOT=/app/config`（见 `Dockerfile`），与 `docker-compose` 挂载一致。

### 日志写到宿主机 `logs/backend`

Compose 挂载 **`./logs/backend:/app/logs`**。`production/log_config.json` 使用相对路径 **`logs/*.log`**（相对容器工作目录 `WORKDIR /app`），即写入 **`/app/logs`**，与挂载一致。  
`development/log_config.json` 仍可用 `../logs/`（本机从项目根启动时常见）；若本机也统一从 `art_backend` 目录跑 Node，可改为与 production 相同写法。

若 **`logs/backend` 始终为空** 且 `docker logs miniapp-backend` 里出现 **`init_logger failed` / 找不到 `log_config.json`**：说明进程在启动阶段就退出了，尚未写文件。请确认 ECS 仓库里存在 **`src/sysconfig/production/log_config.json`**（与 compose 挂载一致），并在服务器执行 **`docker compose build --no-cache`** 后重建容器，保证镜像内 **`dist/sysconfig/production/`** 也有该文件。
