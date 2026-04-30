/**
 * 检查职业数据库中的五维评分情况
 */

import occupations from "../tpl/seed_occupation.json";

console.log("职业总数:", occupations.length);
console.log("\n=== 五维评分分析 ===\n");

const stats = {
  only3D: [] as any[],
  has5D: [] as any[],
  hasMiniReq: [] as any[],
};

occupations.forEach((job) => {
  const r = job.requiredBig5;
  const has5D = r.extraversion !== undefined || r.agreeableness !== undefined;

  if (has5D) {
    stats.has5D.push({
      title: job.title,
      code: job.code,
      O: r.openness,
      C: r.conscientiousness,
      N: r.emotionalStability,
      E: r.extraversion,
      A: r.agreeableness,
    });
  } else {
    stats.only3D.push({
      title: job.title,
      code: job.code,
      O: r.openness,
      C: r.conscientiousness,
      N: r.emotionalStability,
    });
  }

  if (job.minimumRequirements) {
    stats.hasMiniReq.push({
      title: job.title,
      miniReq: job.minimumRequirements,
    });
  }
});

console.log("只有3维 (O, C, N):", stats.only3D.length, "个");
console.log("有5维 (包含 E/A):", stats.has5D.length, "个");
console.log("设置了硬性门槛:", stats.hasMiniReq.length, "个");

console.log("\n=== 只有3维的职业 ===");
stats.only3D.forEach((j) => {
  console.log(
    `${j.title.padEnd(20)} O:${j.O.toFixed(1)} C:${j.C.toFixed(1)} N:${j.N.toFixed(1)}`
  );
});

if (stats.has5D.length > 0) {
  console.log("\n=== 有5维的职业 ===");
  stats.has5D.forEach((j) => {
    const eLine = j.E !== undefined ? `E:${j.E.toFixed(1)}` : "E:-  ";
    const aLine = j.A !== undefined ? `A:${j.A.toFixed(1)}` : "A:-  ";
    console.log(
      `${j.title.padEnd(20)} O:${j.O.toFixed(1)} C:${j.C.toFixed(1)} N:${j.N.toFixed(1)} ${eLine} ${aLine}`
    );
  });
}

if (stats.hasMiniReq.length > 0) {
  console.log("\n=== 有硬性门槛的职业 ===");
  stats.hasMiniReq.forEach((j) => {
    console.log(`${j.title}:`, JSON.stringify(j.miniReq));
  });
}

// 评分范围统计
console.log("\n=== 评分范围统计 ===");
const allScores = {
  O: [] as number[],
  C: [] as number[],
  N: [] as number[],
  E: [] as number[],
  A: [] as number[],
};

occupations.forEach((job) => {
  const r = job.requiredBig5;
  allScores.O.push(r.openness);
  allScores.C.push(r.conscientiousness);
  allScores.N.push(r.emotionalStability);
  if (r.extraversion !== undefined) allScores.E.push(r.extraversion);
  if (r.agreeableness !== undefined) allScores.A.push(r.agreeableness);
});

for (const [dim, scores] of Object.entries(allScores)) {
  if (scores.length === 0) continue;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log(
    `${dim}: 范围 [${min.toFixed(1)}, ${max.toFixed(1)}], 平均 ${avg.toFixed(2)}, 样本数 ${scores.length}`
  );
}

// 检查异常值
console.log("\n=== 异常值检测 ===");
occupations.forEach((job) => {
  const r = job.requiredBig5;
  const warnings = [];

  if (r.openness > 1.0) warnings.push(`开放性过高 (${r.openness})`);
  if (r.conscientiousness > 1.0) warnings.push(`尽责性过高 (${r.conscientiousness})`);
  if (r.emotionalStability > 1.0) warnings.push(`情绪稳定性过高 (${r.emotionalStability})`);
  if (r.extraversion && r.extraversion > 1.0) warnings.push(`外向性过高 (${r.extraversion})`);
  if (r.agreeableness && r.agreeableness > 1.0) warnings.push(`宜人性过高 (${r.agreeableness})`);

  if (warnings.length > 0) {
    console.log(`⚠️  ${job.title}: ${warnings.join(", ")}`);
  }
});

console.log("\n检查完成！");
