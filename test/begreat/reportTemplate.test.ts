import assert from "assert";
import {
  buildBegreatReportSnapshot,
  zToT,
  loadReportTemplate,
} from "../../src/apps/begreat/miniapp/services/reportTemplate";
import type { ICareerMatch } from "../../src/apps/begreat/entity/session.entity";

// ── 通用测试数据 ────────────────────────────────────────────────────────────────

const BASE_INPUT = {
  gender:             "female" as const,
  age:                26,
  big5Z:              { O: 0.8, C: 0.5, E: -0.3, A: 0.6, N: -0.7 },
  personalitySummary: "你在多个维度表现均衡，兼具创造力与执行力。",
  topRiasecCodes:     ["A", "E"],
};

const MOCK_CAREERS: ICareerMatch[] = [
  {
    code:        "PM",
    title:       "产品经理",
    matchScore:  87.5,
    salaryIndex: 0.72,
    description: "定义产品方向，协调各方资源落地。",
    industry:    { primary: "科技", secondary: "产品设计" },
    level:       "mid",
    salary:      { min: 18, max: 45, unit: "month" },
    skills:      { required: ["用户调研", "数据分析"], tools: ["Figma"] },
    aiRisk:      0.38,
    ageHints: { '25-30': '3–5年可晋升高级PM，薪资跳跃空间大。' },
  },
  {
    code:        "DS",
    title:       "数据科学家",
    matchScore:  75.0,
    salaryIndex: 0.85,
    description: "从数据中提取业务洞察，驱动决策优化。",
    industry:    { primary: "科技", secondary: "数据智能" },
    level:       "senior",
    salary:      { min: 22, max: 60, unit: "month" },
    aiRisk:      0.65,
    ageHints:    { "25-34": "建议深入某垂直领域积累领域数据直觉。" },
  },
];

// ── zToT ────────────────────────────────────────────────────────────────────────

describe("reportTemplate.zToT", () => {
  it("z=0 → T=50（均值）", () => {
    assert.strictEqual(zToT(0), 50);
  });

  it("z=1 → T=60（+1SD）", () => {
    assert.strictEqual(zToT(1), 60);
  });

  it("z=-1 → T=40（-1SD）", () => {
    assert.strictEqual(zToT(-1), 40);
  });

  it("z=1.5 → T=65", () => {
    assert.strictEqual(zToT(1.5), 65);
  });

  it("结果保留一位小数", () => {
    const t = zToT(0.333);
    assert.ok(Number.isFinite(t));
    const dec = String(t).split(".")[1];
    assert.ok(!dec || dec.length <= 1, `小数位过多: ${t}`);
  });
});

// ── loadReportTemplate ──────────────────────────────────────────────────────────

describe("reportTemplate.loadReportTemplate", () => {
  it("能正常加载 tpl/report_template.json", () => {
    const tpl = loadReportTemplate();
    assert.ok(tpl, "模板不应为 null");
    assert.ok(tpl.basic.title.length > 0, "basic.title 不应为空");
  });

  it("包含 5 个 Big5 维度", () => {
    const tpl = loadReportTemplate();
    const keys = Object.keys(tpl.dimensions);
    assert.deepStrictEqual(keys.sort(), ["A", "C", "E", "N", "O"]);
  });

  it("careers 区块结构完整", () => {
    const tpl = loadReportTemplate();
    assert.ok(tpl.careers, "缺少 careers 区块");
    assert.ok(tpl.careers.intro_by_age_gender["18-24"]?.female, "缺少 18-24 女性引导语");
    assert.ok(tpl.careers.ai_impact?.risk_bands?.low, "缺少 ai_impact.risk_bands.low");
    assert.ok(tpl.careers.ai_impact?.by_industry?.["科技"]?.medium, "缺少科技行业中风险建议");
  });

  it("8 大行业均有 AI 冲击建议（低/中/高）", () => {
    const tpl = loadReportTemplate();
    const industries = Object.keys(tpl.careers.ai_impact.by_industry);
    assert.strictEqual(industries.length, 8);
    industries.forEach((ind) => {
      const band = tpl.careers.ai_impact.by_industry[ind]!;
      assert.ok(band.low,    `${ind} 缺少 low`);
      assert.ok(band.medium, `${ind} 缺少 medium`);
      assert.ok(band.high,   `${ind} 缺少 high`);
    });
  });
});

