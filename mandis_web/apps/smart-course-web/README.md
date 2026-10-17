# smartCourse Web

以原色有感教育版为基础派生的独立网页。教师工作台为默认入口，学生使用 `#/join/:code` 课程链接。
复用 `@education/ui` 的背景和色彩；不引入 Mandis 的测评状态机或疗愈数据。

在 mandis_web 执行 `npm run dev:smartCourse` / `npm run build:smartCourse`。
默认路径 `/smartcourse/`、端口 5178；可用 VITE_BASE_PATH、VITE_API_BASE、SMARTCOURSE_DEV_API 配置。
API 默认同源 `/smartcourse-api`，开发代理到 127.0.0.1:43002。
真实接入及教师开通见 `../../../src/apps/smartCourse/README.md`（相对仓库根导航）。

学生上传、发送失败会保留当前表单以便手动重试；不实现后台自动同步。
助教对话在有上下文的面板中打开，用户可选择当前作品或不附图。页面不会要求学生填写图片 URL 或应用 ID。
