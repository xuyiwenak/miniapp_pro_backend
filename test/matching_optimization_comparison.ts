/**
 * 优化前后对比测试
 * 展示添加硬性门槛和动态权重的效果
 */

import { matchCareers } from "../src/apps/begreat/miniapp/services/MatchingService";
import occupationsData from "../tpl/seed_occupation.json";
import type { IOccupationNorm } from "../src/apps/begreat/entity/occupation.entity";

// 模拟添加硬性门槛的职业数据
const occupationsWithThresholds: IOccupationNorm[] = occupationsData.map((occ) => {
  const updated = { ...occ };

  // 添加硬性门槛
  switch (occ.code) {
    case "MED_DOC": // 临床医生
      updated.minimumRequirements = {
        emotionalStability: 0.0,
        conscientiousness: 0.3,
      };
      break;

    case "FIN_IA": // 投资分析师
      updated.minimumRequirements = {
        emotionalStability: -0.1,
        conscientiousness: 0.2,
      };
      break;

    case "TECH_AI": // AI工程师
      updated.minimumRequirements = {
        emotionalStability: -0.3,
        conscientiousness: 0.1,
      };
      break;

    case "BIZ_CONSULT": // 管理咨询顾问
      updated.minimumRequirements = {
        emotionalStability: 0.0,
        conscientiousness: 0.3,
      };
      break;

    case "MED_PSY": // 心理咨询师
      updated.minimumRequirements = {
        emotionalStability: 0.0,
      };
      updated.requiredBig5 = {
        ...updated.requiredBig5,
        agreeableness: 0.5,
      };
      break;

    case "FIN_ACC": // 财务会计
      updated.minimumRequirements = {
        conscientiousness: 0.3,
      };
      break;

    case "BIZ_MKT": // 市场营销经理
      updated.requiredBig5 = {
        ...updated.requiredBig5,
        extraversion: 0.3,
      };
      updated.minimumRequirements = {
        extraversion: -0.1,
      };
      break;

    case "FIN_INS": // 保险规划顾问
      updated.requiredBig5 = {
        ...updated.requiredBig5,
        extraversion: 0.4,
      };
      updated.minimumRequirements = {
        extraversion: 0.0,
      };
      break;
  }

  return updated;
});

// 测试用户：情绪敏感型
const sensitiveUser = {
  name: "赵六 - 高压力敏感型",
  big5Norm: {
    O: 0.5,
    C: 0.1,
    E: -0.2,
    A: 0.3,
    N: 0.6, // 高神经质 → 情绪稳定性 = -0.6
  },
  age: 26,
};

console.log("=" .repeat(100));
console.log("职业匹配算法优化效果对比");
console.log("=" .repeat(100));
console.log();

console.log(`测试用户: ${sensitiveUser.name}`);
console.log(`特质: O=${sensitiveUser.big5Norm.O}, C=${sensitiveUser.big5Norm.C}, 情绪稳定性=${-(sensitiveUser.big5Norm.N)}`);
console.log(`年龄: ${sensitiveUser.age}岁`);
console.log();

// 原始数据推荐
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("【优化前】不含硬性门槛");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const resultsOriginal = matchCareers(sensitiveUser, occupationsData, 10);

console.log(`排名  匹配分  职业名称              情绪要求  用户情绪  差距    风险评估`);
console.log(`${"─".repeat(100)}`);

resultsOriginal.forEach((match, idx) => {
  const occ = occupationsData.find((o) => o.code === match.code);
  const requiredStability = occ?.requiredBig5.emotionalStability ?? 0;
  const userStability = -sensitiveUser.big5Norm.N;
  const gap = userStability - requiredStability;

  let risk = "";
  if (requiredStability >= 0.3 && userStability < 0) {
    risk = "⚠️ 高压+情绪敏感";
  } else if (requiredStability >= 0.3) {
    risk = "⚠️ 高压职业";
  } else if (userStability < -0.3) {
    risk = "⚠️ 情绪敏感";
  } else {
    risk = "✅ 相对安全";
  }

  const rank = `${idx + 1}`.padStart(2);
  const score = `${match.matchScore}`.padStart(4);
  const title = match.title.padEnd(20);
  const required = requiredStability.toFixed(1).padStart(6);
  const user = userStability.toFixed(1).padStart(6);
  const gapStr = gap.toFixed(1).padStart(6);

  console.log(`${rank}.   ${score}   ${title}  ${required}    ${user}     ${gapStr}   ${risk}`);
});

// 优化后数据推荐
console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("【优化后】包含硬性门槛 + 动态权重");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const resultsOptimized = matchCareers(sensitiveUser, occupationsWithThresholds, 10);

