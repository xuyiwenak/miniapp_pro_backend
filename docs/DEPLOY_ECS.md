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

## 本地开发（非 Docker）

见 **[`CONFIG_ENVIRONMENTS.md`](CONFIG_ENVIRONMENTS.md)**，使用 **`development/`** 与 **`ENV=development`**。
