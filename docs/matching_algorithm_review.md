# 职业推荐算法评估报告

## 一、算法概述

### 核心公式
```
distance = sqrt(
  oDiff² × (1.2 + salaryIndex × 0.8) +  // 高薪职业更看重开放性
  cDiff² × 1.05 +                        // 尽责性权重固定
  nDiff² × 0.95                          // 情绪稳定性权重最低
)
score = 100 / (1 + exp(1.2 × (distance - 1.35))) × ageMultiplier
```

### 使用维度
- ✅ 开放性 (O) - 权重 1.2~2.0（随薪资增加）
- ✅ 尽责性 (C) - 权重 1.05
- ✅ 情绪稳定性 (-N) - 权重 0.95
- ❌ 外向性 (E) - 未使用
- ❌ 宜人性 (A) - 未使用

---

## 二、模拟测试结果

### 测试用户画像

| 用户 | O | C | 稳定性 | 年龄 | Top 1 推荐 | 分数 | 评价 |
|------|---|---|--------|------|-----------|------|------|
| 张三 创意型 | 0.6 | -0.2 | 0.1 | 24 | 内容创作者 | 76.9 | ✅ 合理 |
| 李四 执行型 | -0.3 | 0.7 | 0.2 | 28 | 机械工程师 | 83.0 | ✅ 优秀 |
| 王五 平衡型 | 0.2 | 0.3 | 0.0 | 32 | 软件工程师 | 96.0 | ✅ 完美 |
| 赵六 敏感型 | 0.5 | 0.1 | -0.6 | 26 | AI 工程师 | 88.3 | ⚠️ 存疑 |
| 孙七 管理型 | 0.1 | 0.5 | 0.3 | 42 | 临床医生 | 100.0 | ✅ 优秀 |

### 典型案例分析

#### ✅ 成功案例：孙七 → 临床医生 (100分)
```
用户特质:     O=0.1,  C=0.5,  稳定=0.3
职业要求:     O=0.2,  C=0.6,  稳定=0.4
年龄加成:     42岁处于医生职业黄金期 (1.25x)
推荐合理性:   高尽责+高稳定+丰富经验 = 完美匹配
```

#### ⚠️ 争议案例：赵六 → AI 工程师 (88.3分)
```
用户特质:     O=0.5,  C=0.1,  稳定=-0.6 (情绪敏感)
职业要求:     O=0.5,  C=0.3,  稳定=0.0
问题诊断:     开放性完美匹配，但情绪稳定性差距0.6
算法行为:     高薪职业(0.95)的O权重达2.0，掩盖了稳定性问题
现实考量:     AI工程师高压环境，情绪敏感者可能难以胜任
```

---

## 三、算法优点

### 1. 特质区分能力强
- 创意型(高O低C) → 内容创作、视觉设计
- 执行型(低O高C) → 工程、财务、运营
- 平衡型(中O中C) → 软件、产品、咨询

### 2. 年龄调整机制合理
```
24岁: 内容创作 (1.0x) > 产品经理 (0.85x)
32岁: 软件工程师 (1.15x) > 艺术总监 (0.85x)
42岁: 临床医生 (1.25x) > UX设计师 (1.0x)
```

### 3. 高薪职业看重创新能力
- AI工程师(0.95): O权重 = 1.2 + 0.95×0.8 = 1.96
- 财务会计(0.5): O权重 = 1.2 + 0.5×0.8 = 1.6
- 符合现实：高薪岗位需要更强的创新思维

### 4. 非线性映射拉开差距
- 逻辑函数使高匹配(80+)和低匹配(60-)区分明显
- 避免所有职业都在70-80分的平庸分布

---

## 四、潜在问题与改进建议

### 问题1：情绪稳定性权重过低 (0.95)

**现象：** 情绪敏感者(稳定性-0.6)仍被推荐高压职业

**影响职业：**
- 临床医生 (要求 0.4)
- 投资分析师 (要求 0.4)
- 管理咨询顾问 (要求 0.3)
- 电气工程师 (要求 0.3)

