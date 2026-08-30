# 教育版课堂 H5 P0 实现说明

## 研究边界

- 面向成年课堂参与者，不收集手机号、姓名或学号。
- `participantId` 是内部标识；`classroomCode` 是单课堂内随机、去易混淆字符的短编号。
- 前后测均由 VAD 3 项和 I-PANAS-SF 10 项组成，并保存量表版本、数据版本、语言、耗时和恢复标记。
- 学生上传和教师代传作品均可构成完整配对记录，但必须保留上传者角色；仅作品记录不得进入个体前后测分析。
- 教师实时看板只显示阶段与完成数量，不显示测评答案或量表均值。

## 状态定义

学生流程：`preparation → pre_assessment → activity_in_progress → artwork_upload → post_assessment → ai_echo → completed`。

课堂状态：`draft → open → closing → closed`。进入 `closing` 后停止新加入，默认保留 30 分钟宽限期；参与者请求或教师看板刷新时会将到期课堂原子封存。

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

## 部署配置

`CLASSROOM_STUDENT_BASE_URL` 可配置学生 H5 的公开基础地址，例如 `https://example.com/classroom`。未配置时按当前请求域名生成 `/classroom/:accessCode`。
