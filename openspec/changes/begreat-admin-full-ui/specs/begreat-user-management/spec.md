## ADDED Requirements

### Requirement: 用户列表页
管理员 SHALL 能在 `/begreat/users` 查看所有 BeGreat 用户的分页列表，支持 openId 精确搜索和首次见到日期范围筛选。

每行记录 SHALL 展示：openId（可点击跳转时间线）、测评次数、付费次数（>0 时绿色 Tag 高亮）、最新状态（Tag 着色）、首次见到时间、最近活动时间。

#### Scenario: 默认加载用户列表
- **WHEN** 管理员访问 `/begreat/users`
- **THEN** 页面 SHALL 展示第 1 页最多 20 条用户记录，并显示总用户数

#### Scenario: 按 openId 搜索
- **WHEN** 管理员在搜索框输入 openId 并提交
- **THEN** 列表 SHALL 只显示匹配的用户（精确匹配，0 或 1 条）

#### Scenario: 按日期范围筛选
- **WHEN** 管理员选择起止日期
- **THEN** 列表 SHALL 只显示首次 session 在该范围内的用户

#### Scenario: 付费用户高亮
- **WHEN** 某用户 paidCount > 0
- **THEN** 该行的付费次数列 SHALL 显示绿色 Tag

#### Scenario: 跳转时间线
- **WHEN** 管理员点击某行的 openId 或"行为时间线"按钮
- **THEN** 页面 SHALL 跳转到 `/begreat/users/:openId`

### Requirement: 用户行为时间线页
管理员 SHALL 能在 `/begreat/users/:openId` 查看该用户的全量行为时间线，事件按时间倒序排列。

页面顶部 SHALL 显示：openId（可复制）、测评次数 Tag、付费次数 Tag（付费 > 0 时显示）。

时间线 SHALL 按事件类型着色区分：
- 测评类（session_start / session_complete）：蓝/青
- 支付类（payment_created / payment_success）：金/绿
- 邀请类（invite_code_generated / invite_redeemed）：紫/橙
- 管理员操作（admin_grant）：红

每条事件 SHALL 展示：事件标签（中文）、时间戳（精确到秒）、detail 字段键值对。

#### Scenario: 有完整记录的用户
- **WHEN** 管理员访问有测评、支付、邀请记录的用户时间线
- **THEN** 所有事件 SHALL 按 timestamp 降序展示，不同类型事件颜色不同

#### Scenario: 无记录的 openId
- **WHEN** 管理员访问一个无行为记录的 openId 时间线
- **THEN** 页面 SHALL 显示"该用户暂无行为记录"提示，不报错

#### Scenario: 返回用户列表
- **WHEN** 管理员点击"返回用户列表"按钮
- **THEN** 页面 SHALL 跳转回 `/begreat/users`

### Requirement: BeGreat 导航分层结构
BeGreat 区域侧边导航 SHALL 采用分层结构，运营类功能收入"运营支持"折叠分组。

导航结构 SHALL 为：
1. 数据大盘（`/begreat/dashboard`，顶级）
2. 运营支持（折叠分组，包含：用户管理、测评记录、支付管理、掉单修复、邀请裂变）
3. 职业管理（`/begreat/occupations`，顶级）
4. 系统配置（`/begreat/config`，顶级）

#### Scenario: 访问运营子页面时父级自动展开
- **WHEN** 管理员导航到"运营支持"下的任意子页面（如 `/begreat/sessions`）
- **THEN** "运营支持"分组 SHALL 自动展开，对应子项被选中高亮

#### Scenario: 折叠侧边栏
- **WHEN** 管理员折叠侧边栏
- **THEN** 分组图标 SHALL 正常显示，hover 时展示子菜单浮层
