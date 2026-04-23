import assert from "assert";
import { matchCareers } from "../../src/apps/begreat/miniapp/services/MatchingService";
import type { IOccupationNorm } from "../../src/apps/begreat/entity/occupation.entity";

// ── 测试用职业数据 ──────────────────────────────────────────────────────────────

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
  makeJob({ code: "SWE",    title: "软件工程师",   primaryRiasec: "I", secondaryRiasec: "R", salaryIndex: 0.8 }),
  makeJob({ code: "PM",     title: "产品经理",     primaryRiasec: "E", secondaryRiasec: "A", salaryIndex: 0.7 }),
  makeJob({ code: "DESIGN", title: "设计师",       primaryRiasec: "A", secondaryRiasec: "I", salaryIndex: 0.5 }),
  makeJob({ code: "HR",     title: "人力资源",     primaryRiasec: "S", secondaryRiasec: "E", salaryIndex: 0.4 }),
  makeJob({ code: "FIN",    title: "财务分析师",   primaryRiasec: "C", secondaryRiasec: "I", salaryIndex: 0.6 }),
  makeJob({ code: "INACTIVE", title: "已下线职业", primaryRiasec: "I", secondaryRiasec: "R", isActive: false }),
];

// ── 测试 ────────────────────────────────────────────────────────────────────────

