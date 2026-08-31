# 教育版课堂 H5 P0 实现说明

## 研究边界

- 面向成年课堂参与者，不收集手机号、姓名或学号。
- `participantId` 是内部标识；`classroomCode` 是单课堂内随机、去易混淆字符的短编号。
- 前后测均由 VAD 3 项和 I-PANAS-SF 10 项组成，并保存量表版本、数据版本、语言、耗时和恢复标记。
- 学生上传和教师代传作品均可构成完整配对记录，但必须保留上传者角色；仅作品记录不得进入个体前后测分析。
- 教师实时看板只显示阶段与完成数量，不显示测评答案或量表均值。

## 状态定义

学生流程：`preparation → pre_assessment → activity_in_progress → artwork_upload → post_assessment → ai_echo → completed`。

课堂状态：`draft → open → closing → closed`。进入 `closing` 后停止新加入，默认保留 30 分钟宽限期；当前版本不运行独立的后台自动封存任务。参与者请求或教师看板刷新时可完成到期状态收敛，教师也可以在二次确认后提前结束宽限期并立即封存。

作品状态：`not_started`、`student_uploading`、`student_uploaded`、`teacher_upload_pending`、`teacher_uploaded`、`not_provided`。

`participantFlowCompleted` 表示学生端流程完成；`researchRecordComplete` 仅在前测、作品、后测均存在时为真。

## 断点恢复与幂等

- H5 按课堂 access code 保存随机恢复令牌和当前量表草稿，不保存手机号等身份信息。
- 每次量表翻页先写本地缓存，再尝试同步；提交失败不会清除本地答案。
- 当前版本不建立本地草稿自动重试队列；失败后由学生在恢复页面主动再次点击当前操作。
- 页面重新打开后以服务端已提交阶段为准，并用本地未提交草稿恢复当前页。
- 入课前先在本机保存恢复令牌；入课、最终提交、上传和状态变化使用稳定幂等键，手动重试不会重复创建参与者或作品。

## 图片与权限

- 支持 JPG、PNG、WEBP，最大 10 MB；上传前执行格式、尺寸、内容安全与课堂内重复文件校验。
- 服务端按 EXIF 方向旋转像素，并在重新编码时移除 JPG、PNG、WEBP 的定位、设备等元数据；同时校验解码后尺寸和总像素数。
- 教师代传允许课堂创建者或已授权协作教师在 `open` 或 `closing` 状态操作，并记录参与者、课堂编号、作品、上传教师、原因、时间和幂等键。
- 已有作品不能走普通代传覆盖；`closing` 或 `closed` 阶段通过“研究数据修正”执行缺失作品补传或替换，并保存前后文件摘要与完整审计记录。

## 教师与协作权限

- 课堂创建者可创建、编辑草稿、开放、关闭、提前结束宽限期和管理协作教师。
- 被授权的教师或研究人员使用自己的教师账号，可查看实时进度、测评汇总、执行普通代传和研究修正，但不能控制课堂生命周期。
- 课堂关闭确认会展示已进入、已完成、未完成、待代传、缺前测、缺后测、完整配对及预计宽限期截止时间。
- 普通代传列表仅显示匿名课堂编号、阶段、前后测是否提交、作品状态、进入时间和最后活动时间，不显示具体答案。

## 教师测评结果

- `draft` 和 `open` 阶段不提供测评结果；`closing` 阶段提供标注为“暂定”的课堂观察结果；`closed` 阶段提供封存后的最终结果。
- 自动统计仅包含描述性统计：样本量、均值、中位数、样本标准差和上升/相同/下降人数，不计算显著性、P 值或因果结论。
- VAD 的愉悦度、唤醒度和掌控度分别报告；I-PANAS-SF 的积极情绪 PA 与消极情绪 NA 分别报告，不计算 VAD 总分或“净情绪”。
- 前后比较仅使用同一参与者的有效配对数据；缺失值不填补，前后答案完全相同按真实的“相同”记录。
- 不同 `instrumentVersion` 的记录分别汇总，不跨版本合并。
- 教师端匿名明细显示课堂编号、基础研究资料、量表维度分数、作品状态、上传者角色和 AI 状态，不显示姓名、手机号或课堂进行中的具体逐题答案。
- 课堂封存后可导出 Excel 或 UTF-8 BOM CSV。Excel 包含 `manifest`、`summary`、`participant_wide`、`responses_long` 和 `data_dictionary` 五个工作表。
- 导出文件不包含内部 `participantId`、作品图片地址、自由文本或联系方式；所有字符串均防范表格公式注入。
- 导出同时记录量表版本、数据结构版本、知情同意版本、作答时长、本地缓存恢复标记、作品上传角色及代传/修正原因。
- 每次导出记录教师、课堂、格式、数据集版本、记录数、导出时间和文件 SHA-256，用于研究审计追踪。
- 教师接口为 `GET /teacher/classrooms/:classId/assessment-results`、`GET /teacher/classrooms/:classId/assessment-results/participants` 和 `GET /teacher/classrooms/:classId/assessment-results/export?format=xlsx|csv`。

## 部署配置

`CLASSROOM_STUDENT_BASE_URL` 可配置学生 H5 的公开基础地址，例如 `https://example.com/classroom`。未配置时按当前请求域名生成 `/classroom/:accessCode`。