**建议改进：**
```typescript
// 根据职业压力等级动态调整权重
const stressLevel = job.requiredBig5.emotionalStability;
const stabilityWeight = stressLevel > 0.3 ? 1.3 : 0.95;

const weightedSquares =
  oDiff * oDiff * (1.2 + job.salaryIndex * 0.8) +
  cDiff * cDiff * 1.05 +
  nDiff * nDiff * stabilityWeight;  // ← 动态调整
```

### 问题2：未使用外向性(E)和宜人性(A)

**受影响职业：**
| 职业 | 应看重的维度 | 当前状态 |
|------|------------|---------|
| 市场营销经理 | E (外向性) | ❌ 未使用 |
| 保险规划顾问 | E (外向性) | ❌ 未使用 |
| 学科教师 | A (宜人性) | ❌ 未使用 |
| 心理咨询师 | A (宜人性) | ❌ 未使用 |
| 社会工作者 | A (宜人性) | ❌ 未使用 |

**建议改进：**
```typescript
interface IOccupationNorm {
  requiredBig5: {
    openness: number;
    conscientiousness: number;
    emotionalStability: number;
    extraversion?: number;      // ← 新增可选维度
    agreeableness?: number;     // ← 新增可选维度
  };
}

// 计算时动态判断
const eDiff = job.requiredBig5.extraversion !== undefined
  ? input.big5Norm.E - job.requiredBig5.extraversion
  : 0;
const aDiff = job.requiredBig5.agreeableness !== undefined
  ? input.big5Norm.A - job.requiredBig5.agreeableness
  : 0;

const weightedSquares =
  oDiff * oDiff * (1.2 + job.salaryIndex * 0.8) +
  cDiff * cDiff * 1.05 +
  nDiff * nDiff * stabilityWeight +
  eDiff * eDiff * 1.0 +         // ← 外向性权重
  aDiff * aDiff * 1.0;          // ← 宜人性权重
```

### 问题3：年龄惩罚过轻

**现象：** 不在年龄段时统一 0.85 倍

**案例：**
- 24岁推荐临床医生(要求25岁起)，只减15%
- 60岁推荐AI工程师(要求22-45岁)，只减15%

**建议改进：**
```typescript
function ageMultiplierForJob(age: number, job: IOccupationNorm): number {
  if (age >= job.ageRange.min && age <= job.ageRange.max) {
    const ageGroup = getAgeGroup(age);
    return job.ageBonusMultiplier[ageGroup];
  }

  // 计算偏离度
  const deviation = age < job.ageRange.min
    ? job.ageRange.min - age
    : age - job.ageRange.max;

  // 偏离越远，惩罚越重
  if (deviation <= 2) return 0.95;   // 轻微偏离
  if (deviation <= 5) return 0.85;   // 中等偏离
  if (deviation <= 10) return 0.70;  // 严重偏离
  return 0.50;                       // 极度偏离
}
```

### 问题4：缺少硬性筛选条件

**现象：** 所有职业都会被推荐，只是分数不同

**建议：** 添加最低阈值筛选
```typescript
// 某些职业设置硬性门槛
interface IOccupationNorm {
  minimumRequirements?: {
    emotionalStability?: number;  // 如：临床医生要求 ≥ 0
    conscientiousness?: number;   // 如：财务会计要求 ≥ 0.2
  };
}

// 在匹配前过滤
const results = occupations
  .filter(job => job.isActive)
  .filter(job => {
    if (!job.minimumRequirements) return true;
    const { emotionalStability, conscientiousness } = job.minimumRequirements;
    if (emotionalStability && -input.big5Norm.N < emotionalStability) return false;
    if (conscientiousness && input.big5Norm.C < conscientiousness) return false;
    return true;
  })
  .map(job => scoreCareer(input, job))
  // ...
```

---

## 五、优化优先级建议

### 🔴 高优先级（强烈建议实施）

1. **为高压职业提高情绪稳定性权重**
   - 影响：避免推荐情绪敏感者从事医生/投资等高压工作
   - 工作量：小 (修改权重计算逻辑)
   - 风险：低

