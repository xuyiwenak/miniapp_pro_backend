# 职业数据更新指南

**版本:** v2026_optimized
**更新时间:** 2026-04-24

---

## 一、更新说明

为配合优化后的匹配算法，需要对部分职业数据添加以下字段：

1. **外向性要求** (`requiredBig5.extraversion`) - 人际互动频繁的职业
2. **宜人性要求** (`requiredBig5.agreeableness`) - 服务/教育类职业
3. **硬性门槛** (`minimumRequirements`) - 高风险职业

---

## 二、需要添加外向性(E)的职业

### 2.1 标准范围

| 分数 | 含义 | 适用职业 |
|------|------|---------|
| 0.4+ | 高外向性 | 销售总监、演讲家 |
| 0.2-0.4 | 中等外向性 | 市场营销、HR、培训师 |
| 0.0-0.2 | 略偏外向 | 产品经理、咨询顾问 |
| < 0.0 | 可接受内向 | 技术/研发岗位 |

### 2.2 推荐更新列表

```json
// 市场营销经理
{
  "code": "BIZ_MKT",
  "requiredBig5": {
    "openness": 0.3,
    "conscientiousness": 0.2,
    "emotionalStability": 0.1,
    "extraversion": 0.3  // 新增
  },
  "minimumRequirements": {
    "extraversion": -0.1  // 极度内向者不适合
  }
}

// 保险规划顾问
{
  "code": "FIN_INS",
  "requiredBig5": {
    "openness": 0.1,
    "conscientiousness": 0.3,
    "emotionalStability": 0.3,
    "extraversion": 0.4  // 新增 - 销售属性强
  },
  "minimumRequirements": {
    "extraversion": 0.0  // 内向者难以展业
  }
}

// 企业培训师
{
  "code": "EDU_TRAINER",
  "requiredBig5": {
    "openness": 0.3,
    "conscientiousness": 0.3,
    "emotionalStability": 0.2,
    "extraversion": 0.3  // 新增 - 演讲和互动
  }
}

// 人力资源经理
{
  "code": "BIZ_HR",
  "requiredBig5": {
    "openness": 0.2,
    "conscientiousness": 0.3,
    "emotionalStability": 0.2,
    "extraversion": 0.2  // 新增 - 招聘和沟通
  }
}

// 产品经理（轻度）
{
  "code": "TECH_PM",
  "requiredBig5": {
    "openness": 0.3,
    "conscientiousness": 0.2,
    "emotionalStability": 0.1,
    "extraversion": 0.1  // 新增 - 跨部门协作
  }
}

// 管理咨询顾问
{
  "code": "BIZ_CONSULT",
  "requiredBig5": {
    "openness": 0.4,
    "conscientiousness": 0.5,
    "emotionalStability": 0.3,
    "extraversion": 0.2  // 新增 - 客户沟通
  }
}
```

---

## 三、需要添加宜人性(A)的职业

### 3.1 标准范围

| 分数 | 含义 | 适用职业 |
|------|------|---------|
| 0.4+ | 高共情 | 心理咨询、社工 |
| 0.2-0.4 | 较高共情 | 教师、医生、护士 |
| 0.0-0.2 | 中等 | 健康管理师 |
| < 0.0 | 低宜人性 | 不适合服务/教育 |

### 3.2 推荐更新列表

```json
// 心理咨询师 ⭐ 最高要求
{
  "code": "MED_PSY",
  "requiredBig5": {
    "openness": 0.3,
    "conscientiousness": 0.3,
    "emotionalStability": 0.5,
    "agreeableness": 0.5  // 新增 - 核心能力
  },
  "minimumRequirements": {
    "emotionalStability": 0.0,
    "agreeableness": 0.2  // 硬性要求共情能力
  }
}

// 社会工作者
{
  "code": "SOC_SW",
  "requiredBig5": {
    "openness": 0.2,
    "conscientiousness": 0.3,
    "emotionalStability": 0.4,
    "agreeableness": 0.5  // 新增 - 服务弱势群体
  },
  "minimumRequirements": {
    "agreeableness": 0.2
  }
}

// 学科教师
{
  "code": "EDU_TEACHER",
  "requiredBig5": {
    "openness": 0.2,
    "conscientiousness": 0.4,
    "emotionalStability": 0.3,
    "agreeableness": 0.4  // 新增 - 教书育人
  },
  "minimumRequirements": {
    "agreeableness": 0.0  // 负值者缺乏耐心
  }
}

// 临床医生
{
  "code": "MED_DOC",
  "requiredBig5": {
    "openness": 0.2,
    "conscientiousness": 0.6,
    "emotionalStability": 0.4,
    "agreeableness": 0.3  // 新增 - 医患沟通
  }
}

// 健康管理师
{
  "code": "MED_HEALTH",
  "requiredBig5": {
    "openness": 0.2,
    "conscientiousness": 0.4,
    "emotionalStability": 0.2,
    "agreeableness": 0.3  // 新增 - 客户服务
  }
}

// 公益项目经理
{
  "code": "SOC_NPO",
  "requiredBig5": {
    "openness": 0.3,
    "conscientiousness": 0.4,
    "emotionalStability": 0.2,
    "agreeableness": 0.4  // 新增 - 社会服务
  }
}
```

