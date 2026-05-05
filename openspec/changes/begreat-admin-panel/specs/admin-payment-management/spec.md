## ADDED Requirements

### Requirement: 支付记录列表查询
系统 SHALL 提供 `GET /begreat-admin/payments`，支持以下查询参数：
- `page`（默认 1）、`pageSize`（默认 20，最大 100）
- `status`：`pending | success | failed`
- `openId`：精确匹配
- `startDate` / `endDate`：按 createdAt 筛选

每条记录 SHALL 包含：`outTradeNo`、`sessionId`、`openId`、`amount`（分）、`status`、`paidAt`、`createdAt`。

#### Scenario: 查询所有成功支付
- **WHEN** 调用 `GET /begreat-admin/payments?status=success`
- **THEN** 返回所有 status=success 的支付记录，按 paidAt 降序

#### Scenario: 按用户查询支付历史
- **WHEN** 调用 `GET /begreat-admin/payments?openId=oXxx`
- **THEN** 返回该用户所有支付记录（含 pending/failed）

### Requirement: 掉单检测
系统 SHALL 提供 `GET /begreat-admin/payments/anomalies`，检测"支付成功但报告未解锁"的异常记录。

**检测逻辑：** 在 `payments` 集合中找 `status=success` 的记录，JOIN `assessmentsessions` 集合，过滤出对应 session 的 `status` 不为 `'paid'` 的记录。

每条异常记录 SHALL 包含：`outTradeNo`、`sessionId`、`openId`、`amount`、`paidAt`（支付成功时间）、`sessionStatus`（session 当前状态）、`createdAt`。

#### Scenario: 存在掉单时返回异常列表
- **WHEN** 数据库中有支付成功但 session 未 paid 的记录
- **THEN** 返回 200，data 数组包含所有异常记录

#### Scenario: 无掉单时返回空数组
- **WHEN** 所有支付成功的记录对应的 session 都是 paid 状态
- **THEN** 返回 200，`{ data: [], total: 0 }`

#### Scenario: 已通过 invite_unlocked 解锁不视为掉单
- **WHEN** session status 为 invite_unlocked（邀请解锁）
- **THEN** 该记录 SHALL 不出现在掉单列表（邀请解锁是合法的非付费解锁）

### Requirement: 掉单修复
系统 SHALL 提供 `POST /begreat-admin/payments/fix-anomaly`，接受 `{ sessionId, outTradeNo, reason }`，执行原子性修复操作：
1. 验证 `payments` 中对应 `outTradeNo` 的记录确实为 `status=success`
2. 验证 sessionId 匹配（防止误操作）
3. 将 session status 改为 `'paid'`，写入 `paidAt`（取 payment.paidAt）、`grantedByAdmin: true`、`grantReason: '[掉单修复] ' + reason`

所有 3 步 MUST 在事务中执行（或通过顺序操作保证幂等性）。修复成功后，该 session SHALL 不再出现在 anomalies 列表中。

#### Scenario: 成功修复掉单
- **WHEN** 提供合法的 sessionId 和 outTradeNo（支付成功、session 未 paid）
- **THEN** session status 变为 paid，paidAt 设为 payment.paidAt，返回 200

#### Scenario: outTradeNo 与 sessionId 不匹配
- **WHEN** 提供的 outTradeNo 属于另一个用户的支付记录
- **THEN** 返回 400 `{ success: false, message: 'Payment record does not match session' }`

#### Scenario: 支付记录非 success 状态
- **WHEN** outTradeNo 对应的 payment status 为 pending 或 failed
- **THEN** 返回 400 `{ success: false, message: 'Payment is not in success status' }`

#### Scenario: reason 为空被拒绝
- **WHEN** reason 字段为空或缺失
- **THEN** 返回 400 `{ success: false, message: 'reason is required' }`

#### Scenario: 重复修复幂等处理
- **WHEN** session 已经是 paid 状态，再次调用 fix-anomaly
- **THEN** 返回 200 `{ success: true, alreadyFixed: true }`，数据不变
