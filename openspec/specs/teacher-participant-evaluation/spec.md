# teacher-participant-evaluation Specification

## Purpose

让教师或科研工作者在课堂测评结果页先浏览精简的匿名参与记录，再按需查看单个参与者的量表结果、作品和 AI
回响。页面用于匿名课堂记录与研究核查，不提供教师评分、心理诊断或疗效判断。

## Requirements

### Requirement: 匿名参与记录为结果页主内容

结果页 SHALL 以匿名参与记录列表作为主内容，并隐藏横向展开的个体量表分值。

#### Scenario: 浏览课堂结果

- **WHEN** 教师打开处于 `closing` 或 `closed` 状态的课堂结果
- **THEN** 页面 SHALL 展示课堂编号、匿名画像、记录完整性、作品、上传者和 AI 状态
- **AND** 每条记录 SHALL 提供“查看评价”入口
- **AND** 页面 SHALL NOT 展示姓名、手机号、学号或内部 `participantId`

### Requirement: 单个参与者评价弹窗

系统 SHALL 在教师点击“查看评价”后，展示该匿名参与者的作品、AI 回响和量表结果。

#### Scenario: AI 回响已完成

- **WHEN** 参与者作品的 AI 状态为 `success`
- **THEN** 弹窗 SHALL 展示作品图像、颜色与线条观察、摘要、构图观察和可用建议
- **AND** SHALL 说明 AI 仅辅助整理视觉特征，不用于心理诊断或课程评分

#### Scenario: AI 回响尚未完成

- **WHEN** AI 状态为 `pending`
- **THEN** 弹窗 SHALL 展示处理中状态并在页面可见时自动刷新
- **WHEN** AI 状态为 `failed` 或 `none`
- **THEN** 弹窗 SHALL 展示对应的非阻塞状态，量表结果仍可查看

### Requirement: 两套量表独立呈现

弹窗 SHALL 将 SAM-VAD 与 I-PANAS-SF 作为两个独立卡片展示。

#### Scenario: 查看量表结果

- **WHEN** 单个参与者评价加载成功
- **THEN** SAM-VAD 卡片 SHALL 展示愉悦度、唤醒度和掌控度的课前、课后与变化
- **AND** I-PANAS-SF 卡片 SHALL 展示 PA、NA 的课前、课后与变化
- **AND** 两个卡片 SHALL 分别显示各自版本
- **AND** 变化 SHALL 使用“上升”“下降”或“保持不变”的中性表述

### Requirement: 无数据库迁移的版本兼容

系统 SHALL 从现有组合量表版本生成两个展示字段，不要求迁移历史参与记录。

#### Scenario: 读取当前历史版本

- **WHEN** 历史记录版本为 `sam-vad-ipanas-sf-v1`
- **THEN** 接口 SHALL 返回 SAM-VAD `sam-vad-v1`
- **AND** SHALL 返回 I-PANAS-SF `ipanas-sf-v1`

#### Scenario: 后续独立升级版本

- **WHEN** 组合版本使用 `SAM-VAD版本__I-PANAS-SF版本` 格式
- **THEN** 接口 SHALL 分别返回分隔符两侧的版本值
- **AND** SHALL NOT 修改或回填历史数据库记录

## Non-Functional Requirements

- 单个参与者详情接口 SHALL 复用课堂所有者与协作者权限检查。
- 作品签名地址与 AI 文本 SHALL 仅在教师明确打开单条记录时返回，不随列表批量返回。
- 弹窗 SHALL 支持窄窗口单列布局、键盘关闭和明确焦点样式。
