# Mandis 后端模块地图

本目录同时服务个人创作 Web、学生课堂 H5、教师课堂 Web 和 Mandis 管理 API。教育课堂改动应限定在课堂相关实体、
路由和服务中，不要把教师权限接到 `mandisAdmin`。

## 教育课堂入口

| 文件/目录 | 职责 |
|---|---|
| `miniapp/server.ts` | Express 路由装配；应用内部路径在这里注册 |
| `miniapp/routes/classroomsPublic.ts` | 学生扫码后的公开课堂信息 |
| `miniapp/routes/classroomParticipation.ts` | 学生参与、前后测、创作、作品和反馈流程 |
| `miniapp/routes/teacher.ts` | 教师身份激活与教师路由入口 |
| `miniapp/routes/teacherClassrooms.ts` | 课堂配置、开放/关闭、实时看板、代上传和协作者 |
| `miniapp/routes/teacherClassroomAssessmentResults.ts` | 课堂测评汇总、参与者明细与 CSV/XLSX 导出 |
| `miniapp/routes/teacherClassroomCorrections.ts` | 封存后作品补传/替换及审计 |
| `miniapp/services/classroomResearch.ts` | 匿名编号、量表完整性、研究记录判定和图片元数据处理 |
| `miniapp/services/classroomLifecycle.ts` | `draft → open → closing → closed` 生命周期 |
| `miniapp/services/classroomAssessmentResults.ts` | VAD、I-PANAS-SF 前后测描述统计 |
| `miniapp/services/classroomAssessmentExport.ts` | 研究数据导出格式 |
| `entity/classroom.entity.ts` | 课堂配置与状态 |
| `entity/classroomParticipation.entity.ts` | 匿名参与、量表、作品和完整性状态 |
| `entity/teacherProfile.entity.ts` | 教师身份；与管理员身份分离 |
| `entity/*Audit.entity.ts` | 数据导出、封存后修正的审计记录 |

模型新增或变更后同步检查 `../../dbservice/model/GlobalInfoDBModel.ts` 的注册和索引创建。

## 不可破坏的业务约束

- 参与者以 `participantId` 作为内部标识；面向代上传只暴露课堂内唯一的 `classroomCode`。
- 不保存姓名—编号、手机号或学号映射；教师实时看板不返回具体测评答案。
- `participantFlowCompleted` 与 `researchRecordComplete` 是两个独立概念，不能互相替代。
- `artwork_only` 记录不能伪装成完整前后测参与者。
- 学生作品、教师代传、封存后修正必须区分上传角色并保留幂等键和审计信息。
- `closing` 禁止新参与者进入，已有参与者可在宽限期继续；教师可提前 `finalize`。
- 当前没有独立定时任务负责自动封存；过期封存由相关请求触发。不要声称存在后台自动任务。
- 量表与数据结构必须保存版本，缺失值不得静默填补。

## 验证定位

- 研究与量表：`test/mandis/classroomResearch.test.ts`
- 图片处理与重复上传：`test/mandis/classroomArtwork.test.ts`
- 统计、权限和导出：`test/mandis/classroomAssessmentResults.test.ts`
- 教师身份：`test/mandis/teacherProfile.test.ts`
- Web 认证：`test/mandis/webAuth*.test.ts`、`test/mandis/webSession.test.ts`

API 输入使用 Zod，状态写入需要幂等性时必须显式校验 `Idempotency-Key`。不要在响应或日志中输出参与 token、登录
token、完整量表答案或图片中的设备元数据。
