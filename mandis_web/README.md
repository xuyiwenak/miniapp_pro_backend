# Mandis Web Workspace

Mandis 网页端采用 npm workspaces 管理。三个应用可以独立开发、构建和发布，共享稳定的课堂类型与文案。

| 目录 | 发布路径 | 用户与职责 |
|---|---|---|
| `apps/creator-web` | `/art/` | 原有个人用户：上传作品、查看个人报告与资料 |
| `apps/student-h5` | `/classroom/` | 学生扫码参与课堂、完成前后测与作品流程 |
| `apps/teacher-web` | `/teacher/` | 教师/科研工作者配置课堂、实时看板和代传作品 |
| `packages/common` | 不单独发布 | 跨端课堂类型、状态和双语文案 |

`commander` 是管理员后台，不承载教师功能，也不依赖本工作区。

## 本地开发

在 `mandis_web` 目录执行：

```bash
npm install
npm run dev:creator
npm run dev:student
npm run dev:teacher
```

三个开发命令需要分别在独立终端运行。也可以执行 `npm run build` 一次构建全部应用。

## 独立发布

从项目根目录分别执行：

```bash
./deploy.sh creator-web
./deploy.sh student-h5
./deploy.sh teacher-web
```

每个目标只更新自己的静态目录。后端接口仍由 `art_backend` 服务提供。
