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
