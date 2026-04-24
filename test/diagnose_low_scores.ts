/**
 * 诊断低分问题
 * 用户数据: O=1.85, C=0.56, E=0.70, A=0.89, N=-1.41 (稳定性=1.41)
 * 年龄: 36岁
 */

import { matchCareers } from "../src/apps/begreat/miniapp/services/MatchingService";
import occupations from "../tpl/seed_occupation.json";

const userData = {
  big5Norm: {
    O: 1.85,   // 非常高开放性
    C: 0.56,   // 中等尽责性
    E: 0.70,   // 中等外向性
    A: 0.89,   // 高宜人性
    N: -1.41,  // 低神经质 → 情绪稳定性 = 1.41 (非常高)
  },
  age: 36,
};

console.log("=" .repeat(100));
console.log("低分问题诊断");
console.log("=" .repeat(100));
console.log();

console.log("用户特质 (标准分):");
console.log(`  开放性 (O): ${userData.big5Norm.O.toFixed(2)} ⭐ 非常高 (超过93%的人)`);
console.log(`  尽责性 (C): ${userData.big5Norm.C.toFixed(2)} ✅ 中等偏高`);
console.log(`  外向性 (E): ${userData.big5Norm.E.toFixed(2)} ✅ 中等偏高`);
console.log(`  宜人性 (A): ${userData.big5Norm.A.toFixed(2)} ⭐ 高`);
console.log(`  神经质 (N): ${userData.big5Norm.N.toFixed(2)} → 情绪稳定性 = ${(-userData.big5Norm.N).toFixed(2)} ⭐⭐ 非常高`);
console.log(`  年龄: ${userData.age}岁`);
console.log();

// 运行匹配
const results = matchCareers(userData, occupations, 10);

console.log("━".repeat(100));
console.log("匹配结果");
console.log("━".repeat(100));
console.log();

console.log("Top 10 职业推荐:");
console.log(`${"排名".padEnd(6)} ${"分数".padEnd(6)} ${"职业".padEnd(20)} ${"职业要求 (O, C, N)".padEnd(25)} ${"用户值".padEnd(20)} ${"差距"}`);
console.log("─".repeat(100));

results.forEach((match, idx) => {
  const occ = occupations.find((o) => o.code === match.code);
  if (!occ) return;

  const reqO = occ.requiredBig5.openness;
  const reqC = occ.requiredBig5.conscientiousness;
  const reqN = occ.requiredBig5.emotionalStability;

  const userO = userData.big5Norm.O;
  const userC = userData.big5Norm.C;
  const userN = -userData.big5Norm.N;

  const diffO = Math.abs(userO - reqO);
  const diffC = Math.abs(userC - reqC);
  const diffN = Math.abs(userN - reqN);

  const rank = `${idx + 1}`.padEnd(6);
  const score = `${match.matchScore}`.padEnd(6);
  const title = match.title.padEnd(20);
  const req = `O=${reqO.toFixed(1)}, C=${reqC.toFixed(1)}, N=${reqN.toFixed(1)}`.padEnd(25);
  const user = `O=${userO.toFixed(1)}, C=${userC.toFixed(1)}, N=${userN.toFixed(1)}`.padEnd(20);
  const diff = `ΔO=${diffO.toFixed(2)}, ΔC=${diffC.toFixed(2)}, ΔN=${diffN.toFixed(2)}`;

  console.log(`${rank} ${score} ${title} ${req} ${user} ${diff}`);
});

console.log();
console.log("━".repeat(100));
console.log("问题分析");
console.log("━".repeat(100));
console.log();

// 分析最高分职业
const topMatch = results[0];
const topOcc = occupations.find((o) => o.code === topMatch.code);

