import type { ICareerMatch } from "../../entity/session.entity";
import type { IOccupationNorm } from "../../entity/occupation.entity";

interface MatchInput {
  big5Norm: Record<string, number>;
  age: number;
}

/**
 * Big Five 胜任力职业匹配算法（2026 版）
 * 按开放性、尽责性、情绪稳定性加权打分，结合年龄阶段乘数排序
 */
export function matchCareers(
  { big5Norm, age }: MatchInput,
  occupations: IOccupationNorm[],
  limit = 10
): ICareerMatch[] {
  const openness          = big5Norm["O"] ?? 0;
  const conscientiousness = big5Norm["C"] ?? 0;
  // N 分越低 → 情绪越稳定 → emotionalStability = -N
  const emotionalStability = -(big5Norm["N"] ?? 0);

  const results = occupations
    .filter((job) => job.isActive)
    .map((job): ICareerMatch => {
      // ── Big Five 胜任力连续打分（基础分 50，按偏差加减） ────
      // 差值 = 用户Z分 - 职业阈值，正值表示超额匹配，负值表示欠缺
      const oDiff = openness          - job.requiredBig5.openness;
      const cDiff = conscientiousness - job.requiredBig5.conscientiousness;
      const nDiff = emotionalStability - job.requiredBig5.emotionalStability;

      let score = 50
        + oDiff * 12 * job.salaryIndex   // 开放性权重：与薪资指数联动
        + cDiff * 8                       // 尽责性权重
        + nDiff * 6;                      // 情绪稳定性权重

      // ── 年龄阶段乘数 ────────────────────────────────────────
      if (age >= job.ageRange.min && age <= job.ageRange.max) {
        score *= job.ageBonusMultiplier;
      } else {
        // 年龄不符，轻度扣分
        score *= 0.85;
      }

      // 限制到 0–100 范围
      score = Math.max(0, Math.min(100, score));

      return {
        code:           job.code,
        title:          job.title,
        matchScore:     parseFloat(score.toFixed(1)),
        salaryIndex:    job.salaryIndex,
        description:    job.description,
        industry:       job.industry,
        level:          job.level,
        salary:         job.salary,
        skills:         job.skills,
        aiRisk:         job.aiRisk,
        aiImpactAdvice: job.aiImpactAdvice,
        ageHints:       job.ageHints,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return results;
}
