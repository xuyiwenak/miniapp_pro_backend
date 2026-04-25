import type { ICareerMatch, IExcludedCareer, ISoftAdjustedCareer } from '../../entity/session.entity';
import type { IOccupationNorm, OccupationAgeGroup, IExcludeRule } from '../../entity/occupation.entity';

// ========== 年龄分组常量 ==========
const AGE_GROUP_45_PLUS = 45;
const AGE_GROUP_31_35 = 31;
const AGE_GROUP_25_30 = 25;
const AGE_GROUP_22_24 = 22;

// ========== 分数常量 ==========
const SCORE_MIN = 0;
const SCORE_MAX = 100;

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
  if (age >= AGE_GROUP_45_PLUS) return '45+';
  if (age >= AGE_GROUP_31_35) return '31-35';
  if (age >= AGE_GROUP_25_30) return '25-30';
  if (age >= AGE_GROUP_22_24) return '22-24';
  return '18-21';
}

function clampScore(score: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, score));
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

  // 如果用户特质高于职业要求，只按一半差距计算（越高越好的维度，超出不扣分）
  if (oDiff > 0) oDiff *= 0.5;
  if (cDiff > 0) cDiff *= 0.5;
  if (nDiff > 0) nDiff *= 0.5;

  // 单维度差值限幅：防止单个极端维度（如极高N）压垮整体得分
  // Z 分超过 ±1.5 后差距已足够表达"明显不适合"，继续放大无实际意义
  const DIFF_CAP = 1.5;
  oDiff = Math.max(-DIFF_CAP, Math.min(DIFF_CAP, oDiff));
  cDiff = Math.max(-DIFF_CAP, Math.min(DIFF_CAP, cDiff));
  nDiff = Math.max(-DIFF_CAP, Math.min(DIFF_CAP, nDiff));

  // 动态调整情绪稳定性权重 - 高压职业(要求≥0.3)提高权重
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
  // center 从 1.35 放宽到 1.8，steepness 从 1.2 降低到 1.0，避免分数过度向低端压缩
  const steepness = 1.0;
  const center = 1.8;
  const baseScore = 100 / (1 + Math.exp(steepness * (distance - center)));

  // 年龄调整：对范围内使用乘法加成；范围外最低不低于 0.75，防止极端年龄把低 base 压到接近 0
  const rawAgeMult = ageMultiplierForJob(input.age, job);
  const ageMultiplier = input.age >= job.ageRange.min && input.age <= job.ageRange.max
    ? rawAgeMult
    : Math.max(0.75, rawAgeMult);

  // 软规则惩罚最低不低于 0.85，防止多条规则叠乘把已偏低的分数进一步压垮
  const safeSoftPenalty = Math.max(0.85, softPenaltyMultiplier);

  const withAge = baseScore * ageMultiplier * safeSoftPenalty;
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
    // 硬性门槛过滤：不满足最低要求的职业纳入 hardExcluded，附带中文原因说明
    .filter((job) => {
      if (!job.minimumRequirements) return true;
      const req = job.minimumRequirements;
      const failedReasons: string[] = [];
      const failedIds: string[] = [];

      if (req.emotionalStability !== undefined && emotionalStability < req.emotionalStability) {
        failedReasons.push(`情绪稳定性不足（该职业要求 ≥ ${req.emotionalStability.toFixed(2)}，当前 ${emotionalStability.toFixed(2)}）`);
        failedIds.push("min_req_emotional_stability");
      }
      if (req.conscientiousness !== undefined && conscientiousness < req.conscientiousness) {
        failedReasons.push(`尽责性不足（该职业要求 ≥ ${req.conscientiousness.toFixed(2)}，当前 ${conscientiousness.toFixed(2)}）`);
        failedIds.push("min_req_conscientiousness");
      }
      if (req.extraversion !== undefined && extraversion < req.extraversion) {
        failedReasons.push(`外向性不足（该职业要求 ≥ ${req.extraversion.toFixed(2)}，当前 ${extraversion.toFixed(2)}）`);
        failedIds.push("min_req_extraversion");
      }
      if (req.agreeableness !== undefined && agreeableness < req.agreeableness) {
        failedReasons.push(`宜人性不足（该职业要求 ≥ ${req.agreeableness.toFixed(2)}，当前 ${agreeableness.toFixed(2)}）`);
        failedIds.push("min_req_agreeableness");
      }

      if (failedReasons.length > 0) {
        hardExcluded.push({
          code: job.code,
          title: job.title,
          reasons: failedReasons,
          ruleIds: failedIds,
          advice: job.excludeRules?.advice ?? "建议先提升相关特质，再重新评估该职业的适合度。",
        });
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
