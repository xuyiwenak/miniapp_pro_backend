## ADDED Requirements

### Requirement: 邀请裂变统计
系统 SHALL 提供 `GET /begreat-admin/invites/stats`，返回：
- `totalInviteCodes`：已生成邀请码总数
- `totalRedeemed`：已成功兑换（邀请好友完成测评并解锁）的次数
- `totalUnlocked`：通过邀请解锁的报告数（inviteRewards 成功兑换数）
- `conversionRate`：兑换率 = totalRedeemed / totalInviteCodes（百分比）
- `topInviters`：邀请成功数最多的前 10 名 openId 列表（含 openId 和 redeemCount）

#### Scenario: 正常返回裂变统计
- **WHEN** 调用 `GET /begreat-admin/invites/stats`
- **THEN** 返回 200 和包含以上所有字段的对象

#### Scenario: 无邀请数据时不报错
- **WHEN** invitecodes 和 inviterewards 集合均为空
- **THEN** 返回 200，所有计数为 0，topInviters 为空数组

### Requirement: 邀请记录列表
系统 SHALL 提供 `GET /begreat-admin/invites`，返回邀请码列表，支持：
- `page`（默认 1）、`pageSize`（默认 20）
- `openId`：按邀请人筛选

每条记录 SHALL 包含：`code`、`ownerOpenId`、`redeemCount`、`createdAt`、`recentRedeems`（最近 3 次兑换的 redeemerOpenId 和时间）。

#### Scenario: 查询邀请码列表
- **WHEN** 调用 `GET /begreat-admin/invites?page=1&pageSize=20`
- **THEN** 返回分页的邀请码列表，含 total 字段

#### Scenario: 按邀请人筛选
- **WHEN** 调用 `GET /begreat-admin/invites?openId=oXxx`
- **THEN** 只返回该 openId 生成的邀请码