2. **添加职业硬性门槛**
   - 影响：某些职业不适合推荐给明显不匹配的人
   - 工作量：中 (需要标注每个职业的门槛)
   - 风险：中 (可能过度限制)

### 🟡 中优先级（建议考虑）

3. **为特定职业启用E和A维度**
   - 影响：销售/教育/咨询类职业推荐更精准
   - 工作量：大 (需要标注+算法改造)
   - 风险：中 (增加复杂度)

4. **优化年龄惩罚机制**
   - 影响：避免推荐年龄严重不符的职业
   - 工作量：小 (修改年龄系数计算)
   - 风险：低

### 🟢 低优先级（可选优化）

5. **引入行业趋势系数**
   - 影响：热门行业(AI/新能源)适当加分
   - 工作量：中
   - 风险：高 (需要持续维护)

6. **个性化权重学习**
   - 影响：根据用户反馈动态调整权重
   - 工作量：大 (需要ML基础设施)
   - 风险：高

---

## 六、总体评价

### 算法成熟度：⭐⭐⭐⭐ (4/5)

**优点：**
- ✅ 数学模型合理，使用欧式距离+逻辑映射
- ✅ 年龄调整机制符合职业发展规律
- ✅ 高薪职业看重创新能力，符合现实
- ✅ 大部分推荐结果合理且可解释

**缺点：**
- ❌ 情绪稳定性权重偏低，高压职业存在误推风险
- ❌ 只用3个维度，销售/教育类职业推荐不够精准
- ⚠️ 年龄惩罚较轻，极端年龄案例处理不够严格
- ⚠️ 缺少硬性筛选，所有职业都会被推荐

### 建议实施路径

**Phase 1 (快速优化 - 1周):**
1. 为高压职业(临床医生/投资分析师等)提高情绪稳定性权重
2. 优化年龄惩罚机制，对严重偏离者加大惩罚

**Phase 2 (深度优化 - 1个月):**
3. 为25个职业标注E/A要求，启用5维度匹配
4. 添加10-15个高风险职业的硬性门槛

**Phase 3 (长期迭代):**
5. 收集用户反馈，建立推荐效果评估体系
6. 探索个性化权重学习的可行性

---

## 附录：测试数据详情

### 测试用户完整特质

```json
[
  {
    "name": "张三 - 高开放性创意型",
    "big5": { "O": 0.6, "C": -0.2, "E": 0.3, "A": 0.1, "N": -0.1 },
    "age": 24,
    "top3": ["内容创作者", "品牌视觉设计师", "UX设计师"],
    "scores": [76.9, 71.1, 70.2]
  },
  {
    "name": "李四 - 高尽责性执行型",
    "big5": { "O": -0.3, "C": 0.7, "E": -0.1, "A": 0.4, "N": -0.2 },
    "age": 28,
    "top3": ["机械工程师", "电气工程师", "技术运营"],
    "scores": [83.0, 82.6, 81.8]
  },
  {
    "name": "王五 - 平衡型技术人",
    "big5": { "O": 0.2, "C": 0.3, "E": 0.0, "A": 0.0, "N": 0.0 },
    "age": 32,
    "top3": ["软件工程师", "产品经理", "AI工程师"],
    "scores": [96.0, 96.0, 94.2]
  },
  {
    "name": "赵六 - 高压力敏感型",
    "big5": { "O": 0.5, "C": 0.1, "E": -0.2, "A": 0.3, "N": 0.6 },
    "age": 26,
    "top3": ["AI工程师", "产品经理", "数据科学家"],
    "scores": [88.3, 81.0, 79.6],
    "warning": "⚠️ 情绪稳定性-0.6，不适合高压职业"
  },
  {
    "name": "孙七 - 资深管理型",
    "big5": { "O": 0.1, "C": 0.5, "E": 0.4, "A": 0.2, "N": -0.3 },
    "age": 42,
    "top3": ["临床医生", "投资分析师", "电气工程师"],
    "scores": [100.0, 97.5, 96.0]
  }
]
```

---

**生成时间:** 2026-04-24
**测试版本:** MatchingService v2026_single_formula_v1
**评估人:** Claude Sonnet 4.5