describe("MatchingService.matchCareers", () => {

  it("过滤掉 isActive=false 的职业", () => {
    const results = matchCareers(
      { riasecNorm: { I: 1.0 }, big5Norm: {}, age: 25 },
      JOBS
    );
    assert.ok(results.every((r) => r.code !== "INACTIVE"), "已下线职业不应出现");
  });

  it("主 RIASEC 匹配 top1 得 60 分基础分，排名最高", () => {
    const results = matchCareers(
      { riasecNorm: { I: 2.0, E: 0.1 }, big5Norm: {}, age: 25 },
      JOBS
    );
    assert.strictEqual(results[0]?.code, "SWE", "I 型最高应为软件工程师");
  });

  it("E 型用户：产品经理排第一", () => {
    const results = matchCareers(
      { riasecNorm: { E: 2.0, A: 0.5 }, big5Norm: {}, age: 28 },
      JOBS
    );
    assert.strictEqual(results[0]?.code, "PM");
  });

  it("matchScore 是正数且已保留一位小数", () => {
    const results = matchCareers(
      { riasecNorm: { I: 1.0 }, big5Norm: {}, age: 25 },
      JOBS
    );
    results.forEach((r) => {
      assert.ok(r.matchScore >= 0, `matchScore 应 ≥ 0，got ${r.matchScore}`);
      // 保留 1 位小数：转字符串后小数位不超过 1 位
      const decimalPart = String(r.matchScore).split(".")[1];
      assert.ok(!decimalPart || decimalPart.length <= 1, `小数位过多：${r.matchScore}`);
    });
  });

  it("Big5 开放性高 → 高薪职业额外加分", () => {
    const withHighO = matchCareers(
      { riasecNorm: { I: 1.0 }, big5Norm: { O: 1.5 }, age: 25 },
      JOBS
    );
    const withLowO = matchCareers(
      { riasecNorm: { I: 1.0 }, big5Norm: { O: -1.5 }, age: 25 },
      JOBS
    );
    const sweHighO = withHighO.find((r) => r.code === "SWE")!;
    const sweLowO  = withLowO.find((r)  => r.code === "SWE")!;
    assert.ok(sweHighO.matchScore > sweLowO.matchScore, "高开放性应拉高高薪职业匹配分");
  });

  it("Big5 尽责性差值 2.0 → 总分差 16 分（2.0 × 8）", () => {
    const withC = matchCareers(
      { riasecNorm: { I: 1.0 }, big5Norm: { C: 1.0 }, age: 25 },
      JOBS
    );
    const noC = matchCareers(
      { riasecNorm: { I: 1.0 }, big5Norm: { C: -1.0 }, age: 25 },
      JOBS
    );
    const sweC  = withC.find((r) => r.code === "SWE")!;
    const sweNC = noC.find((r)  => r.code === "SWE")!;
    assert.ok(sweC.matchScore - sweNC.matchScore === 16, `尽责性加分应为 16，得 ${sweC.matchScore - sweNC.matchScore}`);
  });

  it("情绪稳定性差值 2.0 → 总分差 12 分（2.0 × 6）", () => {
    const stable   = matchCareers(
      { riasecNorm: { I: 1.0 }, big5Norm: { N: -1.0 }, age: 25 },
      JOBS
    );
    const unstable = matchCareers(
      { riasecNorm: { I: 1.0 }, big5Norm: { N:  1.0 }, age: 25 },
      JOBS
    );
    const sweS = stable.find((r)   => r.code === "SWE")!;
    const sweU = unstable.find((r) => r.code === "SWE")!;
    assert.ok(sweS.matchScore - sweU.matchScore === 12, `情绪稳定加分应为 12，得 ${sweS.matchScore - sweU.matchScore}`);
  });

  it("年龄符合时使用对应年龄组的系数", () => {
    const job = makeJob({
      code: "PRIME", title: "黄金期职位",
      primaryRiasec: "I",
      ageRange: { min: 18, max: 50 },
      ageBonusMultiplier: { "18-24": 0.9, "25-34": 1.2, "35-44": 1.1, "45+": 1.0 }
    });
    const age25 = matchCareers({ riasecNorm: { I: 1.0 }, big5Norm: {}, age: 25 }, [job]);
    const age30 = matchCareers({ riasecNorm: { I: 1.0 }, big5Norm: {}, age: 30 }, [job]);
    const age35 = matchCareers({ riasecNorm: { I: 1.0 }, big5Norm: {}, age: 35 }, [job]);

    // 25岁和30岁都在25-34年龄段，应该分数相同
    assert.strictEqual(age25[0]!.matchScore, age30[0]!.matchScore, "同一年龄段分数应相同");

    // 25-34年龄段(1.2)的分数应该高于35-44年龄段(1.1)
    assert.ok(age25[0]!.matchScore > age35[0]!.matchScore, "黄金年龄段分数应更高");
  });

  it("年龄不符时 matchScore 乘以 0.85", () => {
    const youngJob = makeJob({
      code: "YOUNG", title: "青年职位",
      primaryRiasec: "I", ageRange: { min: 18, max: 24 },
      ageBonusMultiplier: { "18-24": 1.0, "25-34": 1.0, "35-44": 1.0, "45+": 1.0 }
    });
    const inRange  = matchCareers({ riasecNorm: { I: 1.0 }, big5Norm: {}, age: 22 }, [youngJob]);
    const outRange = matchCareers({ riasecNorm: { I: 1.0 }, big5Norm: {}, age: 40 }, [youngJob]);
    assert.ok(
      Math.abs(outRange[0]!.matchScore / inRange[0]!.matchScore - 0.85) < 0.01,
      "年龄不符应乘 0.85"
    );
  });

  it("limit 参数限制返回数量", () => {
    const results = matchCareers(
      { riasecNorm: { I: 1.0 }, big5Norm: {}, age: 25 },
      JOBS,
      3
    );
    assert.strictEqual(results.length, 3);
  });

  it("结果按 matchScore 降序排列", () => {
    const results = matchCareers(
      { riasecNorm: { I: 1.5, E: 0.8 }, big5Norm: {}, age: 28 },
      JOBS
    );
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
      { riasecNorm: { I: 1.0 }, big5Norm: {}, age: 28 },
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
      { riasecNorm: { I: 1.0 }, big5Norm: {}, age: 28 },
      [job]
    );
    assert.strictEqual(results[0]!.ageHints?.["25-34"], "这是成长期建议");
  });

});
