# 按变更范围部署

并非所有修改都需要重新构建后端镜像。生产环境已经把三个 Mandis Web 产物、Nginx 配置、系统配置和
静态目录通过 bind mount 挂载到容器中，可以按改动范围选择更小的发布动作。

| 修改范围 | 发布动作 | 重建后端镜像 |
|---|---|---|
| `mandis_web/apps/*` | 只构建对应前端并 rsync 静态文件 | 否 |
| `mandis_web/packages/common` | 构建三个 Mandis Web 应用 | 否 |
| `src/apps/*/sysconfig` | Git 同步并重启对应应用容器 | 否 |
| `nginx/` | Git 同步、`nginx -t`、reload | 否 |
| `static/` | Git 同步，bind mount 自动生效 | 否 |
| `docker-compose.yml` | 使用当前后端镜像更新 Compose 服务 | 否 |
| 后端 `src/`、依赖、Dockerfile、构建配置 | 构建并传输新镜像 | 是 |
| 文档、测试和开发工具 | 无线上运行时发布 | 否 |

后端镜像使用 release commit 生成唯一标签。同一提交重试发布时，脚本会优先复用服务器或本机已有镜像；只有不存在
时才重新构建，并通过压缩流直接传输到服务器，不生成中间镜像包文件。

先查看自动生成的发布计划：

```bash
cd /Users/evan/art_theroy
./deploy.sh smart
```

确认计划后执行：

```bash
./deploy.sh smart --execute
```

脚本默认比较 `origin/release`、当前提交、暂存区、工作区和未跟踪文件。
也可以指定其他基准：

```bash
./deploy.sh smart --base HEAD~1
```

只发布单个前端时，继续使用更直接的命令：

```bash
../deploy.sh creator-web
../deploy.sh student-h5
../deploy.sh teacher-web
```

`--execute` 涉及服务器 Git 同步时要求工作区干净，避免把尚未提交的后端或配置误判为已发布。
纯前端发布沿用现有静态资源流程，不会重启 Docker。
