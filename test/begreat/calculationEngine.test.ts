import assert from 'assert';
import {
  getAgeGroup,
  buildPersonalityLabel,
} from '../../src/apps/begreat/miniapp/services/CalculationEngine';

describe('CalculationEngine', () => {

  // ── getAgeGroup ────────────────────────────────────────────────────────────

  describe('getAgeGroup', () => {
    const cases: [number, string][] = [
      [15, '18-24'],
      [18, '18-24'],
      [24, '18-24'],
      [25, '25-34'],
      [34, '25-34'],
      [35, '35-44'],
      [44, '35-44'],
      [45, '45+'],
      [60, '45+'],
      [80, '45+'],
    ];

    cases.forEach(([age, expected]) => {
      it(`age ${age} → "${expected}"`, () => {
        assert.strictEqual(getAgeGroup(age), expected);
      });
    });

    it('边界：年龄 24 属于 18-24，25 属于 25-34', () => {
      assert.strictEqual(getAgeGroup(24), '18-24');
      assert.strictEqual(getAgeGroup(25), '25-34');
    });

    it('边界：年龄 44 属于 35-44，45 属于 45+', () => {
      assert.strictEqual(getAgeGroup(44), '35-44');
      assert.strictEqual(getAgeGroup(45), '45+');
    });
  });

  // ── buildPersonalityLabel ──────────────────────────────────────────────────

  describe('buildPersonalityLabel', () => {
    it('O 最高时返回"开放探索者"', () => {
      const { label } = buildPersonalityLabel({ O: 1.5, C: 0.5, E: 0.3, A: 0.1, N: -0.2 });
      assert.strictEqual(label, '开放探索者');
    });

    it('C 最高时返回"系统执行者"', () => {
      const { label } = buildPersonalityLabel({ O: 0.3, C: 1.8, E: 0.1, A: 0.5, N: -0.5 });
      assert.strictEqual(label, '系统执行者');
    });

    it('E 最高时返回"社交驱动者"', () => {
      const { label } = buildPersonalityLabel({ O: 0.2, C: 0.3, E: 1.6, A: 0.4, N: -0.1 });
      assert.strictEqual(label, '社交驱动者');
    });

    it('A 最高时返回"温暖协作者"', () => {
      const { label } = buildPersonalityLabel({ O: 0.1, C: 0.2, E: 0.3, A: 1.9, N: 0.1 });
      assert.strictEqual(label, '温暖协作者');
    });

    it('N_stable 最高（低神经质=高稳定性）时返回"稳健应对者"', () => {
      // N=-2.0 → N_stable=+2.0，应成为最高维度
      const { label } = buildPersonalityLabel({ O: 0.3, C: 0.4, E: 0.2, A: -0.1, N: -2.0 });
      assert.strictEqual(label, '稳健应对者');
    });

    it('所有维度为 0 时按序返回第一个维度标签', () => {
      const { label } = buildPersonalityLabel({ O: 0, C: 0, E: 0, A: 0, N: 0 });
      assert.strictEqual(label, '开放探索者');
    });

    it('summary 是非空字符串', () => {
      const { summary } = buildPersonalityLabel({ O: 1.2, C: 0.3, E: -0.5, A: 0.8, N: -1.0 });
      assert.ok(typeof summary === 'string' && summary.trim().length > 0);
    });
  });

});
