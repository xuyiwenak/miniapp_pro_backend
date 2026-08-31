# student-session-review Specification

## Purpose

让成人学生在完成课后测评后等待并查看本次课堂的作品 AI 回响，同时以适合手机截图的分页形式回顾自己的
VAD 与 I-PANAS-SF 前后测结果。该功能用于课堂状态回顾，不提供心理诊断、课程评分或疗效判断。

## Requirements

### Requirement: AI 回响触发完整性

系统 SHALL 在“作品存在”且“课后测评已提交”两个条件首次同时成立时触发作品 AI 分析，且不依赖二者的完成顺序。

#### Scenario: 先上传作品后提交课后测评

- **WHEN** 学生已上传作品并提交课后测评
- **THEN** 系统 SHALL 触发该作品的 AI 分析
- **AND** 学生端 SHALL 进入回响等待状态

#### Scenario: 先提交课后测评后补传作品

- **WHEN** 学生已提交课后测评，之后自行补传作品
- **THEN** 系统 SHALL 在作品保存成功后触发该作品的 AI 分析
- **AND** 不要求学生重复提交课后测评

#### Scenario: 已存在分析任务

- **WHEN** 作品分析状态已经是 `pending` 或 `success`
- **THEN** 系统 SHALL NOT 创建重复分析任务

### Requirement: 有界的 AI 等待体验

学生端 SHALL 在作品存在且分析未完成时自动查询 AI 状态，并让学生清楚知道系统仍在处理。

#### Scenario: 正常等待

- **WHEN** AI 状态为 `none` 或 `pending`
- **THEN** 页面 SHALL 每 5 秒刷新一次状态
- **AND** SHALL 仅在页面可见时发起轮询
- **AND** SHALL 展示等待说明而不是立即显示“先完成课堂”

#### Scenario: AI 在等待期间完成

- **WHEN** AI 状态变为 `success`
- **THEN** 页面 SHALL 自动展示作品回响
- **AND** SHALL 停止继续轮询

#### Scenario: 等待超过两分钟

- **WHEN** 学生已在当前页面等待 120 秒且 AI 仍未完成
- **THEN** 页面 SHALL 告知学生数据已经保存、可稍后重新扫码查看
- **AND** SHALL 允许学生完成课堂，避免被无限阻塞
- **AND** SHALL 在学生以后重新进入时继续展示最新状态

#### Scenario: AI 分析失败或状态查询失败

- **WHEN** AI 状态为 `failed` 或状态查询持续失败
- **THEN** 页面 SHALL 展示可恢复的失败说明
- **AND** SHALL 保留测评结果查看和完成课堂的能力

### Requirement: 完成后仍可查看本次结果

课堂流程完成 SHALL NOT 隐藏本次课堂回顾。

#### Scenario: 已完成后重新扫码

- **WHEN** 学生使用同一设备和参与凭证重新进入已完成课堂
- **THEN** 页面 SHALL 展示本次课堂回顾
- **AND** SHALL 查询并展示当前最新的 AI 回响状态
- **AND** SHALL NOT 要求学生重新填写反馈或测评

#### Scenario: 完成后 AI 才生成成功

- **WHEN** 学生在 AI 超时前选择完成课堂，且 AI 随后生成成功
- **THEN** 学生重新进入课堂时 SHALL 能看到成功的作品回响

### Requirement: 分页课堂状态回顾

系统 SHALL 将学生自己的课堂回顾拆分为四个适合手机查看和逐页截图的页面。

#### Scenario: 第 1 页课堂封面

- **WHEN** 学生打开课堂回顾
- **THEN** 页面 SHALL 展示课堂名称、课次、主题和日期
- **AND** SHALL 说明结果仅是本次课堂状态记录
- **AND** SHALL NOT 展示 `participantId`、课堂匿名编号、姓名、手机号或学号

#### Scenario: 第 2 页 VAD 前后测

- **WHEN** 学生查看 VAD 页面
- **THEN** 页面 SHALL 分别展示愉悦度、唤醒度、掌控感的活动前分数、活动后分数和变化方向
- **AND** SHALL 标明 VAD 量尺范围为 1–9
- **AND** SHALL 说明唤醒度高低没有好坏

#### Scenario: 第 3 页 PA 与 NA 前后测

- **WHEN** 学生查看情绪页面
- **THEN** 页面 SHALL 分别展示积极情绪 PA 和消极情绪 NA 的活动前总分、活动后总分和变化方向
- **AND** SHALL 标明每个维度由 5 个题目相加，范围为 5–25
- **AND** SHALL NOT 把 PA 与 NA 合并为一个综合分

#### Scenario: 第 4 页作品 AI 回响

- **WHEN** 学生查看作品回响页面
- **THEN** 页面 SHALL 根据 AI 状态展示等待、成功、失败或尚无作品的内容
- **AND** 成功状态 SHALL 展示作品图像、颜色与线条观察、摘要及可用建议
- **AND** SHALL 明示 AI 仅作辅助整理，不用于心理诊断或课程评分

#### Scenario: 分页导航与截图

- **WHEN** 学生浏览课堂回顾
- **THEN** 页面 SHALL 提供上一页、下一页和当前页码
- **AND** 每页 SHALL 独立包含课堂标题与页名
- **AND** 页面 SHALL 提示用户可使用系统截图保存本页
- **AND** 触控目标 SHALL 至少为 44×44 CSS 像素

### Requirement: 结果解释边界

课堂回顾 SHALL 使用中性、描述性语言呈现学生自评。

#### Scenario: 分数变化

- **WHEN** 活动前后分数不同
- **THEN** 页面 SHALL 使用“上升”“下降”或“保持不变”描述数值变化
- **AND** SHALL NOT 自动解释为“改善”“恶化”“治愈”或“有效”

#### Scenario: 证据边界

- **WHEN** 展示自评与 AI 内容
- **THEN** 页面 SHALL 说明学生自评是主要记录，AI 仅是作品视觉特征的辅助观察
- **AND** SHALL NOT 展示常模百分位、心理诊断、因果推断或跨课堂比较

## Non-Functional Requirements

### Accessibility

- 页面 SHALL 满足 WCAG 2.2 AA 的文字对比度和键盘焦点要求。
- 状态 SHALL NOT 仅用颜色表达，必须同时提供文字。
- 动画 SHALL 遵循 `prefers-reduced-motion`。

### Reliability

- AI 状态查询失败 SHALL NOT 清除已保存的测评或作品状态。
- 学生端 SHALL 使用服务端恢复的已提交前后测数据生成结果，不依赖已被清理的本地量表草稿。

### Performance

- 课堂回顾的分数计算 SHALL 在浏览器内同步完成，不新增网络请求。
- AI 轮询 SHALL 在成功、失败、组件卸载或页面不可见时停止或暂停。
