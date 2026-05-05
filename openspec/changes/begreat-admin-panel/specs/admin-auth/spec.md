## ADDED Requirements

### Requirement: 管理员账号初始化
系统 SHALL 提供一次性初始化接口，在 `admins` 集合为空时创建首个管理员账号（username + bcrypt 密码，cost factor 12）。接口在集合非空时 SHALL 返回 409，防止重复调用。

#### Scenario: 首次初始化成功
- **WHEN** `admins` 集合为空，调用 `POST /begreat-admin/auth/init-admin` 并提供合法 username 和 password
- **THEN** 系统创建管理员账号，返回 201 和 `{ success: true }`

#### Scenario: 重复初始化被拒绝
- **WHEN** `admins` 集合已有账号，调用 `POST /begreat-admin/auth/init-admin`
- **THEN** 系统返回 409 `{ success: false, message: 'Admin already initialized' }`

### Requirement: 管理员登录
系统 SHALL 提供 `POST /begreat-admin/auth/login`，接受 `{ username, password }`，验证通过后颁发独立 admin JWT（有效期 24h，secret 来自环境变量 `BEGREAT_ADMIN_JWT_SECRET`）。JWT payload 包含 `{ adminId, username, role: 'admin' }`。

#### Scenario: 合法凭证登录
- **WHEN** 提供正确的 username 和 password
- **THEN** 返回 200 和 `{ token: '<jwt>' }`

#### Scenario: 错误密码登录
- **WHEN** username 正确但 password 错误
- **THEN** 返回 401 `{ success: false, message: 'Invalid credentials' }`，不暴露账号是否存在

#### Scenario: 账号不存在
- **WHEN** 提供不存在的 username
- **THEN** 返回 401（与密码错误响应相同，防止账号枚举）

### Requirement: Admin JWT 鉴权中间件
系统 SHALL 提供 `adminJwtAuth` Express 中间件，从 `Authorization: Bearer <token>` 提取并验证 admin JWT。验证失败返回 401。所有 `/begreat-admin/`（除 login 和 init-admin）的接口 MUST 使用此中间件。

#### Scenario: 有效 token 放行
- **WHEN** 请求携带有效的 admin JWT
- **THEN** 中间件将解码的 payload 注入 `req.admin`，调用 `next()`

#### Scenario: 无效或过期 token
- **WHEN** 请求携带过期或签名错误的 JWT
- **THEN** 返回 401 `{ success: false, message: 'Unauthorized' }`

#### Scenario: 缺少 Authorization header
- **WHEN** 请求未携带 Authorization header
- **THEN** 返回 401 `{ success: false, message: 'Unauthorized' }`

### Requirement: 当前管理员信息查询
系统 SHALL 提供 `GET /begreat-admin/auth/me`，返回当前 admin 的 `{ adminId, username }`。前端用于 token 有效性校验和刷新页面时恢复登录态。

#### Scenario: 有效 token 查询
- **WHEN** 携带有效 admin JWT 调用 `GET /begreat-admin/auth/me`
- **THEN** 返回 200 和 `{ adminId, username }`
