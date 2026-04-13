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
      // ── Big Five 胜任力加权 ──────────────────────────────────
      let score = 0;
      // 开放性：若 Z > 阈值，AI 时代高薪职位额外加分
      if (openness > job.requiredBig5.openness) {
        score += 15 * job.salaryIndex;
      }
      // 尽责性：执行力要求高的职位
      if (conscientiousness > job.requiredBig5.conscientiousness) {
        score += 8;
      }
      // 情绪稳定性：高压岗位必备
      if (emotionalStability > job.requiredBig5.emotionalStability) {
        score += 7;
      }

      // ── 年龄阶段乘数 ────────────────────────────────────────
      if (age >= job.ageRange.min && age <= job.ageRange.max) {
        score *= job.ageBonusMultiplier;
      } else {
        // 年龄不符，轻度扣分
        score *= 0.85;
      }

      return {
        code:        job.code,
        title:       job.title,
        matchScore:  parseFloat(score.toFixed(1)),
        salaryIndex: job.salaryIndex,
        description: job.description,
        industry:    job.industry,
        level:       job.level,
        salary:      job.salary,
        skills:      job.skills,
        aiRisk:      job.aiRisk,
        ageHints:    job.ageHints,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return results;
}
