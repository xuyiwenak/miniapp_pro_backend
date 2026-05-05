## ADDED Requirements

### Requirement: KPI 数据统计
系统 SHALL 提供 `GET /begreat-admin/dashboard/stats`，返回以下实时统计数据：
- `todayNewUsers`：今日（自然日 00:00）新开 session 的去重 openId 数
- `todayCompletedSessions`：今日完成（status = completed | paid | invite_unlocked）的 session 数
- `todayPaidSessions`：今日 status = paid 的 session 数
- `todayRevenue`：今日支付成功（payments.status = success）的金额总和（单位：分）
- `totalUsers`：历史累计去重 openId 数
- `totalPaidSessions`：历史累计付费 session 数
- `conversionRate`：完成测评用户中付费的比例（paid / completed，百分比，保留两位小数）
- `anomalyCount`：当前掉单数（支付成功但 session 未 paid）

#### Scenario: 正常返回统计数据
- **WHEN** 管理员调用 `GET /begreat-admin/dashboard/stats`
- **THEN** 返回 200 和包含上述所有字段的对象，所有数字字段 MUST 为非负整数或浮点数

#### Scenario: 数据库无数据时不报错
- **WHEN** 所有集合均为空（新环境）
- **THEN** 返回 200，所有计数字段为 0，conversionRate 为 0

### Requirement: 趋势数据查询
系统 SHALL 提供 `GET /begreat-admin/dashboard/trend?days=7`，返回最近 N 天（默认 7，最大 30）的逐日数据数组，每项包含 `{ date, newSessions, completedSessions, paidSessions, revenue }`。前端用折线图展示。

#### Scenario: 查询最近 7 天趋势
- **WHEN** 调用 `GET /begreat-admin/dashboard/trend?days=7`
- **THEN** 返回长度为 7 的数组，每项对应一个自然日，缺数据的日期各字段为 0

#### Scenario: days 超出上限
- **WHEN** 传入 `days=100`
- **THEN** 系统使用 days=30（上限截断），不报错
