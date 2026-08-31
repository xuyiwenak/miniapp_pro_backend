# art_backend 仓库导航

本仓库同时包含 Node.js/TypeScript 后端、Mandis 教育版 Web workspace、Nginx 配置和部署脚本。开始修改前先读
根目录 `../AGENTS.md`；后端代码还必须遵守 `CODING_GUIDELINES.md`。

## 目录地图

| 目录 | 职责 |
|---|---|
| `src/apps/mandis/` | Mandis 服务入口、课堂 API、教师 API、研究统计与实体 |
| `src/apps/begreat/` | BeGreat 服务；教育版需求通常不改 |
| `src/shared/miniapp/` | 跨应用认证、响应、中间件等共享能力 |
| `src/dbservice/model/GlobalInfoDBModel.ts` | 全局 Mongoose 模型注册入口 |
| `mandis_web/` | Creator、Student H5、Teacher Web 与 common 的 npm workspace |
| `test/mandis/` | Mandis 业务单元测试 |
| `nginx/conf.d/` | 线上静态站点和 `/api` 反向代理配置 |
| `scripts/` | release、后端镜像和三个 Web 应用的部署脚本 |
| `openspec/specs/` | 已定义领域的业务规格；命中领域时先读对应 spec |

教育课堂后端任务继续读 `src/apps/mandis/AGENTS.md`；Web 任务继续读 `mandis_web/AGENTS.md`。

## 常用验证

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

按改动范围运行最小充分验证；涉及课堂实体、鉴权、生命周期或数据导出时需要执行相关 Mandis 测试，提交前再运行
完整 `typecheck` 和 `lint`。

## 发布边界

- 每次部署前必须先从工作区根目录运行 `./deploy.sh smart`，核对最小发布计划，再用
  `./deploy.sh smart --execute` 执行。只有计划出现 `[后端镜像]` 时才构建和传输镜像。
- 纯前端发布只构建并 rsync 对应静态目录，不得重建后端镜像，不重启 Docker，不 reload Nginx。
- 发布后必须验证远端入口哈希、公网页面和新 CSS/JS 资源；后端发布还要检查 Compose 服务状态。
- 后端：本地 `master` 提交后运行 `bash scripts/release.sh`，服务器只通过 Git 同步；镜像发布使用
  `bash scripts/deploy_amd64_image.sh`。不要用 `scp` 覆盖服务器源码。
- 三个 Web 应用分别运行根目录的 `./deploy.sh creator-web|student-h5|teacher-web`，互不捆绑发布。
- `commander` 是另一个 Git 仓库和发布单元，不要从本仓库的教师功能顺带修改它。
- 发布属于外部状态变更，只有用户明确要求发布时才能执行。

## 工作树安全

仓库经常含用户正在编辑的文件。先查看 `git status --short`，保留所有非本任务修改；禁止清理 `.omx/`、构建产物
或服务器本地文件，除非用户明确指定。
