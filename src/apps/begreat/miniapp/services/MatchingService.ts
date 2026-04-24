import type { ICareerMatch, IExcludedCareer, ISoftAdjustedCareer } from "../../entity/session.entity";
import type { IOccupationNorm, OccupationAgeGroup, IExcludeRule } from "../../entity/occupation.entity";

interface MatchInput {
  big5Norm: Record<string, number>; // O, C, E, A, N
  age: number;
}

interface ScoreBreakdown {
  openness: number;
  conscientiousness: number;
  emotionalStability: number;
  extraversion?: number;
  agreeableness?: number;
}

interface RuleHit {
  id: string;
  reason: string;
  penalty?: number;
}

interface MatchDiagnostics {
  topCareers: ICareerMatch[];
  hardExcluded: IExcludedCareer[];
  softAdjusted: ISoftAdjustedCareer[];
}

/**
 * 根据年龄返回对应的年龄组
 */
function getAgeGroup(age: number): OccupationAgeGroup {
  if (age >= 45) return "45+";
  if (age >= 31) return "31-35";
  if (age >= 25) return "25-30";
  if (age >= 22) return "22-24";
  return "18-21";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function readMetric(rule: IExcludeRule, input: MatchInput): number {
  if (rule.metric === "age") return input.age;
  if (rule.metric === "N_stability") return -(input.big5Norm["N"] ?? 0);
  return input.big5Norm[rule.metric] ?? 0;
}

function isRuleMatched(rule: IExcludeRule, input: MatchInput): boolean {
  const current = readMetric(rule, input);
  const value = rule.value;
  switch (rule.op) {
    case "<":  return typeof value === "number" && current < value;
    case "<=": return typeof value === "number" && current <= value;
    case ">":  return typeof value === "number" && current > value;
    case ">=": return typeof value === "number" && current >= value;
    case "==": return typeof value === "number" && current === value;
    case "in": {
      if (Array.isArray(value) && value.length === 2) {
        return current >= value[0] && current <= value[1];
      }
      if (Array.isArray(value)) {
        return value.includes(current);
      }
      return false;
    }
    case "not_in": {
      if (Array.isArray(value) && value.length === 2) {
        return current < value[0] || current > value[1];
      }
      if (Array.isArray(value)) {
        return !value.includes(current);
      }
      return false;
    }
    default:
      return false;
  }
}

function evaluateExcludeRules(input: MatchInput, job: IOccupationNorm): {
  hardBlocked: boolean;
  hardHits: RuleHit[];
  softHits: RuleHit[];
  softPenaltyMultiplier: number;
  advice?: string;
} {
  const hardHits = (job.excludeRules?.hard ?? [])
    .filter((r) => isRuleMatched(r, input))
    .map((r) => ({ id: r.id, reason: r.reason }));

  const softHits = (job.excludeRules?.soft ?? [])
    .filter((r) => isRuleMatched(r, input))
    .map((r) => ({ id: r.id, reason: r.reason, penalty: r.penalty }));

  const softPenalty = softHits.reduce((acc, hit) => acc * (1 - Math.max(0, Math.min(0.9, hit.penalty ?? 0.1))), 1);

  return {
    hardBlocked: hardHits.length > 0,
    hardHits,
    softHits,
    softPenaltyMultiplier: parseFloat(softPenalty.toFixed(3)),
    advice: job.excludeRules?.advice,
  };
}

function ageMultiplierForJob(age: number, job: IOccupationNorm): number {
  if (age >= job.ageRange.min && age <= job.ageRange.max) {
    const ageGroup = getAgeGroup(age);
    return job.ageBonusMultiplier[ageGroup] ?? 1.0;
  }

  // 优化：计算年龄偏离度，偏离越远惩罚越重
  const deviation = age < job.ageRange.min
    ? job.ageRange.min - age
    : age - job.ageRange.max;

  if (deviation <= 2) return 0.95;   // 轻微偏离
  if (deviation <= 5) return 0.85;   // 中等偏离
  if (deviation <= 10) return 0.70;  // 严重偏离
  return 0.50;                       // 极度偏离
}

function scoreCareer(
  input: MatchInput,
  job: IOccupationNorm,
  softPenaltyMultiplier = 1
): {
  finalScore: number;
  breakdown: ScoreBreakdown;
  ageMultiplier: number;
} {
  // 核心维度
  const openness = input.big5Norm["O"] ?? 0;
  const conscientiousness = input.big5Norm["C"] ?? 0;
  const emotionalStability = -(input.big5Norm["N"] ?? 0);

  // 可选维度
  const extraversion = input.big5Norm["E"] ?? 0;
  const agreeableness = input.big5Norm["A"] ?? 0;

  // 计算差异 - 使用方向性匹配
  // 对于"越高越好"的维度（O, C, N），超出上限时减少惩罚
  let oDiff = openness - job.requiredBig5.openness;
  let cDiff = conscientiousness - job.requiredBig5.conscientiousness;
  let nDiff = emotionalStability - job.requiredBig5.emotionalStability;

  // 🔧 修复: 如果用户特质高于职业要求，只按一半差距计算
  // 理由: 开放性、尽责性、情绪稳定性都是"越高越好"，超出不应该严重扣分
  if (oDiff > 0) oDiff *= 0.5;  // 用户更有创造力，减少惩罚
  if (cDiff > 0) cDiff *= 0.5;  // 用户更严谨，减少惩罚
  if (nDiff > 0) nDiff *= 0.5;  // 用户更稳定，减少惩罚

  // 优化1: 动态调整情绪稳定性权重 - 高压职业(要求≥0.3)提高权重
  const isHighStressJob = job.requiredBig5.emotionalStability >= 0.3;
  const stabilityWeight = isHighStressJob ? 1.3 : 0.95;

  // 基础加权距离（O, C, N）
  let weightedSquares =
    oDiff * oDiff * (1.2 + job.salaryIndex * 0.8) +
    cDiff * cDiff * 1.05 +
    nDiff * nDiff * stabilityWeight;

  const breakdown: ScoreBreakdown = {
    openness: -Math.abs(oDiff) * 12 * (0.7 + job.salaryIndex * 0.6),
    conscientiousness: -Math.abs(cDiff) * 9,
    emotionalStability: -Math.abs(nDiff) * (isHighStressJob ? 12 : 8),
  };

  // 优化2: 启用外向性维度（如果职业要求）
  if (job.requiredBig5.extraversion !== undefined) {
    const eDiff = extraversion - job.requiredBig5.extraversion;
    weightedSquares += eDiff * eDiff * 1.0;
    breakdown.extraversion = -Math.abs(eDiff) * 10;
  }

  // 优化3: 启用宜人性维度（如果职业要求）
  if (job.requiredBig5.agreeableness !== undefined) {
    const aDiff = agreeableness - job.requiredBig5.agreeableness;
    weightedSquares += aDiff * aDiff * 1.0;
    breakdown.agreeableness = -Math.abs(aDiff) * 10;
  }

  const distance = Math.sqrt(weightedSquares);

  // logistic 映射：中段更敏感，头尾拉开
  const steepness = 1.2;
  const center = 1.35;
  const baseScore = 100 / (1 + Math.exp(steepness * (distance - center)));

  // 优化4: 改进的年龄调整机制
  const ageMultiplier = ageMultiplierForJob(input.age, job);
  const withAge = baseScore * ageMultiplier * softPenaltyMultiplier;
  const finalScore = clampScore(withAge);

  return { finalScore, breakdown, ageMultiplier };
}

/**
 * Big Five 胜任力职业匹配算法（2026 优化版）
 * 改进：
 * 1. 高压职业提高情绪稳定性权重
 * 2. 启用外向性/宜人性维度（部分职业）
 * 3. 改进年龄惩罚机制
 * 4. 添加硬性门槛过滤
 */
export function matchCareersWithDiagnostics(
  { big5Norm, age }: MatchInput,
  occupations: IOccupationNorm[],
  limit = 10
): MatchDiagnostics {
  const emotionalStability = -(big5Norm["N"] ?? 0);
  const extraversion = big5Norm["E"] ?? 0;
  const agreeableness = big5Norm["A"] ?? 0;
  const conscientiousness = big5Norm["C"] ?? 0;
  const input = { big5Norm, age };

  const activeJobs = occupations.filter((job) => job.isActive);
  const hardExcluded: IExcludedCareer[] = [];

  const jobsAfterExclude = activeJobs.filter((job) => {
    const ruleEval = evaluateExcludeRules(input, job);
    if (!ruleEval.hardBlocked) return true;
    hardExcluded.push({
      code: job.code,
      title: job.title,
      reasons: ruleEval.hardHits.map((h) => h.reason),
      ruleIds: ruleEval.hardHits.map((h) => h.id),
      advice: ruleEval.advice,
    });
    return false;
  });

  const results = jobsAfterExclude
    // 优化5: 硬性门槛过滤
    .filter((job) => {
      if (!job.minimumRequirements) return true;
      const req = job.minimumRequirements;

      if (req.emotionalStability !== undefined && emotionalStability < req.emotionalStability) {
        return false;
      }
      if (req.conscientiousness !== undefined && conscientiousness < req.conscientiousness) {
        return false;
      }
      if (req.extraversion !== undefined && extraversion < req.extraversion) {
        return false;
      }
      if (req.agreeableness !== undefined && agreeableness < req.agreeableness) {
        return false;
      }
      return true;
    })
    .map((job): ICareerMatch => {
      const ruleEval = evaluateExcludeRules(input, job);
      const { finalScore, breakdown, ageMultiplier } = scoreCareer(
        input,
        job,
        ruleEval.softPenaltyMultiplier
      );

      return {
        code:           job.code,
        title:          job.title,
        matchScore:     parseFloat(finalScore.toFixed(1)),
        salaryIndex:    job.salaryIndex,
        description:    job.description,
        industry:       job.industry,
        level:          job.level,
        salary:         job.salary,
        skills:         job.skills,
        aiRisk:         job.aiRisk,
        aiImpactAdvice: job.aiImpactAdvice,
        ageHints:       job.ageHints,
        scoreBreakdown: {
          ...breakdown,
          ageMultiplier,
          softPenaltyMultiplier: ruleEval.softPenaltyMultiplier,
        },
        ruleAdjustments: {
          softHitIds: ruleEval.softHits.map((h) => h.id),
          softHitReasons: ruleEval.softHits.map((h) => h.reason),
          advice: ruleEval.advice,
        },
      };
    })
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (b.salaryIndex !== a.salaryIndex) return b.salaryIndex - a.salaryIndex;
      return a.code.localeCompare(b.code);
    })
    .slice(0, limit);

  const softAdjusted: ISoftAdjustedCareer[] = results
    .filter((c) => (c.ruleAdjustments?.softHitIds?.length ?? 0) > 0)
    .map((c) => ({
      code: c.code,
      title: c.title,
      matchScore: c.matchScore,
      softPenaltyMultiplier: c.scoreBreakdown?.softPenaltyMultiplier ?? 1,
      reasons: c.ruleAdjustments?.softHitReasons ?? [],
      ruleIds: c.ruleAdjustments?.softHitIds ?? [],
      advice: c.ruleAdjustments?.advice,
    }));

  return { topCareers: results, hardExcluded, softAdjusted };
}

export function matchCareers(
  input: MatchInput,
  occupations: IOccupationNorm[],
  limit = 10
): ICareerMatch[] {
  return matchCareersWithDiagnostics(input, occupations, limit).topCareers;
}
