# ECS / Docker Compose 部署说明

## 配置从哪里来

- 业务 JSON（`zone_config.json`、`db_config.json`、`log_config.json`、`server_auth_config.json` 等）放在 **`src/sysconfig/<environment>/`**。
- 容器通过 **`SYSCONFIG_ROOT=/app/config`** 与卷挂载 **`./src/sysconfig:/app/config:ro`** 读取；其中 `<environment>` 须与 Compose 里的 `environment` / `ENV` 一致（当前示例为 **`development`**，对应目录 `src/sysconfig/development/`）。
- 在 ECS 上若仓库路径为 `/root/workspace/miniapp_pro_backend`，则等价于挂载  
  `/root/workspace/miniapp_pro_backend/src/sysconfig` → `/app/config`。

## 推荐发布流程（与 git pull 同步配置）

在 ECS 项目根目录执行（路径按你机器为准）：

```bash
cd /root/workspace/miniapp_pro_backend
git pull origin main   # 或你的默认分支
docker compose build backend_app   # 代码有变更时
docker compose up -d
```

仅配置 JSON 变更、镜像无需重编时，可省略 `build`，直接 `docker compose up -d`。

## GitHub Actions

常见两种做法：

1. **在 ECS 上 cron/手动**：只负责 `git pull` + `docker compose up -d`（本仓库 Compose 已按「pull 后启动」写好相对路径 `./src/sysconfig`）。
2. **在 Actions 里 SSH 到 ECS**：执行与上面相同的命令；或将镜像推到镜像仓库，再在 ECS `docker pull` + `compose up`。

密钥类文件若未进 Git，请在 ECS 上单独放置到 `src/sysconfig/development/`（或对应环境目录），或通过 CI 在部署步骤中写入，**不要**把密钥提交到公开仓库。

## 切换到 `production` 配置目录

若新增 `src/sysconfig/production/`，将 `docker-compose.yml` 中 `backend_app.environment` / `ENV` 改为 `production`，并确认该目录下包含所需 JSON。
