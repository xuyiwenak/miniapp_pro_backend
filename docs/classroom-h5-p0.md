# 教育版课堂 H5 P0 实现说明

## 研究边界

- 面向成年课堂参与者，不收集手机号、姓名或学号。
- `participantId` 是内部标识；`classroomCode` 是单课堂内随机、去易混淆字符的短编号。
- 前后测均由 VAD 3 项和 I-PANAS-SF 10 项组成，并保存量表版本、数据版本、语言、耗时和恢复标记。
- 学生上传和教师代传作品均可构成完整配对记录，但必须保留上传者角色；仅作品记录不得进入个体前后测分析。
- 教师实时看板只显示阶段与完成数量，不显示测评答案或量表均值。

## 状态定义

学生流程：`preparation → pre_assessment → activity_in_progress → artwork_upload → post_assessment → ai_echo → completed`。

课堂状态：`draft → open → closing → closed`。进入 `closing` 后停止新加入，默认保留 30 分钟宽限期；参与者请求或教师看板刷新时会将到期课堂原子封存。教师也可以在二次确认后提前结束宽限期并立即封存。

作品状态：`not_started`、`student_uploading`、`student_uploaded`、`teacher_upload_pending`、`teacher_uploaded`、`not_provided`。

`participantFlowCompleted` 表示学生端流程完成；`researchRecordComplete` 仅在前测、作品、后测均存在时为真。

## 断点恢复与幂等

- H5 按课堂 access code 保存随机恢复令牌和当前量表草稿，不保存手机号等身份信息。
- 每次量表翻页先写本地缓存，再尝试同步；提交失败不会清除本地答案。
- 页面重新打开后以服务端已提交阶段为准，并用本地未提交草稿恢复当前页。
- 上传、提交和状态变化携带幂等键；同一课堂参与者只能建立一份作品记录。

## 图片与权限

- 支持 JPG、PNG、WEBP，最大 10 MB；上传前执行格式、尺寸、内容安全与课堂内重复文件校验。
- JPEG APP1 元数据在持久化前移除，避免保留定位和设备 EXIF。
- 教师代传仅允许课堂创建者在 `open` 或 `closing` 状态操作，并记录参与者、课堂编号、作品、上传教师、原因、时间和幂等键。
- 已有作品不能直接覆盖；封存后 P0 不允许修改，后续修正必须另建带审计的研究人员流程。

## 教师测评结果

- `draft` 和 `open` 阶段不提供测评结果；`closing` 阶段提供标注为“暂定”的课堂观察结果；`closed` 阶段提供封存后的最终结果。
- 自动统计仅包含描述性统计：样本量、均值、中位数、样本标准差和上升/相同/下降人数，不计算显著性、P 值或因果结论。
- VAD 的愉悦度、唤醒度和掌控度分别报告；I-PANAS-SF 的积极情绪 PA 与消极情绪 NA 分别报告，不计算 VAD 总分或“净情绪”。
- 前后比较仅使用同一参与者的有效配对数据；缺失值不填补，前后答案完全相同按真实的“相同”记录。
- 不同 `instrumentVersion` 的记录分别汇总，不跨版本合并。
- 教师端匿名明细显示课堂编号、基础研究资料、量表维度分数、作品状态、上传者角色和 AI 状态，不显示姓名、手机号或课堂进行中的具体逐题答案。
- 课堂封存后可导出 Excel 或 UTF-8 BOM CSV。Excel 包含 `manifest`、`summary`、`participant_wide`、`responses_long` 和 `data_dictionary` 五个工作表。
- 导出文件不包含内部 `participantId`、作品图片地址、自由文本或联系方式；所有字符串均防范表格公式注入。
- 每次导出记录教师、课堂、格式、数据集版本、记录数、导出时间和文件 SHA-256，用于研究审计追踪。
- 教师接口为 `GET /teacher/classrooms/:classId/assessment-results`、`GET /teacher/classrooms/:classId/assessment-results/participants` 和 `GET /teacher/classrooms/:classId/assessment-results/export?format=xlsx|csv`。

## 部署配置

`CLASSROOM_STUDENT_BASE_URL` 可配置学生 H5 的公开基础地址，例如 `https://example.com/classroom`。未配置时按当前请求域名生成 `/classroom/:accessCode`。
