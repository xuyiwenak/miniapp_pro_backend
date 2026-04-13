import assert from "assert";
import {
  getAgeGroup,
  topDimensions,
  buildPersonalityLabel,
} from "../../src/apps/begreat/miniapp/services/CalculationEngine";

describe("CalculationEngine", () => {

  // ── getAgeGroup ────────────────────────────────────────────────────────────

  describe("getAgeGroup", () => {
    const cases: [number, string][] = [
      [15, "18-24"],
      [18, "18-24"],
      [24, "18-24"],
      [25, "25-34"],
      [34, "25-34"],
      [35, "35-44"],
      [44, "35-44"],
      [45, "45+"],
      [60, "45+"],
      [80, "45+"],
    ];

    cases.forEach(([age, expected]) => {
      it(`age ${age} → "${expected}"`, () => {
        assert.strictEqual(getAgeGroup(age), expected);
      });
    });

    it("边界：年龄 24 属于 18-24，25 属于 25-34", () => {
      assert.strictEqual(getAgeGroup(24), "18-24");
      assert.strictEqual(getAgeGroup(25), "25-34");
    });

    it("边界：年龄 44 属于 35-44，45 属于 45+", () => {
      assert.strictEqual(getAgeGroup(44), "35-44");
      assert.strictEqual(getAgeGroup(45), "45+");
    });
  });

  // ── topDimensions ──────────────────────────────────────────────────────────

  describe("topDimensions", () => {
    it("返回降序排列的前 N 个维度代码", () => {
      const scores = { R: 0.1, I: 1.5, A: 0.8, S: 0.3, E: 1.2, C: -0.2 };
      const top2 = topDimensions(scores, 2);
      assert.deepStrictEqual(top2, ["I", "E"]);
    });

    it("N=1 只返回最高维度", () => {
      const scores = { O: 0.5, C: 1.8, E: -0.3, A: 0.9, N: 0.1 };
      assert.deepStrictEqual(topDimensions(scores, 1), ["C"]);
    });

    it("N 大于维度数时返回全部（降序）", () => {
      const scores = { R: 0.2, I: 0.8 };
      assert.deepStrictEqual(topDimensions(scores, 10), ["I", "R"]);
    });

    it("全零分时不报错，返回任意顺序", () => {
      const scores = { R: 0, I: 0, A: 0 };
      const result = topDimensions(scores, 2);
      assert.strictEqual(result.length, 2);
    });

    it("负分维度排在后面", () => {
      const scores = { R: -1.0, I: 0.5, A: -0.5 };
      assert.strictEqual(topDimensions(scores, 1)[0], "I");
    });
  });

  // ── buildPersonalityLabel ──────────────────────────────────────────────────

  describe("buildPersonalityLabel", () => {
    it("双码组合命中时返回对应标签", () => {
      const { label } = buildPersonalityLabel(["R", "I"]);
      assert.strictEqual(label, "工程创新家");
    });

    it("双码组合命中：AE → 艺术领导者", () => {
      const { label, summary } = buildPersonalityLabel(["A", "E"]);
      assert.strictEqual(label, "艺术领导者");
      assert.ok(summary.length > 0, "summary 不应为空");
    });

    it("双码未命中时回退到单码", () => {
      // RC 不在 map 里，应回退到 R 单码
      const { label } = buildPersonalityLabel(["R", "C"]);
      assert.strictEqual(label, "实践开拓者");
    });

    it("双码和单码均未命中时返回兜底标签", () => {
      const { label } = buildPersonalityLabel([]);
      assert.strictEqual(label, "全能型人才");
    });

    it("summary 是非空字符串", () => {
      const { summary } = buildPersonalityLabel(["S", "E"]);
      assert.ok(typeof summary === "string" && summary.trim().length > 0);
    });

    const knownPairs: [string[], string][] = [
      [["I", "A"], "科技美学家"],
      [["S", "E"], "人文运营家"],
      [["I", "C"], "精密研究者"],
      [["E", "C"], "战略执行者"],
    ];
    knownPairs.forEach(([codes, expectedLabel]) => {
      it(`[${codes.join(",")}] → "${expectedLabel}"`, () => {
        assert.strictEqual(buildPersonalityLabel(codes).label, expectedLabel);
      });
    });
  });

});
