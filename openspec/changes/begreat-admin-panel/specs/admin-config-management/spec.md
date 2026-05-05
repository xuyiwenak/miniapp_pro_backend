## ADDED Requirements

### Requirement: 查看当前运行时配置
系统 SHALL 提供 `GET /begreat-admin/config`，返回当前 runtime_config.json 的完整内容。

返回字段（至少包含）：`price_fen`、`payment_enabled`、`dev_openids`。

#### Scenario: 正常查看配置
- **WHEN** 调用 `GET /begreat-admin/config`
- **THEN** 返回 200 和当前配置对象，price_fen 为整数（分），payment_enabled 为布尔值，dev_openids 为字符串数组

### Requirement: 修改运行时配置
系统 SHALL 提供 `POST /begreat-admin/config`，接受 partial update，支持以下字段：
- `price_fen`（正整数，单位分，范围 100–99900）
- `payment_enabled`（布尔值）
- `dev_openids`（字符串数组，全量替换）

系统 SHALL 在写入文件后自动调用 `reloadRuntimeConfig()` 热加载，使配置立即生效，无需重启容器。

#### Scenario: 修改价格
- **WHEN** 调用 `POST /begreat-admin/config` body 为 `{ price_fen: 1900 }`
- **THEN** runtime_config.json 中 price_fen 更新为 1900，热加载生效，返回 200 和新配置

#### Scenario: 关闭支付开关（审核模式）
- **WHEN** 调用 `POST /begreat-admin/config` body 为 `{ payment_enabled: false }`
- **THEN** payment_enabled 更新，立即生效，用户访问报告无需付费

#### Scenario: 更新测试白名单
- **WHEN** 调用 `POST /begreat-admin/config` body 为 `{ dev_openids: ['oXxx', 'oYyy'] }`
- **THEN** dev_openids 全量替换为新数组，热加载生效

#### Scenario: price_fen 超出范围
- **WHEN** price_fen 传入 0 或负数
- **THEN** 返回 400 `{ success: false, message: 'price_fen must be between 100 and 99900' }`

### Requirement: 热加载配置
系统 SHALL 提供 `POST /begreat-admin/config/reload`，触发 `reloadRuntimeConfig()` 重新读取文件。文件在服务器手动修改时可用此接口触发生效。

#### Scenario: 热加载成功
- **WHEN** 调用 `POST /begreat-admin/config/reload`
- **THEN** 返回 200 和当前生效的配置对象