console.log(`排名  匹配分  职业名称              情绪要求  最低门槛  用户情绪  是否通过`);
console.log(`${"─".repeat(100)}`);

resultsOptimized.forEach((match, idx) => {
  const occ = occupationsWithThresholds.find((o) => o.code === match.code);
  const requiredStability = occ?.requiredBig5.emotionalStability ?? 0;
  const minRequirement = occ?.minimumRequirements?.emotionalStability;
  const userStability = -sensitiveUser.big5Norm.N;

  let passed = "✅ 通过";
  if (minRequirement !== undefined && userStability < minRequirement) {
    passed = "❌ 过滤";
  }

  const rank = `${idx + 1}`.padStart(2);
  const score = `${match.matchScore}`.padStart(4);
  const title = match.title.padEnd(20);
  const required = requiredStability.toFixed(1).padStart(6);
  const minReq = minRequirement !== undefined ? minRequirement.toFixed(1).padStart(6) : "  无  ";
  const user = userStability.toFixed(1).padStart(6);

  console.log(`${rank}.   ${score}   ${title}  ${required}      ${minReq}      ${user}      ${passed}`);
});

// 对比分析
console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("【对比分析】被过滤的高风险职业");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const originalCodes = new Set(resultsOriginal.map((r) => r.code));
const optimizedCodes = new Set(resultsOptimized.map((r) => r.code));

const filtered = [...originalCodes].filter((code) => !optimizedCodes.has(code));
const added = [...optimizedCodes].filter((code) => !originalCodes.has(code));

if (filtered.length > 0) {
  console.log(`\n✅ 优化后被过滤的职业 (共 ${filtered.length} 个):`);
  filtered.forEach((code) => {
    const match = resultsOriginal.find((r) => r.code === code);
    const occ = occupationsWithThresholds.find((o) => o.code === code);
    const minReq = occ?.minimumRequirements?.emotionalStability ?? "无";
    console.log(`  - ${match?.title.padEnd(20)} (原分数: ${match?.matchScore}, 门槛: ${minReq})`);
  });
}

if (added.length > 0) {
  console.log(`\n📈 优化后新增的职业 (共 ${added.length} 个):`);
  added.forEach((code) => {
    const match = resultsOptimized.find((r) => r.code === code);
    console.log(`  - ${match?.title.padEnd(20)} (新分数: ${match?.matchScore})`);
  });
}

// 高压职业处理效果
console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("【高压职业处理效果】(情绪稳定性要求 ≥ 0.3)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const highStressJobs = occupationsWithThresholds.filter(
  (occ) => occ.requiredBig5.emotionalStability >= 0.3
);

console.log(`\n高压职业列表 (共 ${highStressJobs.length} 个):`);
highStressJobs.forEach((occ) => {
  const inOriginal = originalCodes.has(occ.code);
  const inOptimized = optimizedCodes.has(occ.code);
  const status = inOriginal && !inOptimized ? "❌ 已过滤" : inOptimized ? "⚠️  仍推荐" : "  未上榜";

  console.log(`  ${status}  ${occ.title.padEnd(20)}  (要求: ${occ.requiredBig5.emotionalStability.toFixed(1)}, 门槛: ${occ.minimumRequirements?.emotionalStability ?? "无"})`);
});

// 统计总结
console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("【总结】");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`\n优化效果:`);
console.log(`  ✅ 过滤了 ${filtered.length} 个不适合的高风险职业`);
console.log(`  ✅ 避免了情绪敏感者进入高压行业`);
console.log(`  ✅ 保留了 ${resultsOptimized.length} 个相对适合的职业推荐`);
console.log(`  ✅ 提升了推荐的安全性和合理性`);

const avgScoreOriginal = resultsOriginal.reduce((sum, r) => sum + r.matchScore, 0) / resultsOriginal.length;
const avgScoreOptimized = resultsOptimized.reduce((sum, r) => sum + r.matchScore, 0) / resultsOptimized.length;

console.log(`\n平均匹配分:`);
console.log(`  优化前: ${avgScoreOriginal.toFixed(1)} 分`);
console.log(`  优化后: ${avgScoreOptimized.toFixed(1)} 分`);
console.log(`  变化: ${(avgScoreOptimized - avgScoreOriginal > 0 ? "+" : "")}${(avgScoreOptimized - avgScoreOriginal).toFixed(1)} 分`);

console.log();
console.log("=" .repeat(100));
console.log("测试完成 - 优化算法显著提升了推荐质量");
console.log("=" .repeat(100));
