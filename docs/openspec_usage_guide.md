# OpenSpec 使用指南

**项目**: BeGreat 职业推荐系统
**创建时间**: 2026-04-24

---

## 一、什么是 OpenSpec？

OpenSpec 是一个**规范驱动开发**框架，用于管理项目的架构规范和变更提案。它的核心理念是：

> **规范是真相，代码是实现**

通过 OpenSpec，你可以：
- ✅ 将系统设计文档化为可验证的规范
- ✅ 管理架构变更的提案、审批、实施全流程
- ✅ 确保代码与规范保持同步
- ✅ 追溯每个功能的设计决策和理由

---

## 二、OpenSpec 目录结构

```
openspec/
├── project.md              # 项目背景、技术栈、约定
├── AGENTS.md              # OpenSpec 使用说明（自动生成）
├── specs/                 # ✅ 当前真相 - 已实现的功能规范
│   ├── career-matching/
│   │   └── spec.md        # 职业匹配算法规范（9条需求）
│   ├── personality-assessment/
│   │   └── spec.md        # 性格测评规范（8条需求）
│   ├── norm-system/
│   │   └── spec.md        # 常模系统规范（9条需求）
│   └── messaging/
│       └── spec.md        # 消息队列规范（1条需求）
└── changes/               # ⏳ 变更提案 - 即将实现的功能
    ├── update-occupation-profiles/  # 示例：职业画像优化
    │   ├── proposal.md     # 为什么做、做什么、影响范围
    │   ├── design.md       # 技术决策、权衡、风险
    │   ├── tasks.md        # 实施清单（28/29完成）
    │   └── specs/          # 规范变更（ADDED/MODIFIED/REMOVED）
    │       └── career-matching/
    │           └── spec.md
    └── archive/            # 📦 已完成的变更（归档）
        └── 2026-01-12-add-bull-component/
```

---

## 三、核心概念

### 3.1 Spec（规范）

**定义**: 描述系统"应该如何工作"的文档，包含需求（Requirements）和场景（Scenarios）。

**示例** (`specs/career-matching/spec.md`):
```markdown
### Requirement: Directional Matching

The system SHALL use directional matching to reduce penalties when users exceed occupation requirements for positive traits.

#### Scenario: User exceeds openness requirement

- **WHEN** a user's openness score is higher than the occupation requirement
- **THEN** the system SHALL apply only 50% of the difference as penalty
- **BECAUSE** higher openness (creativity) is not a disadvantage
```

**特点**:
- 使用 SHALL/MUST 表示强制要求
- 每个需求至少有一个场景（Scenario）
- 场景采用 WHEN-THEN-BECAUSE 格式

### 3.2 Change（变更）

**定义**: 对规范的提案，包含"为什么改"、"改什么"、"怎么改"。

**生命周期**:
```
提案阶段 → 审批 → 实施阶段 → 验证 → 归档
 (Draft)   (Review)  (Implement)  (Test)  (Archive)
```

**文件结构**:
- `proposal.md`: 变更动机、影响分析
- `design.md`: 技术决策、权衡（可选，复杂变更需要）
- `tasks.md`: 实施清单（可跟踪进度）
- `specs/<capability>/spec.md`: 规范变更（Delta）

### 3.3 Delta（规范变更）

**定义**: 对现有规范的增量修改，使用操作标记。

**支持的操作**:
- `## ADDED Requirements`: 新增功能
- `## MODIFIED Requirements`: 修改现有功能
- `## REMOVED Requirements`: 删除功能
- `## RENAMED Requirements`: 重命名

**示例** (`changes/.../spec.md`):
```markdown
## MODIFIED Requirements

### Requirement: Occupation Trait Requirements

The system SHALL define occupation trait requirements that reflect realistic professional standards...

#### Scenario: Creative occupations (high openness)

- **WHEN** defining requirements for creative occupations
- **THEN** the openness requirement SHALL be in the range of 0.8-1.5
- **EXAMPLE** Art Director: O=1.2, Researcher: O=1.5

**CHANGES**:
- Expanded O range from [-0.1, 0.7] to [-0.1, 1.5]
```

---

## 四、常用命令

### 4.1 查看规范和变更

```bash
# 列出所有已实现的规范
openspec list --specs

# 列出所有活跃的变更提案
openspec list

# 查看某个规范的详情
openspec show career-matching --type spec

# 查看某个变更的详情
openspec show update-occupation-profiles
```

### 4.2 验证

```bash
# 验证所有规范
openspec validate --specs

# 验证所有变更
openspec validate --changes

# 验证特定变更（严格模式）
openspec validate update-occupation-profiles --strict
```

### 4.3 归档

```bash
# 归档已完成的变更
openspec archive update-occupation-profiles --yes

# 归档时跳过规范更新（仅工具类变更）
openspec archive <change-id> --skip-specs --yes
```

