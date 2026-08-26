# ECS / Docker Compose 部署说明

## 配置目录（线上）

- 使用环境名 **`production`**，对应目录 **`src/sysconfig/production/`**（`db_config` 内为 Compose 服务名 `mongo` / `redis`）。
- 容器内 **`SYSCONFIG_ROOT=/app/config`**，卷 **`./src/sysconfig:/app/config:ro`**。
- ECS 示例路径：`/root/workspace/miniapp_pro_backend/src/sysconfig` → `/app/config`。

## 推荐发布流程（Apple Silicon 本地构建）

```bash
# 本地：先将 master 合入并推送到 release
./scripts/release.sh

# 本地：构建 linux/amd64 镜像，传入 ECS 后重启两个应用服务
./scripts/deploy_amd64_image.sh
```

脚本只构建 `origin/release` 的精确提交；服务器会先拉取并校验同一提交，再以 `--no-build` 启动服务。MongoDB、Redis、Nginx 不会重建。

## CI / 其他构建环境

在 x86_64 CI 中也可构建同名镜像后通过 SSH 导入，或改为推送至镜像仓库。ECS 端必须使用 `docker compose up -d --no-build`，避免小规格实例承担构建工作。

密钥请放在 **`src/sysconfig/production/server_auth_config.json`**（或 CI 下发），勿提交到仓库。

## 日志文件落盘到宿主机

`docker-compose.yml` 已挂载 **`./logs/backend:/app/logs`**。生产环境 `production/log_config.json` 中日志路径为相对进程工作目录 **`/app`** 的 **`logs/*.log`**，即写入 **`/app/logs`**，对应宿主机 **`项目根/logs/backend/`**（如 `server.log`、`game.log` 等按日期滚动）。

查看容器标准输出：`docker logs miniapp-backend`。

## 本地开发（非 Docker）

见 **[`CONFIG_ENVIRONMENTS.md`](CONFIG_ENVIRONMENTS.md)**，使用 **`development/`** 与 **`ENV=development`**。
