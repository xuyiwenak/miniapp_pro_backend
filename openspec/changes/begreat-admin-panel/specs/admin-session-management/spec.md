## ADDED Requirements

### Requirement: 测评会话列表查询
系统 SHALL 提供 `GET /begreat-admin/sessions`，支持以下查询参数：
- `page`（默认 1）、`pageSize`（默认 20，最大 100）
- `status`：`in_progress | completed | paid | invite_unlocked`，可多值（逗号分隔）
- `openId`：精确匹配
- `startDate` / `endDate`：按 createdAt 筛选

每条记录 SHALL 包含：`sessionId`、`openId`、`status`、`assessmentType`、`userProfile`（gender/age）、`personalityLabel`、`createdAt`、`paidAt`、`grantedByAdmin`。

#### Scenario: 按状态筛选测评记录
- **WHEN** 调用 `GET /begreat-admin/sessions?status=completed,paid`
- **THEN** 返回 status 为 completed 或 paid 的 session 列表

#### Scenario: 分页查询
- **WHEN** 调用 `GET /begreat-admin/sessions?page=2&pageSize=10`
- **THEN** 返回第 2 页数据，包含 total 字段

### Requirement: 测评会话详情
系统 SHALL 提供 `GET /begreat-admin/sessions/:sessionId`，返回完整 session 数据，包含：
- 基础信息（sessionId、openId、status、userProfile）
- `result.big5Normalized`：五维标准化分数
- `result.topCareers`：匹配职业列表（含 matchScore）
- `result.personalityLabel`
- `result.freeSummary`
- `grantedByAdmin`、`grantReason`（如有）
- `paidAt`、`inviteUnlockedAt`（如有）

answers 原始答案数据 SHALL 不返回（数据量大且无运营价值）。

#### Scenario: 查询存在的 session
- **WHEN** 调用 `GET /begreat-admin/sessions/sess_abc123`
- **THEN** 返回 200 和完整 session 详情（不含 answers）

#### Scenario: 查询不存在的 session
- **WHEN** 调用不存在的 sessionId
- **THEN** 返回 404 `{ success: false, message: 'Session not found' }`

### Requirement: 管理员手动解锁报告
系统 SHALL 提供 `POST /begreat-admin/sessions/:sessionId/grant`，将 session status 改为 `'paid'`，并写入 `grantedByAdmin: true`、`grantReason`（必填）、`paidAt`（如未设置则写入当前时间）。

操作 MUST 是幂等的：对已为 paid 状态的 session 再次调用，返回成功但不修改数据（除非 grantReason 不同）。

#### Scenario: 成功解锁未付费 session
- **WHEN** 调用 `POST /begreat-admin/sessions/sess_abc/grant`，body 为 `{ grantReason: '用户反馈支付异常，客服核实后手动解锁' }`
- **THEN** session status 变为 paid，grantedByAdmin 为 true，返回 200

#### Scenario: grantReason 为空被拒绝
- **WHEN** 调用时 body 中 grantReason 为空字符串或缺失
- **THEN** 返回 400 `{ success: false, message: 'grantReason is required' }`

#### Scenario: 对已 paid session 重复调用
- **WHEN** session 已经是 paid 状态，再次调用 grant 接口
- **THEN** 返回 200 `{ success: true, alreadyPaid: true }`，数据不变

#### Scenario: session 未完成不允许解锁
- **WHEN** session status 为 in_progress（测评未完成）
- **THEN** 返回 400 `{ success: false, message: 'Session not completed yet' }`
