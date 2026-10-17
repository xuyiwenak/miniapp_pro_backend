# smartCourse

独立课程智能体应用，网页以原色有感教育版为基础改造。Mandis 的测评、疗愈分析、研究统计和课堂状态机不进入本应用。

## 当前范围

- 教师独立账号登录，创建青花纹样课程，开放/结束课堂，课程链接和二维码，查看匿名参与概况及作品。
- 学生匿名加入（成年人和 AI 处理知情确认）、课程答疑、创作帮助、上传作品、作品交流、完成活动。
- 教师不评分；学生对话不提供给教师或其他学生。无公开注册，教师账号由项目负责人开通。
- 单个 Web 构建提供教师入口和独立学生链接；不修改现有 `/teacher/`、`/classroom/` 业务。
- 当前助教配置只有已发布的青花工作流。课程说明是教学数据，不把本应用宣称为任意课程的通用智能体。
- 列表显示最近 100 条记录，界面注明范围；看板手动刷新。分页、教师代传、协作者、导出与更多助教待独立需求。

## 目录与复用

- `src/apps/smartCourse`：配置、独立 Mongo 模型、权限、课堂、作品、会话、百炼适配器、Express 入口。
- `mandis_web/apps/smart-course-web`：教师与学生页面，同一构建，hash 区分入口。
- `mandis_web/packages/education-ui`：原学生端水彩背景和组件、教育 UI 基础色。Mandis 和 smartCourse 共享。
- `src/shared/storage/oss.ts`：注入配置的 OSS 操作。原 `util/ossUploader.ts` 保持旧签名，转发给公共实现。
- `src/shared/auth/tokenHash.ts`：Mandis 和 smartCourse 共用令牌哈希。
- 复用 `BaseMongoComponent`、公共 HTTP 初始化和日志能力；不加载 Mandis 模型、量表、Player 或 WebSocket 服务。

## 本地运行

需要 Node.js 20+、MongoDB、Redis；在 art_backend 根目录执行。数据库名称必须以 `smartcourse` 开头。

1. 将 `config/smartCourse.env.example` 复制到 Git 忽略的本地文件，填入自己的配置，通过 shell 导入环境变量。
   示例中的 app ID 来自已发布工作流，API Key 必须配置到服务端。不要把 key 放入 Vite 变量或浏览器。
2. `npm run dev:smartCourse` 启动后端（默认 43002）。实际运行需 Mongo/Redis，百炼/OSS 未配置时明确返回不可用。
3. 使用环境变量 `SMARTCOURSE_TEACHER_USERNAME` 与 `SMARTCOURSE_TEACHER_PASSWORD`（12–72 字符），执行
   `npm run smartCourse:teacher` 开通教师。密码以 bcrypt 存储，不支持重复用户名覆盖。执行后清除密码环境变量。
4. `cd mandis_web`，`npm install`，`npm run dev:smartCourse`。
5. 打开 `http://127.0.0.1:5178/smartcourse/`。不要混用 localhost，Origin 必须与配置一致。

正式运行：`npm run build` 后以 `GAME_TYPE=smartCourse ENV=production node dist/apps/smartCourse/front.js` 启动。
前端构建：在 mandis_web 执行 `npm run build:smartCourse`，产物位于 `apps/smart-course-web/dist`。
已补齐 Compose、Nginx 与智能发布脚本；尚未执行线上发布。

## 正式域名与 Docker 部署

正式入口为 `https://smart.starryspark.com.cn`，根路径跳转 `/smartcourse/`。
API 同源路径 `/smartcourse-api/` 转发到独立容器 `smartcourse_app:43002`，端口不映射到公网。
容器复用 ART_BACKEND_IMAGE 镜像，只运行 smartCourse 入口，不挂载 Docker socket。
Mongo 服务共用但使用独立 smartcourse 数据库及专用用户；Redis 共用 DB 2、smartCourse 键前缀。
前端宿主机目录 smartcourse_web_dist 只读挂载给 Nginx，后续纯前端发布无需重启容器。

首次发布准备：

1. 将域名 A 记录指向服务器。2026-10-17 本地 DNS 查询结果为 8.130.47.65。
2. 先准备覆盖该域名的有效 HTTPS 证书及续期，放在服务器
   `/etc/letsencrypt/live/smart.starryspark.com.cn/{fullchain.pem,privkey.pem}`。
   新站点配置启用前必须已有证书；可先用 DNS 验证签发，避免新站点尚未启用时的 HTTP 验证依赖。
3. 在 Mongo 的 smartcourse 库创建专用用户，仅赋予该库 readWrite。
4. 将 `config/smartCourse.production.env.example` 复制为服务器 `config/.smartCourse.env`，权限设为 600。
   填入专用数据库账号、百炼与 OSS 凭据。该文件被 Git 忽略，不打入镜像，不向浏览器提供。
   Compose 中的 SMARTCOURSE_ORIGIN 已固定为正式 HTTPS 域名。
5. 完成测试并提交发布涉及的代码。在工作区根目录先运行 `./deploy.sh smart`，核对计划，
   再执行 `./deploy.sh smart --execute`。执行前自动检查远端数据库配置、应用 ID 和证书；不会打印凭据。
   基础连通性阶段允许百炼/OSS 凭据为空：可建课、加入和完成活动，问答与上传在界面显示暂不可用。
   首次发布先传静态产物，再更新容器/Nginx，最后验证网页和 JS/CSS，避免新路径尚未建立时提前验收失败。