---

## 四、需要添加硬性门槛的职业

### 4.1 高压职业（情绪稳定性门槛）

```json
// 临床医生 ⭐ 最严格
{
  "code": "MED_DOC",
  "minimumRequirements": {
    "emotionalStability": 0.0,      // 负值者易焦虑
    "conscientiousness": 0.3,       // 粗心会致命
    "agreeableness": 0.0
  }
}

// 投资分析师
{
  "code": "FIN_IA",
  "minimumRequirements": {
    "emotionalStability": -0.1,     // 市场波动压力大
    "conscientiousness": 0.2
  }
}

// 管理咨询顾问
{
  "code": "BIZ_CONSULT",
  "minimumRequirements": {
    "emotionalStability": 0.0,      // 客户压力大
    "conscientiousness": 0.3        // 严谨性要求高
  }
}

// AI工程师
{
  "code": "TECH_AI",
  "minimumRequirements": {
    "emotionalStability": -0.3,     // 技术迭代压力
    "conscientiousness": 0.1
  }
}

// 电气工程师
{
  "code": "ENG_ELE",
  "minimumRequirements": {
    "emotionalStability": 0.0,      // 安全责任重大
    "conscientiousness": 0.3
  }
}
```

### 4.2 高精度职业（尽责性门槛）

```json
// 财务会计 ⭐ 最严格
{
  "code": "FIN_ACC",
  "minimumRequirements": {
    "conscientiousness": 0.3,       // 粗心易出错
    "emotionalStability": -0.2      // 适度即可
  }
}

// 数据科学家
{
  "code": "TECH_DS",
  "minimumRequirements": {
    "conscientiousness": 0.2        // 数据清洗需耐心
  }
}

// 机械工程师
{
  "code": "ENG_MECH",
  "minimumRequirements": {
    "conscientiousness": 0.2        // 设计需严谨
  }
}
```

---

## 五、完整更新脚本

### 5.1 使用 MongoDB 更新

```typescript
// 更新单个职业
db.occupations.updateOne(
  { code: "MED_PSY" },
  {
    $set: {
      "requiredBig5.agreeableness": 0.5,
      "minimumRequirements": {
        emotionalStability: 0.0,
        agreeableness: 0.2
      }
    }
  }
);

// 批量更新外向性维度
const extraversionJobs = [
  { code: "BIZ_MKT", value: 0.3, min: -0.1 },
  { code: "FIN_INS", value: 0.4, min: 0.0 },
  { code: "EDU_TRAINER", value: 0.3 },
  { code: "BIZ_HR", value: 0.2 },
  { code: "TECH_PM", value: 0.1 },
  { code: "BIZ_CONSULT", value: 0.2 }
];

extraversionJobs.forEach(job => {
  db.occupations.updateOne(
    { code: job.code },
    {
      $set: {
        "requiredBig5.extraversion": job.value,
        ...(job.min && {
          "minimumRequirements.extraversion": job.min
        })
      }
    }
  );
});

// 批量更新宜人性维度
const agreeablenessJobs = [
  { code: "MED_PSY", value: 0.5, min: 0.2 },
  { code: "SOC_SW", value: 0.5, min: 0.2 },
  { code: "EDU_TEACHER", value: 0.4, min: 0.0 },
  { code: "MED_DOC", value: 0.3 },
  { code: "MED_HEALTH", value: 0.3 },
  { code: "SOC_NPO", value: 0.4 }
];

agreeablenessJobs.forEach(job => {
  db.occupations.updateOne(
    { code: job.code },
    {
      $set: {
        "requiredBig5.agreeableness": job.value,
        ...(job.min && {
          "minimumRequirements.agreeableness": job.min
        })
      }
    }
  );
});
```

### 5.2 使用 JSON 补丁

将以下JSON合并到 `seed_occupation.json`:

```json
[
  {
    "code": "MED_PSY",
    "requiredBig5": {
      "openness": 0.3,
      "conscientiousness": 0.3,
      "emotionalStability": 0.5,
      "agreeableness": 0.5
    },
    "minimumRequirements": {
      "emotionalStability": 0.0,
      "agreeableness": 0.2
    }
  },
  {
    "code": "MED_DOC",
    "requiredBig5": {
      "openness": 0.2,
      "conscientiousness": 0.6,
      "emotionalStability": 0.4,
      "agreeableness": 0.3
    },
    "minimumRequirements": {
      "emotionalStability": 0.0,
      "conscientiousness": 0.3,
      "agreeableness": 0.0
    }
  },
  {
    "code": "BIZ_MKT",
    "requiredBig5": {
      "openness": 0.3,
      "conscientiousness": 0.2,
      "emotionalStability": 0.1,
      "extraversion": 0.3
    },
    "minimumRequirements": {
      "extraversion": -0.1
    }
  },
  {
    "code": "FIN_INS",
    "requiredBig5": {
      "openness": 0.1,
      "conscientiousness": 0.3,
      "emotionalStability": 0.3,
      "extraversion": 0.4
    },
    "minimumRequirements": {
      "extraversion": 0.0
    }
  }
]
```

