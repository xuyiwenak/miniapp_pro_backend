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

// ========== 年龄惩罚倍率 ==========
const AGE_PENALTY_SLIGHT   = 0.95; // 偏离 ≤2 岁
const AGE_PENALTY_MODERATE = 0.85; // 偏离 ≤5 岁
const AGE_PENALTY_SEVERE   = 0.70; // 偏离 ≤10 岁
const AGE_PENALTY_EXTREME  = 0.50; // 偏离 >10 岁

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
function getOccupationAgeGroup(age: number): OccupationAgeGroup {
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
  if (rule.metric === 'age') return input.age;
  if (rule.metric === 'N_stability') return -(input.big5Norm['N'] ?? 0);
  return input.big5Norm[rule.metric] ?? 0;
}

function isRuleMatched(rule: IExcludeRule, input: MatchInput): boolean {
  const current = readMetric(rule, input);
  const value = rule.value;
  switch (rule.op) {
    case '<':  return typeof value === 'number' && current < value;
    case '<=': return typeof value === 'number' && current <= value;
    case '>':  return typeof value === 'number' && current > value;
    case '>=': return typeof value === 'number' && current >= value;
    case '==': return typeof value === 'number' && current === value;
    case 'in': {
      if (Array.isArray(value) && value.length === 2) {
        return current >= value[0] && current <= value[1];
      }
      if (Array.isArray(value)) {
        return value.includes(current);
      }
      return false;
    }
    case 'not_in': {
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
    const ageGroup = getOccupationAgeGroup(age);
    return job.ageBonusMultiplier[ageGroup] ?? 1.0;
  }

  // 优化：计算年龄偏离度，偏离越远惩罚越重
  const deviation = age < job.ageRange.min
    ? job.ageRange.min - age
    : age - job.ageRange.max;

  if (deviation <= 2) return AGE_PENALTY_SLIGHT;
  if (deviation <= 5) return AGE_PENALTY_MODERATE;
  if (deviation <= 10) return AGE_PENALTY_SEVERE;
  return AGE_PENALTY_EXTREME;
}

/**
 * 计算三核心维度的方向性差值和加权距离平方
 */
function computeCoreDiffs(
  input: MatchInput,
  job: IOccupationNorm,
): { oDiff: number; cDiff: number; nDiff: number; weightedSquares: number; isHighStressJob: boolean } {
  const DIFF_CAP = 1.5;
  const openness = input.big5Norm['O'] ?? 0;
  const conscientiousness = input.big5Norm['C'] ?? 0;
  const emotionalStability = -(input.big5Norm['N'] ?? 0);
  const isHighStressJob = job.requiredBig5.emotionalStability >= 0.3;
  const stabilityWeight = isHighStressJob ? 1.3 : 0.95;

  let oDiff = openness - job.requiredBig5.openness;
  let cDiff = conscientiousness - job.requiredBig5.conscientiousness;
  let nDiff = emotionalStability - job.requiredBig5.emotionalStability;

  if (oDiff > 0) oDiff *= 0.5;
  if (cDiff > 0) cDiff *= 0.5;
  if (nDiff > 0) nDiff *= 0.5;

  oDiff = Math.max(-DIFF_CAP, Math.min(DIFF_CAP, oDiff));
  cDiff = Math.max(-DIFF_CAP, Math.min(DIFF_CAP, cDiff));
  nDiff = Math.max(-DIFF_CAP, Math.min(DIFF_CAP, nDiff));

  const weightedSquares =
    oDiff * oDiff * (1.2 + job.salaryIndex * 0.8) +
    cDiff * cDiff * 1.05 +
    nDiff * nDiff * stabilityWeight;

  return { oDiff, cDiff, nDiff, weightedSquares, isHighStressJob };
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
  const extraversion = input.big5Norm['E'] ?? 0;
  const agreeableness = input.big5Norm['A'] ?? 0;

  const { oDiff, cDiff, nDiff, isHighStressJob, weightedSquares: initialWS } = computeCoreDiffs(input, job);
  let weightedSquares = initialWS;

  const breakdown: ScoreBreakdown = {
    openness: -Math.abs(oDiff) * 12 * (0.7 + job.salaryIndex * 0.6),
    conscientiousness: -Math.abs(cDiff) * 9,
    emotionalStability: -Math.abs(nDiff) * (isHighStressJob ? 12 : 8),
  };

  if (job.requiredBig5.extraversion !== undefined) {
    const eDiff = extraversion - job.requiredBig5.extraversion;
    weightedSquares += eDiff * eDiff * 1.0;
    breakdown.extraversion = -Math.abs(eDiff) * 10;
  }

  if (job.requiredBig5.agreeableness !== undefined) {
    const aDiff = agreeableness - job.requiredBig5.agreeableness;
    weightedSquares += aDiff * aDiff * 1.0;
    breakdown.agreeableness = -Math.abs(aDiff) * 10;
  }

  const distance = Math.sqrt(weightedSquares);
  const steepness = 1.0;
  const center = 1.8;
  const baseScore = 100 / (1 + Math.exp(steepness * (distance - center)));

  const rawAgeMult = ageMultiplierForJob(input.age, job);
  const ageMultiplier = input.age >= job.ageRange.min && input.age <= job.ageRange.max
    ? rawAgeMult
    : Math.max(0.75, rawAgeMult);

  const safeSoftPenalty = Math.max(0.85, softPenaltyMultiplier);
  const finalScore = clampScore(baseScore * ageMultiplier * safeSoftPenalty);

  return { finalScore, breakdown, ageMultiplier };
}

interface MinReqInput {
  emotionalStability: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
}

/**
 * 检查职业最低特质要求，返回失败原因列表
 */
function checkMinimumRequirements(
  job: IOccupationNorm,
  traits: MinReqInput,
): { failedReasons: string[]; failedIds: string[] } {
  const failedReasons: string[] = [];
  const failedIds: string[] = [];
  const req = job.minimumRequirements;
  if (!req) return { failedReasons, failedIds };

  if (req.emotionalStability !== undefined && traits.emotionalStability < req.emotionalStability) {
    failedReasons.push(`情绪稳定性不足（该职业要求 ≥ ${req.emotionalStability.toFixed(2)}，当前 ${traits.emotionalStability.toFixed(2)}）`);
    failedIds.push('min_req_emotional_stability');
  }
  if (req.conscientiousness !== undefined && traits.conscientiousness < req.conscientiousness) {
    failedReasons.push(`尽责性不足（该职业要求 ≥ ${req.conscientiousness.toFixed(2)}，当前 ${traits.conscientiousness.toFixed(2)}）`);
    failedIds.push('min_req_conscientiousness');
  }
  if (req.extraversion !== undefined && traits.extraversion < req.extraversion) {
    failedReasons.push(`外向性不足（该职业要求 ≥ ${req.extraversion.toFixed(2)}，当前 ${traits.extraversion.toFixed(2)}）`);
    failedIds.push('min_req_extraversion');
  }
  if (req.agreeableness !== undefined && traits.agreeableness < req.agreeableness) {
    failedReasons.push(`宜人性不足（该职业要求 ≥ ${req.agreeableness.toFixed(2)}，当前 ${traits.agreeableness.toFixed(2)}）`);
    failedIds.push('min_req_agreeableness');
  }
  return { failedReasons, failedIds };
}

/**
 * 将单个职业评分并映射为 ICareerMatch
 */
function scoreAndMapCareer(input: MatchInput, job: IOccupationNorm): ICareerMatch {
  const ruleEval = evaluateExcludeRules(input, job);
  const { finalScore, breakdown, ageMultiplier } = scoreCareer(input, job, ruleEval.softPenaltyMultiplier);
  return {
    code: job.code, title: job.title, matchScore: parseFloat(finalScore.toFixed(1)),
    salaryIndex: job.salaryIndex, description: job.description, industry: job.industry,
    level: job.level, salary: job.salary, skills: job.skills, aiRisk: job.aiRisk,
    aiImpactAdvice: job.aiImpactAdvice, ageHints: job.ageHints,
    scoreBreakdown: { ...breakdown, ageMultiplier, softPenaltyMultiplier: ruleEval.softPenaltyMultiplier },
    ruleAdjustments: {
      softHitIds: ruleEval.softHits.map((h) => h.id),
      softHitReasons: ruleEval.softHits.map((h) => h.reason),
      advice: ruleEval.advice,
    },
  };
}

/**
 * Big Five 胜任力职业匹配算法（2026 优化版）
 * 改进：
 * 1. 高压职业提高情绪稳定性权重
 * 2. 启用外向性/宜人性维度（部分职业）
 * 3. 改进年龄惩罚机制
 * 4. 添加硬性门槛过滤
 */
function collectHardExclusions(
  activeJobs: IOccupationNorm[],
  input: MatchInput,
  traits: MinReqInput,
): { passed: IOccupationNorm[]; hardExcluded: IExcludedCareer[] } {
  const hardExcluded: IExcludedCareer[] = [];
  const afterRule = activeJobs.filter((job) => {
    const ruleEval = evaluateExcludeRules(input, job);
    if (!ruleEval.hardBlocked) return true;
    hardExcluded.push({
      code: job.code, title: job.title,
      reasons: ruleEval.hardHits.map((h) => h.reason),
      ruleIds: ruleEval.hardHits.map((h) => h.id),
      advice: ruleEval.advice,
    });
    return false;
  });
  const passed = afterRule.filter((job) => {
    const { failedReasons, failedIds } = checkMinimumRequirements(job, traits);
    if (failedReasons.length === 0) return true;
    hardExcluded.push({
      code: job.code, title: job.title, reasons: failedReasons, ruleIds: failedIds,
      advice: job.excludeRules?.advice ?? '建议先提升相关特质，再重新评估该职业的适合度。',
    });
    return false;
  });
  return { passed, hardExcluded };
}

export function matchCareersWithDiagnostics(
  { big5Norm, age }: MatchInput,
  occupations: IOccupationNorm[],
  limit = 10
): MatchDiagnostics {
  const traits: MinReqInput = {
    emotionalStability: -(big5Norm['N'] ?? 0),
    extraversion: big5Norm['E'] ?? 0,
    agreeableness: big5Norm['A'] ?? 0,
    conscientiousness: big5Norm['C'] ?? 0,
  };
  const input = { big5Norm, age };
  const { passed, hardExcluded } = collectHardExclusions(
    occupations.filter((job) => job.isActive), input, traits,
  );

  const results = passed
    .map((job) => scoreAndMapCareer(input, job))
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (b.salaryIndex !== a.salaryIndex) return b.salaryIndex - a.salaryIndex;
      return a.code.localeCompare(b.code);
    })
    .slice(0, limit);

  const softAdjusted: ISoftAdjustedCareer[] = results
    .filter((c) => (c.ruleAdjustments?.softHitIds?.length ?? 0) > 0)
    .map((c) => ({
      code: c.code, title: c.title, matchScore: c.matchScore,
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