---

## 五、工作流程

### 5.1 创建新规范（初次文档化）

**场景**: 为现有功能创建规范文档

```bash
# 1. 创建规范目录
mkdir -p openspec/specs/new-capability

# 2. 编写规范文件
cat > openspec/specs/new-capability/spec.md << 'EOF'
# new-capability Specification

## Purpose
描述这个功能的用途...

## Requirements
### Requirement: 功能名称
系统应该...

#### Scenario: 成功场景
- **WHEN** 用户执行操作
- **THEN** 系统返回结果
EOF

# 3. 验证规范
openspec validate --specs
```

**示例**: 本次创建的 `career-matching`, `personality-assessment`, `norm-system` 规范。

---

### 5.2 创建变更提案（修改功能）

**场景**: 需要优化现有功能或添加新功能

**步骤**:

#### 1) 创建提案目录

```bash
CHANGE_ID=update-occupation-profiles  # 使用 verb-noun 格式
mkdir -p openspec/changes/$CHANGE_ID/specs/career-matching
```

#### 2) 编写 proposal.md

```markdown
# Change: 职业画像参数优化

## Why
当前职业要求范围过窄（0-0.7），导致高分用户被惩罚...

## What Changes
- 扩大评分范围至 0.8-1.5
- 启用外向性和宜人性维度
- 增加硬性门槛

## Impact
- Affected specs: career-matching
- Affected code: tpl/seed_occupation.json
```

#### 3) 编写 tasks.md

```markdown
## 1. 数据准备
- [ ] 1.1 分析现有数据
- [ ] 1.2 确定优化范围

## 2. 实施
- [ ] 2.1 扩大评分范围
- [ ] 2.2 增加硬性门槛
...
```

#### 4) 编写 design.md（可选）

仅在以下情况需要：
- 跨系统变更
- 引入新依赖
- 安全/性能/迁移复杂度高
- 需要权衡多个方案

```markdown
## Context
背景、约束...

## Decisions
- Decision 1: 扩大评分范围的策略
  - 选择: 分级扩大
  - 理由: ...
  - Alternatives considered: ...
```

#### 5) 编写规范变更 (spec delta)

```markdown
## MODIFIED Requirements

### Requirement: Big Five Based Matching

...（完整的修改后需求）

**CHANGES**:
- Expanded extraversion usage from 7 to 22 occupations
```

#### 6) 验证提案

```bash
openspec validate $CHANGE_ID --strict
```

---

### 5.3 实施变更

**步骤**:

#### 1) 阅读提案

```bash
openspec show update-occupation-profiles
```

#### 2) 按 tasks.md 逐步实施

- 编写代码
- 运行测试
- 更新 tasks.md 状态（标记 `[x]`）

#### 3) 验证实施结果

```bash
# 运行测试
npx tsx test/check_occupation_dimensions.ts

# 再次验证提案
openspec validate update-occupation-profiles --strict
```

---

### 5.4 归档变更

**场景**: 变更已实施、测试通过、部署完成

```bash
# 归档变更（会自动更新 specs/）
openspec archive update-occupation-profiles --yes

# 查看归档后的结果
openspec list --specs
ls openspec/changes/archive/
```

**归档后的目录结构**:
```
openspec/changes/archive/
└── 2026-04-24-update-occupation-profiles/
    ├── proposal.md
    ├── design.md
    ├── tasks.md
    └── specs/...
```

---

## 六、最佳实践

### 6.1 规范编写

✅ **好的做法**:
```markdown
### Requirement: Directional Matching

The system SHALL reduce penalties for positive trait exceedance.

#### Scenario: High openness user
- **WHEN** user O=1.8 > job O=0.6
- **THEN** penalty = (1.8-0.6) × 0.5
- **BECAUSE** higher creativity is advantageous
```

❌ **不好的做法**:
```markdown
### Requirement: Matching

The system should match users to jobs.

- Scenario: Matching works correctly  ❌ 太模糊
```

**原则**:
- 使用 SHALL/MUST（强制）而非 should/may
- 每个需求至少一个具体场景
- 场景使用 WHEN-THEN-BECAUSE 格式
- 包含示例数据

### 6.2 变更管理

✅ **需要创建提案的情况**:
- 添加新功能
- 修改 API 或数据结构
- 架构调整
- 性能优化（改变行为）

❌ **不需要提案的情况**:
- Bug 修复（恢复预期行为）
- 拼写、格式、注释
- 依赖更新（非破坏性）
- 配置调整

### 6.3 文件命名

**Change ID 命名规则**:
- 使用 kebab-case
- 动词前缀: `add-`, `update-`, `remove-`, `refactor-`
- 简短描述性: `update-occupation-profiles`

