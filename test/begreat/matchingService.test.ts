import assert from "assert";
import { matchCareers } from "../../src/apps/begreat/miniapp/services/MatchingService";
import type { IOccupationNorm } from "../../src/apps/begreat/entity/occupation.entity";

function makeJob(overrides: Partial<IOccupationNorm>): IOccupationNorm {
  return {
    code:            "TEST",
    title:           "测试职业",
    primaryRiasec:   "I",
    secondaryRiasec: "R",
    requiredBig5:    { openness: 0, conscientiousness: 0, emotionalStability: 0 },
    salaryIndex:     0.5,
    ageBonusMultiplier: { "18-24": 1.0, "25-34": 1.0, "35-44": 1.0, "45+": 1.0 },
    ageRange:        { min: 18, max: 60 },
    description:     "",
    isActive:        true,
    ...overrides,
  };
}

const JOBS: IOccupationNorm[] = [
  makeJob({
    code: "SWE",
    title: "软件工程师",
    primaryRiasec: "I",
    secondaryRiasec: "R",
    requiredBig5: { openness: 0.6, conscientiousness: 0.8, emotionalStability: 0.2 },
    salaryIndex: 0.9,
  }),
  makeJob({
    code: "PM",
    title: "产品经理",
    primaryRiasec: "E",
    secondaryRiasec: "A",
    requiredBig5: { openness: 0.5, conscientiousness: 0.5, emotionalStability: 0.5 },
    salaryIndex: 0.75,
  }),
  makeJob({
    code: "DESIGN",
    title: "设计师",
    primaryRiasec: "A",
    secondaryRiasec: "I",
    requiredBig5: { openness: 1.2, conscientiousness: 0.1, emotionalStability: -0.1 },
    salaryIndex: 0.55,
  }),
  makeJob({
    code: "HR",
    title: "人力资源",
    primaryRiasec: "S",
    secondaryRiasec: "E",
    requiredBig5: { openness: 0.1, conscientiousness: 0.7, emotionalStability: 0.6 },
    salaryIndex: 0.45,
  }),
  makeJob({
    code: "FIN",
    title: "财务分析师",
    primaryRiasec: "C",
    secondaryRiasec: "I",
    requiredBig5: { openness: -0.2, conscientiousness: 1.1, emotionalStability: 0.9 },
    salaryIndex: 0.65,
  }),
  makeJob({ code: "INACTIVE", title: "已下线职业", primaryRiasec: "I", secondaryRiasec: "R", isActive: false }),
];

function tieRate(results: Array<{ matchScore: number }>): number {
  if (results.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const r of results) {
    counts.set(r.matchScore, (counts.get(r.matchScore) ?? 0) + 1);
  }
  const tiedCount = [...counts.values()].filter((v) => v > 1).reduce((acc, cur) => acc + cur, 0);
  return tiedCount / results.length;
}

describe("MatchingService.matchCareers", () => {
  it("过滤掉 isActive=false 的职业", () => {
    const results = matchCareers({ big5Norm: {}, age: 25 }, JOBS);
    assert.ok(results.every((r) => r.code !== "INACTIVE"), "已下线职业不应出现");
  });

  it("输出解释字段（scoreBreakdown）", () => {
    const results = matchCareers(
      { big5Norm: { O: 0.6, C: 0.8, N: -0.2 }, age: 27 },
      JOBS
    );
    assert.ok(results[0]?.scoreBreakdown, "应有分维度贡献字段");
    assert.ok(typeof results[0]?.scoreBreakdown?.ageMultiplier === "number");
  });

  it("基线审计：当前样本平分率低于 50%", () => {
    const results = matchCareers({ big5Norm: { O: 0.2, C: 0.1, N: 0.1 }, age: 29 }, JOBS, 10);
    assert.ok(tieRate(results) < 0.5, `平分率应 < 0.5，实际 ${tieRate(results)}`);
  });

  it("matchScore 保持 0-100 且保留一位小数", () => {
    const results = matchCareers({ big5Norm: { O: 2.0, C: 2.0, N: -2.0 }, age: 25 }, JOBS);
    results.forEach((r) => {
      assert.ok(r.matchScore >= 0 && r.matchScore <= 100);
      const decimalPart = String(r.matchScore).split(".")[1];
      assert.ok(!decimalPart || decimalPart.length <= 1);
    });
  });

  it("贴近岗位画像时分数更高", () => {
    const near = matchCareers(
      { big5Norm: { O: 0.6, C: 0.8, N: -0.2 }, age: 27 },
      JOBS
    );
    const far = matchCareers(
      { big5Norm: { O: -1.2, C: -1.0, N: 1.5 }, age: 27 },
      JOBS
    );
    const nearSwe = near.find((r) => r.code === "SWE")!;
    const farSwe = far.find((r) => r.code === "SWE")!;
    assert.ok(nearSwe.matchScore > farSwe.matchScore, "画像接近时分数应更高");
  });

  it("年龄不符时有折减", () => {
    const youngJob = makeJob({
      code: "YOUNG",
      title: "青年职位",
      ageRange: { min: 18, max: 24 },
      ageBonusMultiplier: { "18-24": 1.0, "25-34": 1.0, "35-44": 1.0, "45+": 1.0 },
    });
    const inRange = matchCareers({ big5Norm: { O: 0.1, C: 0.2, N: 0.1 }, age: 22 }, [youngJob]);
    const outRange = matchCareers({ big5Norm: { O: 0.1, C: 0.2, N: 0.1 }, age: 40 }, [youngJob]);
    assert.ok(outRange[0]!.matchScore < inRange[0]!.matchScore);
  });

  it("limit 参数限制返回数量", () => {
    const results = matchCareers({ big5Norm: {}, age: 25 }, JOBS, 3);
    assert.strictEqual(results.length, 3);
  });

  it("结果按 matchScore 降序排列", () => {
    const results = matchCareers({ big5Norm: { O: 0.2, C: 0.2, N: 0.1 }, age: 28 }, JOBS);
    for (let i = 0; i < results.length - 1; i++) {
      assert.ok(
        results[i]!.matchScore >= results[i + 1]!.matchScore,
        `第 ${i} 项分数(${results[i]!.matchScore}) 应 ≥ 第 ${i+1} 项(${results[i+1]!.matchScore})`
      );
    }
  });

  it("新字段 industry / salary / aiRisk 透传到结果", () => {
    const job = makeJob({
      code: "RICH",
      industry: { primary: "科技", secondary: "AI" },
      salary:   { min: 30, max: 80, unit: "month" },
      aiRisk:   0.4,
      primaryRiasec: "I",
    });
    const results = matchCareers(
      { big5Norm: {}, age: 28 },
      [job]
    );
    const r = results[0]!;
    assert.deepStrictEqual(r.industry, { primary: "科技", secondary: "AI" });
    assert.strictEqual(r.salary?.min, 30);
    assert.strictEqual(r.aiRisk, 0.4);
  });

  it("ageHints 透传到结果", () => {
    const job = makeJob({
      code: "HINT",
      primaryRiasec: "I",
      ageHints: { "25-34": "这是成长期建议" },
    });
    const results = matchCareers(
      { big5Norm: {}, age: 28 },
      [job]
    );
    assert.strictEqual(results[0]!.ageHints?.["25-34"], "这是成长期建议");
  });
});