if (topOcc) {
  console.log(`最高分职业: ${topMatch.title} (${topMatch.matchScore}分)`);
  console.log();
  console.log("差异分析:");

  const oDiff = userData.big5Norm.O - topOcc.requiredBig5.openness;
  const cDiff = userData.big5Norm.C - topOcc.requiredBig5.conscientiousness;
  const nDiff = -userData.big5Norm.N - topOcc.requiredBig5.emotionalStability;

  console.log(`  开放性差异: ${oDiff.toFixed(2)} (用户${userData.big5Norm.O.toFixed(2)} vs 要求${topOcc.requiredBig5.openness.toFixed(2)})`);
  console.log(`  尽责性差异: ${cDiff.toFixed(2)} (用户${userData.big5Norm.C.toFixed(2)} vs 要求${topOcc.requiredBig5.conscientiousness.toFixed(2)})`);
  console.log(`  情绪稳定性差异: ${nDiff.toFixed(2)} (用户${(-userData.big5Norm.N).toFixed(2)} vs 要求${topOcc.requiredBig5.emotionalStability.toFixed(2)})`);
  console.log();

  // 计算距离
  const isHighStress = topOcc.requiredBig5.emotionalStability >= 0.3;
  const stabilityWeight = isHighStress ? 1.3 : 0.95;
  const opennessWeight = 1.2 + topOcc.salaryIndex * 0.8;

  const weightedSquares =
    oDiff * oDiff * opennessWeight +
    cDiff * cDiff * 1.05 +
    nDiff * nDiff * stabilityWeight;

  const distance = Math.sqrt(weightedSquares);

  console.log("权重计算:");
  console.log(`  开放性权重: ${opennessWeight.toFixed(2)} (基础1.2 + 薪资指数${topOcc.salaryIndex} × 0.8)`);
  console.log(`  尽责性权重: 1.05 (固定)`);
  console.log(`  情绪权重: ${stabilityWeight} (${isHighStress ? "高压职业" : "普通职业"})`);
  console.log();

  console.log(`加权欧式距离: ${distance.toFixed(3)}`);
  console.log();

  const steepness = 1.2;
  const center = 1.35;
  const baseScore = 100 / (1 + Math.exp(steepness * (distance - center)));

  console.log(`Logistic映射: 100 / (1 + exp(1.2 × (${distance.toFixed(3)} - 1.35))) = ${baseScore.toFixed(1)}`);
  console.log();

  // 检查年龄调整
  let ageMultiplier = 1.0;
  if (userData.age >= topOcc.ageRange.min && userData.age <= topOcc.ageRange.max) {
    const ageGroup = userData.age >= 45 ? "45+" : userData.age >= 35 ? "35-44" : userData.age >= 25 ? "25-34" : "18-24";
    ageMultiplier = topOcc.ageBonusMultiplier[ageGroup];
    console.log(`年龄调整: ${userData.age}岁 属于 ${ageGroup} 组，系数 ${ageMultiplier}`);
  } else {
    const deviation = userData.age < topOcc.ageRange.min
      ? topOcc.ageRange.min - userData.age
      : userData.age - topOcc.ageRange.max;
    console.log(`年龄超出范围 (${topOcc.ageRange.min}-${topOcc.ageRange.max})，偏离 ${deviation} 年`);
  }

  const finalScore = baseScore * ageMultiplier;
  console.log(`最终分数: ${baseScore.toFixed(1)} × ${ageMultiplier} = ${finalScore.toFixed(1)}`);
}

console.log();
console.log("━".repeat(100));
console.log("🔍 问题根源诊断");
console.log("━".repeat(100));
console.log();

// 检查职业要求范围
const allOpenness = occupations.map(o => o.requiredBig5.openness);
const allConsc = occupations.map(o => o.requiredBig5.conscientiousness);
const allStability = occupations.map(o => o.requiredBig5.emotionalStability);

const maxO = Math.max(...allOpenness);
const minO = Math.min(...allOpenness);
const maxC = Math.max(...allConsc);
const minC = Math.min(...allConsc);
const maxN = Math.max(...allStability);
const minN = Math.min(...allStability);

console.log("职业数据库中的要求范围:");
console.log(`  开放性范围: ${minO.toFixed(1)} ~ ${maxO.toFixed(1)}`);
console.log(`  尽责性范围: ${minC.toFixed(1)} ~ ${maxC.toFixed(1)}`);
console.log(`  情绪稳定性范围: ${minN.toFixed(1)} ~ ${maxN.toFixed(1)}`);
console.log();

console.log("用户的值:");
console.log(`  开放性: ${userData.big5Norm.O.toFixed(2)} ${userData.big5Norm.O > maxO ? "⚠️ 超出范围上限!" : "✅"}`);
console.log(`  尽责性: ${userData.big5Norm.C.toFixed(2)} ${userData.big5Norm.C > maxC ? "⚠️ 超出范围上限!" : "✅"}`);
console.log(`  情绪稳定性: ${(-userData.big5Norm.N).toFixed(2)} ${-userData.big5Norm.N > maxN ? "⚠️ 超出范围上限!" : "✅"}`);
console.log();

if (userData.big5Norm.O > maxO || userData.big5Norm.C > maxC || -userData.big5Norm.N > maxN) {
  console.log("🚨 发现问题: 用户特质超出职业数据库要求范围!");
  console.log();
  console.log("这意味着:");
  console.log("  1. 职业画像设置过低（要求范围: -1 ~ 1，实际只用到部分）");
  console.log("  2. 用户特质很优秀，但因为没有匹配的职业画像，分数反而低");
  console.log("  3. 算法基于\"距离\"计算，用户越优秀，距离越大，分数越低（反直觉）");
  console.log();
  console.log("建议修复:");
  console.log("  ✅ 提高职业画像的要求值到 0.8-1.5 范围");
  console.log("  ✅ 或者调整算法，超出上限时按上限计算");
  console.log("  ✅ 或者使用\"方向性匹配\"：越高越好的维度，超出不扣分");
}

console.log();
console.log("=" .repeat(100));
console.log("诊断完成");
console.log("=" .repeat(100));
