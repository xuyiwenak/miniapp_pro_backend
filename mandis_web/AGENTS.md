# Mandis Web workspace 导航

这是 npm workspaces 管理的三个独立前端和一个共享包。先确定用户角色，再进入对应目录；不要在一个应用中复制另一个
应用已经放入 `@mandis/common` 的类型和课堂文案。

| Workspace | 用户与用途 | 线上路径 |
|---|---|---|
| `apps/creator-web` | 原有个人用户：登录、上传个人作品、查看报告和资料 | `/art/` |
| `apps/student-h5` | 成人学生：扫码参与一次教育课堂 | `/classroom/` |
| `apps/teacher-web` | 教师/科研工作者：配置课堂、看进度、分析与导出 | `/teacher/` |
| `packages/common` | 三端可共享的课堂类型、状态和稳定文案 | 不单独部署 |

## 命令

在本目录运行：

```bash
npm run dev:creator
npm run dev:student
npm run dev:teacher
npm run build:creator
npm run build:student
npm run build:teacher
npm run build
```

## 边界

- 三个应用是独立构建和发布单元；修改学生端不应要求发布教师端，反之亦然。
- API 基址、路由 basename 和部署路径通过环境/构建配置管理，不在组件里硬编码域名。
- 共享包只放跨应用稳定契约；页面状态、网络请求、浏览器存储和 Ant Design 组件留在具体应用。
- 视觉保持原色有感的水彩、奶油白与青绿色体系，同时满足根目录 WCAG 规则。
- 教育版默认不修改 `mandis/` 微信小程序，也不修改 `commander/` 管理后台。

继续读取目标 workspace 中的 `AGENTS.md`。
