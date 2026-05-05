## ADDED Requirements

### Requirement: 职业列表实时查询
系统 SHALL 提供 `GET /begreat-admin/occupations`，从 `occupationnorms` 集合实时查询职业数据（非 seed 文件），返回所有职业。支持：
- `isActive`：布尔值筛选（默认返回全部）
- `page`（默认 1）、`pageSize`（默认 50，最大 100）

每条记录 SHALL 包含：`code`、`title`、`isActive`、`requiredBig5`（五维要求值）、`industry`（行业分类）。

#### Scenario: 查询所有职业
- **WHEN** 调用 `GET /begreat-admin/occupations`
- **THEN** 返回数据库中所有职业记录，含 total 字段

#### Scenario: 只查询激活职业
- **WHEN** 调用 `GET /begreat-admin/occupations?isActive=true`
- **THEN** 只返回 isActive=true 的职业记录

### Requirement: 职业 Seed 数据导入
系统 SHALL 提供 `POST /begreat-admin/occupations/seed`，读取服务器上 `tpl/seed_occupation.json`，按 `code` 字段做 upsert（存在则更新，不存在则新增）。支持 `?reset=true` 先清空再写入。

#### Scenario: 正常导入 seed 数据
- **WHEN** 调用 `POST /begreat-admin/occupations/seed`，seed 文件存在且格式正确
- **THEN** 返回 200 `{ success: true, upserted: N, errors: [] }`

#### Scenario: reset=true 先清空再导入
- **WHEN** 调用 `POST /begreat-admin/occupations/seed?reset=true`
- **THEN** 先清空 occupationnorms 集合，再写入 seed 数据

#### Scenario: seed 文件不存在
- **WHEN** 服务器上 tpl/seed_occupation.json 不存在
- **THEN** 返回 404 `{ success: false, message: 'seed_occupation.json 不存在' }`

### Requirement: Seed 数据预览
系统 SHALL 提供 `GET /begreat-admin/occupations/seed`，读取 seed 文件并返回记录数和内容，不写入数据库。供导入前校验使用。

#### Scenario: 预览 seed 文件内容
- **WHEN** 调用 `GET /begreat-admin/occupations/seed`
- **THEN** 返回 200 `{ count: N, records: [...] }`，数据不写库