---

## 六、更新验证

### 6.1 数据一致性检查

```typescript
// 检查所有职业的数据完整性
const occupations = await Occupation.find({});

occupations.forEach(occ => {
  // 检查1: 如果有minimumRequirements，requiredBig5必须有对应维度
  if (occ.minimumRequirements) {
    Object.keys(occ.minimumRequirements).forEach(key => {
      if (occ.requiredBig5[key] === undefined) {
        console.warn(`${occ.code}: minimumRequirements.${key} 存在，但 requiredBig5.${key} 缺失`);
      }
    });
  }

  // 检查2: 外向性/宜人性的合理性
  if (occ.requiredBig5.extraversion !== undefined) {
    if (occ.requiredBig5.extraversion < -0.5 || occ.requiredBig5.extraversion > 0.7) {
      console.warn(`${occ.code}: extraversion 值异常 (${occ.requiredBig5.extraversion})`);
    }
  }

  // 检查3: 门槛不能高于要求
  if (occ.minimumRequirements?.emotionalStability !== undefined) {
    if (occ.minimumRequirements.emotionalStability > occ.requiredBig5.emotionalStability) {
      console.warn(`${occ.code}: 门槛高于要求值`);
    }
  }
});
```

### 6.2 算法测试

```typescript
// 测试案例: 确保优化生效
const testUser = {
  big5Norm: { O: 0.5, C: 0.1, E: -0.2, A: 0.3, N: 0.6 },
  age: 26
};

const results = matchCareers(testUser, occupations, 10);

// 验证1: 临床医生应被过滤
const hasMedDoc = results.some(r => r.code === "MED_DOC");
if (hasMedDoc) {
  console.error("❌ 临床医生未被正确过滤（情绪稳定性不足）");
} else {
  console.log("✅ 临床医生正确过滤");
}

// 验证2: 心理咨询师应被过滤
const hasPsy = results.some(r => r.code === "MED_PSY");
if (hasPsy) {
  console.error("❌ 心理咨询师未被正确过滤");
} else {
  console.log("✅ 心理咨询师正确过滤");
}

// 验证3: 内容创作者应保留（低压职业）
const hasContent = results.some(r => r.code === "CREATIVE_CONTENT");
if (hasContent) {
  console.log("✅ 低压创意职业保留");
}
```

---

## 七、分阶段部署建议

### Phase 1: 核心高危职业（第1周）

优先更新最关键的5个职业：

1. 临床医生 - 添加情绪+尽责+宜人门槛
2. 投资分析师 - 添加情绪门槛
3. 心理咨询师 - 添加情绪+宜人门槛
4. 财务会计 - 添加尽责门槛
5. 保险规划顾问 - 添加外向性维度+门槛

**目标:** 避免最高风险的误推荐

### Phase 2: 人际/服务职业（第2周）

更新10个需要E/A维度的职业：

- 外向性: 市场营销、HR、培训师、产品经理、咨询顾问
- 宜人性: 教师、社工、健康管理师、公益经理、医生

**目标:** 提升人际型职业推荐精准度

### Phase 3: 全量更新（第3-4周）

- 补充其余职业的可选维度
- 细化所有门槛值
- 收集用户反馈调整

---

## 八、FAQ

**Q1: 为什么软件工程师不需要外向性维度？**

A: 软件工程师主要是技术型工作，开放性(创新)、尽责性(严谨)、情绪稳定性(抗压)已足够区分。外向性对编码本身影响有限。

不过，Tech Lead 或架构师可以考虑添加 E=0.1 (略偏外向)，因为需要更多技术沟通。

**Q2: 门槛值如何确定？**

A: 基于以下原则：

1. **安全第一** - 如医生、电气工程师，情绪稳定性门槛 ≥ 0
2. **法律风险** - 如会计，尽责性门槛 ≥ 0.3
3. **客户信任** - 如咨询师，宜人性门槛 ≥ 0.2
4. **业务可行性** - 如销售，外向性门槛 ≥ 0（极度内向难展业）

**Q3: 会不会过度限制？**

A: 门槛设置较宽松，只过滤明显不适合的极端情况：

- 情绪稳定性门槛通常 ≤ 0（允许适度神经质）
- 外向性门槛通常 ≤ 0（允许内向者）
- 只有5-10个高危职业有门槛

**Q4: 如何处理边缘案例？**

A:
- 门槛值 -0.01 vs 真实值 -0.02: 系统会过滤
- 建议在UI提示用户："您的情绪稳定性略低于该职业建议值，但仍可尝试，建议提升抗压能力"

---

**文档版本:** v1.0
**维护者:** BeGreat 技术团队