6. 在新容器中运行 `node dist/apps/smartCourse/provisionTeacher.js` 创建教师，
   通过进程环境传入 SMARTCOURSE_TEACHER_USERNAME / SMARTCOURSE_TEACHER_PASSWORD。
   不要把密码写进代码、提交记录或共享命令文本。
7. 验证 `/smartcourse-api/health`、教师登录、扫码加入、真实图片上传与百炼响应。
   二维码来自浏览器当前域名，生产环境不应包含 localhost。

后续前端可通过 `./deploy.sh smart-course-web` 独立发布，仍优先用 smart 计划选择最小范围。
Nginx 允许 12 MB 请求体（应用图片上限 10 MB），API 响应等待 120 秒，不自动重试上游调用。
初次新增挂载会更新 Nginx 容器；后续仅替换静态资源不重启 Docker。
本地 Docker daemon 未启动时只能进行 Compose 静态验证，不能声称镜像构建或容器启动已验证。

## API 与身份

所有接口在 `/smartcourse-api`。前端与 API 同源；写入请求要求 Origin 与 SMARTCOURSE_ORIGIN 完全匹配。
教师使用 HttpOnly、SameSite=Strict Cookie，Path 为 `/smartcourse-api/teacher`，HTTPS Origin 时使用 Secure。
学生使用独立随机 Bearer token，按课程保存在当前浏览器 localStorage；Redis 保存 token 哈希、角色、参与者与课程。
会话有效期 7 天，清理浏览器存储或会话到期后需要重新加入，当前不提供跨设备恢复。
Redis 使用 `smartCourse:` 前缀，新数据库独立于 Mandis。课程和作品访问均检查当前身份及归属。

| 方法与路径 | 用途 |
|---|---|
| GET /health | 独立进程健康状态 |
| POST /teacher/login | username/password 登录 |
| GET /teacher/me、POST /teacher/logout | 当前身份、撤销会话 |
| GET/POST /teacher/courses | 列表、新建（title、brief） |
| GET /teacher/courses/:courseId | 本教师课堂看板、作品 |
| PATCH /teacher/courses/:courseId | draft→open→closed；closed 不重新开放 |
| GET/POST /join/:code | 公开课程信息、同意后匿名加入 |
| GET /courses/:courseId | 当前学生作品、对话与完成状态 |
| POST /courses/:courseId/artworks | multipart image、statement；10 MB 上限 |
| POST /courses/:courseId/chat | requestId(UUID)、question、mode、可选 artworkId |
| POST /courses/:courseId/complete | 学生主动完成活动，不要求 AI 认可 |

## 智能体接入

采用阿里云工作流应用 API，而非 OpenAI-compatible 模型接口：
`POST https://dashscope.aliyuncs.com/api/v1/apps/{appId}/completion`。
依据官方说明：https://help.aliyun.com/zh/model-studio/invoke-workflow-application

- API Key 只在服务端；创建课程时快照应用 ID 与人工维护的 agentVersion，客户端不能指定应用 ID、图片 URL、上下文。
- `input.prompt` 是当前问题；`input.biz_params` 为 `mode`、`artworkUrl`、`studentStatement`、`contextText`。
- `contextText` 由本课说明与当前参与者同一作品的最近 6 个成功回合生成。切换作品不沿用旧作品的视觉描述；
  不附图时只带无图回合。服务端只查询当前课程+参与者；不使用 provider session_id 或全局记忆。
- OSS 上传先解码、纠正方向、缩放、重新编码以去除 EXIF，再以私有对象保存。
  图片放在 `smartCourse/artworks/{courseId}/{participantId}`，每次调用临时签名 15 分钟；模型超时 90 秒。
  确认 OSS 图片可从百炼地域读取。签名过期后刷新页面重新获取。
- 非流式读取 `output.text`；只展示文本。**当前发布应用输出文本，不擅自假设结构化 JSON 已启用。**
  不传递 reasoningContent、内部节点调试结果、密钥。文本由 React 转义，无 HTML 注入或原样 Markdown 渲染。
- Redis 原子锁串行化同一学生/课程请求；requestId 唯一索引处理重复提交。
  同一 ID 同一内容重发返回已存结果；同一 ID 改内容返回冲突。失败后学生手动新请求才重新调用，不自动重试付费调用。
- 如果进程在调用中退出，锁过期后再次提交原 ID 会将 pending 标为 INTERRUPTED，不盲目再次计费。
- 平台出现 HTTP/格式错误时记录 failed；工作流正常返回“图片无法读取”时保留真实回答，不伪称识图成功。
- 原始 API 错误不返回学生，日志只记录 turnId/错误码。providerRequestId、应用和版本留在服务端记录中。
- agentVersion 是本系统配置标签，不是百炼自动取得的发布版本。更改百炼发布版本时同步更新标签；不能据此声称模型可完全重现。

## 验证

- `npm run typecheck`、`npm run lint`、`npm run build`、`npm test`。
- `npm run test:smartCourse` 使用本机 mongod/redis-server 启动随机端口和临时目录，测试结束清理。
  它测试真实 HTTP、Mongo、Redis、图片解码与模拟百炼响应，不需要线上账号。普通 npm test 跳过这些外部进程集成用例。
- mandis_web 中 `npm run build` 验证原有三端与新端。
- 真实百炼/OSS 联调仍需有效凭据：至少测试无图、有效图、不可读图、图后无图、双学生隔离、断网重发。
- 上线前配置独立 Mongo/Redis 权限、服务端密钥、同源反代、有效 HTTPS Origin；不能把本地回环地址二维码发给学生。
