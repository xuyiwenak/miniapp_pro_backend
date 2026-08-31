# @mandis/common 边界

此包与 `apps/*` 并列，承载跨前端共享且稳定的纯 TypeScript 契约。

- `src/classroomTypes.ts`：课堂、参与、量表、作品、进度和统计类型。
- `src/classroomCopy.ts`：跨端一致的课堂状态/步骤文案。
- `src/index.ts`：唯一公开导出入口。

可以放入：教师端和学生端都需要、语义完全一致且不依赖运行环境的类型、常量和纯函数。

不要放入：React 页面/Hook、Ant Design 组件、Axios 客户端、认证 token、localStorage、浏览器 API、应用专属 CSS、只被
一个应用使用的临时类型。修改公开契约后至少运行 `npm run build:student` 和 `npm run build:teacher`。