**示例**:
```
✅ add-two-factor-auth
✅ update-matching-algorithm
✅ remove-legacy-api
✅ refactor-database-schema

❌ changes-to-occupation  （缺少动词）
❌ UpdateOccupationProfiles  （应用 kebab-case）
❌ fix  （太简短，不描述性）
```

---

## 七、本项目的规范清单

### 已实现的规范（4个）

| 规范 | 需求数 | 说明 |
|------|--------|------|
| **career-matching** | 9 | 职业匹配算法（方向性匹配、动态权重、年龄调整、硬性门槛） |
| **personality-assessment** | 8 | Big Five 性格测评（BFI-2 60题、常模标准化、结果解读） |
| **norm-system** | 9 | 常模数据管理（人口统计分层、z分数转换、数据质量） |
| **messaging** | 1 | 消息队列（Bull.js 组件） |

### 活跃的变更（1个）

| 变更 | 任务进度 | 说明 |
|------|---------|------|
| **update-occupation-profiles** | 28/29 | 职业画像参数优化（已完成实施，待归档） |

---

## 八、常见问题

### Q1: 何时使用 ADDED vs MODIFIED？

**ADDED**: 新增完全独立的需求
```markdown
## ADDED Requirements
### Requirement: Occupation Data Quality Standards  ← 全新需求
...
```

**MODIFIED**: 修改现有需求的行为
```markdown
## MODIFIED Requirements
### Requirement: Big Five Based Matching  ← 已存在的需求
...（粘贴完整的修改后内容）

**CHANGES**:  ← 说明改了什么
- Expanded extraversion usage from 7 to 22 occupations
```

**注意**: MODIFIED 需要粘贴**完整**的需求内容（包括所有场景），因为归档时会整体替换。

---

### Q2: 规范太长怎么办？

**答**: 拆分为多个 capability（能力）

```
✅ 好的拆分:
specs/
├── user-auth/          # 用户认证
├── session-management/ # 会话管理
└── password-reset/     # 密码重置

❌ 不好的拆分:
specs/
└── user-system/        # 包含认证+会话+密码+权限...
```

**原则**: 每个 capability 应该是"10分钟可理解的单一职责"。

---

### Q3: 如何处理规范与代码不一致？

**两种情况**:

1. **代码实现了规范未定义的功能**
   - 补充规范（创建变更提案，使用 ADDED）

2. **代码未遵循规范**
   - 修复代码（Bug fix，不需要提案）
   - 或更新规范（创建变更提案，使用 MODIFIED）

**原则**: 规范是真相，代码应该跟随规范。

---

### Q4: 如何回滚已归档的变更？

```bash
# 1. 从 archive/ 恢复变更
cp -r openspec/changes/archive/2026-04-24-update-occupation-profiles \
      openspec/changes/revert-occupation-profiles

# 2. 修改提案（说明回滚理由）
vim openspec/changes/revert-occupation-profiles/proposal.md

# 3. 编写 REMOVED/MODIFIED delta（逆操作）
vim openspec/changes/revert-occupation-profiles/specs/.../spec.md

# 4. 实施代码回滚
git revert <commit-hash>

# 5. 归档回滚变更
openspec archive revert-occupation-profiles --yes
```

---

## 九、快速参考

### 命令速查

```bash
# 查看
openspec list                    # 列出活跃变更
openspec list --specs            # 列出已实现规范
openspec show <item>             # 查看详情

# 验证
openspec validate --specs        # 验证所有规范
openspec validate <change> --strict  # 验证变更（严格模式）

# 归档
openspec archive <change> --yes  # 归档变更
```

### 文件模板

**提案** (`proposal.md`):
```markdown
# Change: [简短描述]

## Why
[问题或机会]

## What Changes
- [变更列表]
- [标记破坏性变更为 **BREAKING**]

## Impact
- Affected specs: [能力列表]
- Affected code: [关键文件]
```

**任务** (`tasks.md`):
```markdown
## 1. 准备
- [ ] 1.1 任务描述
- [ ] 1.2 任务描述

## 2. 实施
- [ ] 2.1 任务描述
...
```

**规范变更** (`specs/.../spec.md`):
```markdown
## ADDED Requirements
### Requirement: [需求名]
[完整需求描述]

#### Scenario: [场景名]
- **WHEN** [条件]
- **THEN** [结果]
- **BECAUSE** [理由]（可选）
```

---

## 十、学习资源

### 内部文档

- `openspec/AGENTS.md`: OpenSpec 完整使用说明
- `openspec/project.md`: 项目背景和约定
- `docs/occupation_dimension_analysis.md`: 职业数据分析示例
- `docs/occupation_profile_update_report.md`: 变更实施报告示例

### 示例变更

- `changes/update-occupation-profiles/`: 完整的变更提案示例（已完成）
- `changes/archive/2026-01-12-add-bull-component/`: 归档后的变更示例

---

**文档版本**: v1.0
**最后更新**: 2026-04-24
**维护者**: BeGreat 技术团队
