## ADDED Requirements

### Requirement: 用户列表分页查询
系统 SHALL 提供 `GET /begreat-admin/users`，返回去重 openId 的分页用户列表。支持以下查询参数：
- `page`（默认 1）、`pageSize`（默认 20，最大 100）
- `openId`：精确匹配筛选
- `startDate` / `endDate`：按首次 session 创建时间筛选（ISO 8601）

每条用户记录 SHALL 包含：`openId`、`firstSeenAt`（最早 session 时间）、`lastSeenAt`、`sessionCount`、`paidCount`、`latestStatus`。

#### Scenario: 分页查询所有用户
- **WHEN** 调用 `GET /begreat-admin/users?page=1&pageSize=20`
- **THEN** 返回 200，包含 `{ total, page, pageSize, data: UserSummary[] }`

#### Scenario: 按 openId 精确搜索
- **WHEN** 调用 `GET /begreat-admin/users?openId=oXxx123`
- **THEN** 返回匹配的用户记录（0 或 1 条），不报错

#### Scenario: 按日期范围筛选
- **WHEN** 调用 `GET /begreat-admin/users?startDate=2026-01-01&endDate=2026-01-31`
- **THEN** 只返回首次 session 在该日期范围内的用户

### Requirement: 用户行为时间线
系统 SHALL 提供 `GET /begreat-admin/users/:openId/timeline`，聚合该 openId 在所有集合中的事件，返回统一格式的时间线。

**事件类型（type）：**
- `session_start`：session 创建，detail 含 sessionId、gender、age、assessmentType
- `session_complete`：session 完成，detail 含 sessionId、personalityLabel、topCareers 前3名
- `payment_created`：支付单创建，detail 含 outTradeNo、amount
- `payment_success`：支付成功回调，detail 含 outTradeNo、paidAt
- `invite_code_generated`：邀请码生成，detail 含 code
- `invite_redeemed`：邀请码被使用，detail 含 inviteCode、redeemerOpenId
- `admin_grant`：管理员手动解锁，detail 含 sessionId、grantReason、grantedAt

返回格式：`{ openId, events: TimelineEvent[] }`，按 timestamp 降序排列。

#### Scenario: 查询有完整记录的用户时间线
- **WHEN** 调用 `GET /begreat-admin/users/oXxx123/timeline`，该用户有测评、支付、邀请记录
- **THEN** 返回所有相关事件的有序时间线，最新事件在前

#### Scenario: 查询无记录的 openId
- **WHEN** 调用不存在的 openId
- **THEN** 返回 200，`{ openId, events: [] }`（不报 404）

#### Scenario: 时间线事件跨集合聚合
- **WHEN** 用户有多笔支付记录和多次测评
- **THEN** 所有事件按时间正确合并排序，不重复不遗漏
