import type { ICareerMatch } from "../../entity/session.entity";
import type { IOccupationNorm } from "../../entity/occupation.entity";
import { topDimensions } from "./CalculationEngine";

interface MatchInput {
  riasecNorm: Record<string, number>;
  big5Norm: Record<string, number>;
  age: number;
}

/**
 * 双轨制职业匹配算法（2026 版）
 * Track A: RIASEC 兴趣轨 → 决定推荐"广度"
 * Track B: Big Five 胜任轨 → 决定推荐"深度"与高薪加权
 */
export function matchCareers(
  { riasecNorm, big5Norm, age }: MatchInput,
  occupations: IOccupationNorm[],
  limit = 10
): ICareerMatch[] {
  const [top1, top2] = topDimensions(riasecNorm, 2);
  const openness          = big5Norm["O"] ?? 0;
  const conscientiousness = big5Norm["C"] ?? 0;
  // N 分越低 → 情绪越稳定 → emotionalStability = -N
  const emotionalStability = -(big5Norm["N"] ?? 0);

  const results = occupations
    .filter((job) => job.isActive)
    .map((job): ICareerMatch => {
      // ── Track A: RIASEC 基础分 ──────────────────────────────
      let score = 0;
      if (job.primaryRiasec === top1)  score += 60;
      else if (job.primaryRiasec === top2) score += 35;

      if (job.secondaryRiasec === top2) score += 20;
      else if (job.secondaryRiasec === top1) score += 10;

      // ── Track B: Big Five 胜任力加权 ────────────────────────
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
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return results;
}
