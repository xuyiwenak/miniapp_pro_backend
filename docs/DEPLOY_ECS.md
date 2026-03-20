# ECS / Docker Compose 部署说明

## 配置目录（线上）

- 使用环境名 **`production`**，对应目录 **`src/sysconfig/production/`**（`db_config` 内为 Compose 服务名 `mongo` / `redis`）。
- 容器内 **`SYSCONFIG_ROOT=/app/config`**，卷 **`./src/sysconfig:/app/config:ro`**。
- ECS 示例路径：`/root/workspace/miniapp_pro_backend/src/sysconfig` → `/app/config`。

## 推荐发布流程（与 git pull 同步配置）

```bash
cd /root/workspace/miniapp_pro_backend
git pull origin main
docker compose build backend_app   # 代码有变更时
docker compose up -d
```

## GitHub Actions

1. **在 ECS 上**：`git pull` + `docker compose up -d`。
2. **在 Actions 中 SSH**：执行同上；或构建镜像后 `docker pull` 再启动。

密钥请放在 **`src/sysconfig/production/server_auth_config.json`**（或 CI 下发），勿提交到仓库。

## 日志文件落盘到宿主机

`docker-compose.yml` 已挂载 **`./logs/backend:/app/logs`**。生产环境 `production/log_config.json` 中日志路径为相对进程工作目录 **`/app`** 的 **`logs/*.log`**，即写入 **`/app/logs`**，对应宿主机 **`项目根/logs/backend/`**（如 `server.log`、`game.log` 等按日期滚动）。

查看容器标准输出：`docker logs miniapp-backend`。

## 本地开发（非 Docker）

见 **[`CONFIG_ENVIRONMENTS.md`](CONFIG_ENVIRONMENTS.md)**，使用 **`development/`** 与 **`ENV=development`**。
