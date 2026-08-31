# Teacher Web（教师与科研工作者端）

这是多教师课堂产品，不是 `commander` 管理后台。教师和科研工作者在本产品中是同一角色；课堂创建者拥有生命周期
控制权，授权协作者可以查看课堂和执行被允许的研究操作。

## 文件定位

| 文件 | 职责 |
|---|---|
| `src/TeacherAccess.tsx`、`src/api/teacherAuthApi.ts` | 教师身份与访问入口 |
| `src/api/client.ts` | Web 会话、错误与 API 客户端基础能力 |
| `src/api/classroomApi.ts` | 课堂、看板、作品、结果与协作者接口 |
| `src/pages/ClassroomsPage.tsx` | 课堂列表和当前课堂容器 |
| `src/pages/classrooms/ClassroomCreateModal.tsx` | 课程/课堂配置、日期和时间校验 |
| `src/pages/classrooms/ClassroomDashboard.tsx` | 二维码、阶段人数、答题进度、作品和完整性总览 |
| `src/pages/classrooms/TeacherArtworkUpload.tsx` | 按匿名课堂编号代上传 |
| `src/pages/classrooms/ClassroomAssessmentResults.tsx` | VAD/PANAS 汇总、明细与数据导出 |
| `src/pages/classrooms/ClassroomCollaborators.tsx` | 多教师授权管理 |
| `src/pages/classrooms/ClassroomArtworkCorrection.tsx` | 封存后补传/替换和审计记录 |
| `src/pages/classrooms/ClassroomsPage.css` | 教师课堂主界面样式 |

## 产品与权限约束

- 课堂配置包含课程名称、课堂名称、主题、日期、时间、年级、教师显示名、地点/形式；日期默认上海时区当天。
- 开放后生成学生二维码并锁定配置。状态为 `draft → open → closing → closed`。
- 关闭课堂由创建教师发起；默认宽限期 30 分钟，创建教师可提前结束。授权协作者不能替代创建者结束课堂。
- 进行中看板每 5 秒轮询阶段人数和答题进度，页面隐藏或进入后台时暂停，恢复可见后立即刷新。
- 课堂进行中不显示个体答案、VAD/PANAS 均值或前后变化；测评统计在 `closing` 后才显示，宽限期内标记为临时数据。
- 代上传列表只显示匿名课堂编号和非敏感状态，不显示具体测评答案或内部 `participantId`。
- 教师代上传不得覆盖已有学生作品；封存后只能走有原因与审计日志的修正流程。
- `commander` 中不得新增教师业务页面或复用管理员身份作为普通教师身份。

验证：在 workspace 根目录运行 `npm run build:teacher`。看板改动还应检查空课堂、多人不同阶段、`closing`、
`closed`、待代传、API 失败和窄窗口布局。
