/**
 * 职业匹配算法模拟测试
 * 模拟5个不同性格画像的用户，查看推荐结果
 */

import { matchCareers } from "../src/apps/begreat/miniapp/services/MatchingService";
import occupations from "../tpl/seed_occupation.json";

// 模拟5个典型用户画像
const testProfiles = [
  {
    name: "张三 - 高开放性创意型",
    description: "24岁，喜欢创新和艺术，思维发散，不太关注细节，情绪较稳定",
    big5Norm: {
      O: 0.6,   // 高开放性
      C: -0.2,  // 低尽责性
      E: 0.3,   // 中等外向性 (算法不使用)
      A: 0.1,   // 低宜人性 (算法不使用)
      N: -0.1,  // 低神经质 = 高情绪稳定性
    },
    age: 24,
  },
  {
    name: "李四 - 高尽责性执行型",
    description: "28岁，做事严谨细致，注重规则和流程，不太追求创新，情绪稳定",
    big5Norm: {
      O: -0.3,  // 低开放性
      C: 0.7,   // 高尽责性
      E: -0.1,  // 略内向 (算法不使用)
      A: 0.4,   // 高宜人性 (算法不使用)
      N: -0.2,  // 低神经质 = 高情绪稳定性
    },
    age: 28,
  },
  {
    name: "王五 - 平衡型技术人",
    description: "32岁，各方面较平衡，略偏理性和逻辑，情绪较稳定",
    big5Norm: {
      O: 0.2,   // 中等开放性
      C: 0.3,   // 中等尽责性
      E: 0.0,   // 中等外向性 (算法不使用)
      A: 0.0,   // 中等宜人性 (算法不使用)
      N: 0.0,   // 中等神经质 = 中等情绪稳定性
    },
    age: 32,
  },
  {
    name: "赵六 - 高压力敏感型",
    description: "26岁，富有创造力但情绪敏感，压力应对较弱",
    big5Norm: {
      O: 0.5,   // 高开放性
      C: 0.1,   // 略低尽责性
      E: -0.2,  // 略内向 (算法不使用)
      A: 0.3,   // 高宜人性 (算法不使用)
      N: 0.6,   // 高神经质 = 低情绪稳定性
    },
    age: 26,
  },
  {
    name: "孙七 - 资深管理型",
    description: "42岁，经验丰富，稳重成熟，注重结果和执行力",
    big5Norm: {
      O: 0.1,   // 略低开放性
      C: 0.5,   // 高尽责性
      E: 0.4,   // 外向 (算法不使用)
      A: 0.2,   // 中等宜人性 (算法不使用)
      N: -0.3,  // 低神经质 = 高情绪稳定性
    },
    age: 42,
  },
];

// 运行模拟
console.log("=" .repeat(100));
console.log("职业匹配算法模拟测试 - 5个用户画像");
console.log("=" .repeat(100));
console.log();

testProfiles.forEach((profile, index) => {
  console.log(`\n${"━".repeat(100)}`);
  console.log(`【用户 ${index + 1}】${profile.name}`);
  console.log(`${"━".repeat(100)}`);
  console.log(`描述: ${profile.description}`);
  console.log(`年龄: ${profile.age}岁`);
  console.log(`Big5 常模分数:`);
  console.log(`  - 开放性(O): ${profile.big5Norm.O.toFixed(2).padStart(6)} ${getBar(profile.big5Norm.O)}`);
  console.log(`  - 尽责性(C): ${profile.big5Norm.C.toFixed(2).padStart(6)} ${getBar(profile.big5Norm.C)}`);
  console.log(`  - 外向性(E): ${profile.big5Norm.E.toFixed(2).padStart(6)} ${getBar(profile.big5Norm.E)} (不参与匹配)`);
  console.log(`  - 宜人性(A): ${profile.big5Norm.A.toFixed(2).padStart(6)} ${getBar(profile.big5Norm.A)} (不参与匹配)`);
  console.log(`  - 神经质(N): ${profile.big5Norm.N.toFixed(2).padStart(6)} ${getBar(profile.big5Norm.N)} → 情绪稳定性=${(-profile.big5Norm.N).toFixed(2)}`);
  console.log();

  // 获取推荐职业
  const matches = matchCareers(
    { big5Norm: profile.big5Norm, age: profile.age },
    occupations,
    10 // 只展示前10个
  );

  console.log(`前10个匹配职业:`);
  console.log(`${"─".repeat(100)}`);
  console.log(`排名  匹配分  职业名称              行业          薪资范围      AI风险  年龄加成`);
  console.log(`${"─".repeat(100)}`);

  matches.forEach((match, idx) => {
    const rank = `${idx + 1}`.padStart(2);
    const score = `${match.matchScore}`.padStart(4);
    const title = match.title.padEnd(20);
    const industry = `${match.industry.primary}/${match.industry.secondary}`.padEnd(12);
    const salary = `${match.salary.min}-${match.salary.max}k`.padEnd(12);
    const aiRisk = `${(match.aiRisk * 100).toFixed(0)}%`.padStart(4);
    const ageMultiplier = `${match.scoreBreakdown.ageMultiplier.toFixed(2)}x`.padStart(6);

    console.log(`${rank}.   ${score}   ${title}  ${industry}  ${salary}  ${aiRisk}   ${ageMultiplier}`);
  });

  // 分析高分职业特征
  console.log();
  console.log(`推荐分析:`);
  const topMatches = matches.slice(0, 5);
  const avgOpenness = topMatches.reduce((sum, m) => {
    const occ = occupations.find(o => o.code === m.code);
    return sum + (occ?.requiredBig5.openness ?? 0);
  }, 0) / topMatches.length;

  const avgConsc = topMatches.reduce((sum, m) => {
    const occ = occupations.find(o => o.code === m.code);
    return sum + (occ?.requiredBig5.conscientiousness ?? 0);
  }, 0) / topMatches.length;

  const avgEmotional = topMatches.reduce((sum, m) => {
    const occ = occupations.find(o => o.code === m.code);
    return sum + (occ?.requiredBig5.emotionalStability ?? 0);
  }, 0) / topMatches.length;

  console.log(`  - Top 5 职业平均要求: O=${avgOpenness.toFixed(2)}, C=${avgConsc.toFixed(2)}, E稳定性=${avgEmotional.toFixed(2)}`);
  console.log(`  - 用户特质: O=${profile.big5Norm.O.toFixed(2)}, C=${profile.big5Norm.C.toFixed(2)}, E稳定性=${(-profile.big5Norm.N).toFixed(2)}`);
  console.log(`  - 匹配度: ${matches[0].matchScore >= 80 ? '高度匹配' : matches[0].matchScore >= 60 ? '中等匹配' : '匹配较弱'}`);
});

console.log("\n" + "=".repeat(100));
console.log("测试完成");
console.log("=".repeat(100));

// 辅助函数：生成可视化bar
function getBar(value: number): string {
  const normalized = Math.max(-1, Math.min(1, value));
  const length = Math.abs(normalized) * 10;
  const bar = "█".repeat(Math.round(length));
  return normalized >= 0 ? `+${bar}` : `-${bar}`;
}