// ── buildBegreatReportSnapshot ──────────────────────────────────────────────────

describe("reportTemplate.buildBegreatReportSnapshot", () => {

  it("返回基础字段（title/normDesc/disclaimer）", () => {
    const snap = buildBegreatReportSnapshot(BASE_INPUT);
    assert.ok(snap.title.length > 0,    "title 不应为空");
    assert.ok(snap.normDesc.length > 0, "normDesc 不应为空");
    assert.ok(snap.disclaimer.length > 0);
  });

  it("coverLine 包含性别标签和年龄段标签", () => {
    const snap = buildBegreatReportSnapshot(BASE_INPUT);
    assert.ok(snap.coverLine.includes("女性"), `coverLine 缺少性别标签：${snap.coverLine}`);
    assert.ok(snap.coverLine.includes("25–34"), `coverLine 缺少年龄标签：${snap.coverLine}`);
  });

  it("big5Dimensions 返回 5 个维度，顺序为 O C E A N", () => {
    const snap = buildBegreatReportSnapshot(BASE_INPUT);
    assert.strictEqual(snap.big5Dimensions.length, 5);
    assert.deepStrictEqual(
      snap.big5Dimensions.map((d) => d.code),
      ["O", "C", "E", "A", "N"]
    );
  });

  it("T 分计算正确（z=0.8 → T=58）", () => {
    const snap = buildBegreatReportSnapshot(BASE_INPUT);
    const o = snap.big5Dimensions.find((d) => d.code === "O")!;
    assert.strictEqual(o.tScore, 58, `O 的 T 分应为 58，got ${o.tScore}`);
  });

  it("N 维度负 z 分对应 low levelKey", () => {
    // z=-0.7 → T=43 → "low"
    const snap = buildBegreatReportSnapshot(BASE_INPUT);
    const n = snap.big5Dimensions.find((d) => d.code === "N")!;
    assert.strictEqual(n.levelKey, "low");
  });

  it("summaryLine 包含最高维度名称", () => {
    const snap = buildBegreatReportSnapshot(BASE_INPUT);
    // big5Z: O=0.8 最高，summaryLine 模板：高{high_dim1}
    assert.ok(snap.summaryLine.includes("开放性"), `summaryLine 应含最高维度，got: ${snap.summaryLine}`);
  });

  it("无 topCareers 时 careerSection 为 undefined", () => {
    const snap = buildBegreatReportSnapshot(BASE_INPUT);
    assert.strictEqual(snap.careerSection, undefined);
  });

  it("传入 topCareers 后 careerSection 不为 undefined", () => {
    const snap = buildBegreatReportSnapshot({ ...BASE_INPUT, topCareers: MOCK_CAREERS });
    assert.ok(snap.careerSection, "careerSection 应存在");
  });

  describe("careerSection（含职业数据）", () => {
    let snap: ReturnType<typeof buildBegreatReportSnapshot>;

    before(() => {
      snap = buildBegreatReportSnapshot({ ...BASE_INPUT, topCareers: MOCK_CAREERS });
    });

    it("sectionTitle 与模板一致", () => {
      const tpl = loadReportTemplate();
      assert.strictEqual(snap.careerSection!.sectionTitle, tpl.careers.section_title);
    });

    it("intro 是 25-34 岁女性的引导语", () => {
      const tpl = loadReportTemplate();
      assert.strictEqual(
        snap.careerSection!.intro,
        tpl.careers.intro_by_age_gender["25-34"].female
      );
    });

    it("careers 数量与输入一致", () => {
      assert.strictEqual(snap.careerSection!.careers.length, MOCK_CAREERS.length);
    });

    it("industryLabel 正确翻译", () => {
      const pm = snap.careerSection!.careers.find((c) => c.code === "PM")!;
      assert.strictEqual(pm.industryLabel, "科技与互联网");
    });

    it("levelLabel / levelYears 正确填充", () => {
      const pm = snap.careerSection!.careers.find((c) => c.code === "PM")!;
      assert.strictEqual(pm.levelLabel, "中级");
      assert.ok(pm.levelYears?.includes("3"), `levelYears 应含 3，got ${pm.levelYears}`);
    });

    it("salaryText 格式正确", () => {
      const pm = snap.careerSection!.careers.find((c) => c.code === "PM")!;
      assert.strictEqual(pm.salaryText, "18k–45k / 月");
    });

    it("ageContextText 取自 25-34 的 ageHints", () => {
      const pm = snap.careerSection!.careers.find((c) => c.code === "PM")!;
      assert.strictEqual(pm.ageContextText, "3–5年可晋升高级PM，薪资跳跃空间大。");
    });

    it("matchReason 是非空字符串（Big5 驱动）", () => {
      const pm = snap.careerSection!.careers.find((c) => c.code === "PM")!;
      assert.ok(typeof pm.matchReason === "string" && pm.matchReason.length > 0);
    });

    it("aiImpact 存在且字段完整（中等风险：PM aiRisk=0.38）", () => {
      const pm = snap.careerSection!.careers.find((c) => c.code === "PM")!;
      const ai = pm.aiImpact!;
      assert.ok(ai, "aiImpact 不应为 undefined");
      assert.strictEqual(ai.risk, 0.38);
      assert.ok(ai.riskLabel.length > 0,      "riskLabel 不应为空");
      assert.ok(ai.badge.length > 0,          "badge 不应为空");
      assert.ok(ai.summary.length > 0,        "summary 不应为空");
      assert.ok(ai.generalAdvice.length > 0,  "generalAdvice 不应为空");
      assert.ok(ai.industryAdvice.length > 0, "industryAdvice 不应为空");
    });

    it("aiImpact 中等风险 badge 为「需主动适应」", () => {
      const pm = snap.careerSection!.careers.find((c) => c.code === "PM")!;
      assert.strictEqual(pm.aiImpact!.badge, "需主动适应");
    });

    it("aiImpact 高风险职业（DS aiRisk=0.65）badge 为「转型窗口期」", () => {
      const ds = snap.careerSection!.careers.find((c) => c.code === "DS")!;
      assert.strictEqual(ds.aiImpact!.badge, "转型窗口期");
    });

    it("industryAdvice 是行业专属内容（科技 × 中等风险）", () => {
      const tpl = loadReportTemplate();
      const pm  = snap.careerSection!.careers.find((c) => c.code === "PM")!;
      const expected = tpl.careers.ai_impact.by_industry["科技"]!.medium;
      assert.strictEqual(pm.aiImpact!.industryAdvice, expected);
    });

    it("高风险职业 industryAdvice 是科技行业高风险建议", () => {
      const tpl = loadReportTemplate();
      const ds  = snap.careerSection!.careers.find((c) => c.code === "DS")!;
      const expected = tpl.careers.ai_impact.by_industry["科技"]!.high;
      assert.strictEqual(ds.aiImpact!.industryAdvice, expected);
    });
  });

  it("男性用户 intro 使用男性引导语", () => {
    const snap = buildBegreatReportSnapshot({
      ...BASE_INPUT,
      gender: "male",
      age: 38,
      topCareers: MOCK_CAREERS,
    });
    const tpl = loadReportTemplate();
    assert.strictEqual(
      snap.careerSection!.intro,
      tpl.careers.intro_by_age_gender["35-44"].male
    );
  });

  it("18-24 岁用户拿到对应引导语", () => {
    const snap = buildBegreatReportSnapshot({
      ...BASE_INPUT,
      age: 20,
      topCareers: MOCK_CAREERS,
    });
    const tpl = loadReportTemplate();
    assert.strictEqual(
      snap.careerSection!.intro,
      tpl.careers.intro_by_age_gender["18-24"].female
    );
  });

});
