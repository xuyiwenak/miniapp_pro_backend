import * as fs from 'fs';
import * as path from 'path';
import type { Gender, ICareerMatch } from '../../entity/session.entity';
import type { IBig5ReportDimension, IReportSnapshot, IAnnotatedCareerMatch, ICareerSection, ICareerAiImpact } from '../../entity/reportResult.entity';
import type { OccupationAgeGroup } from '../../entity/occupation.entity';
import { getAgeGroup } from './CalculationEngine';
import type { AgeGroup } from '../../entity/norm.entity';

const BIG5_ORDER = ['O', 'C', 'E', 'A', 'N'] as const;
export type Big5Code = (typeof BIG5_ORDER)[number];

type LevelKey = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

export interface CareerAiRiskBand {
  max: number;
  label: string;
  desc: string;
}

export interface CareerAiImpactBand {
  max: number;
  label: string;
  badge: string;
  summary: string;
  general_advice: string;
}

export interface ReportTemplateJson {
  basic: {
    title: string;
    norm_desc: string;
    disclaimer: string;
  };
  norm_context: {
    t_score_line: string;
    fallback_note: string;
    age_groups: Record<
      AgeGroup,
      { label: string; stage: string; norm_comparison: string; reading_hint: string }
    >;
    genders: Record<Gender, { label: string; norm_comparison: string; reading_hint: string }>;
  };
  levels: Record<LevelKey, { name: string; range: string }>;
  dimensions: Record<
    Big5Code,
    {
      name: string;
      desc: string;
      texts: Record<LevelKey, string>;
      facets: Record<string, string>;
    }
  >;
  summary: {
    template: string;
    cover_line: string;
    advantage: string;
    improve: string;
    suggestion: string;
  };
  careers: {
    section_title: string;
    intro_by_age_gender: Record<AgeGroup, Record<Gender, string>>;
    age_career_context: Record<AgeGroup, string>;
    industries: Record<string, { label: string }>;
    levels: Record<'entry' | 'mid' | 'senior', { label: string; years: string }>;
    ai_risk: Record<'low' | 'medium' | 'high', CareerAiRiskBand>;
    ai_impact: {
      section_title: string;
      intro: string;
      risk_bands: Record<'low' | 'medium' | 'high', CareerAiImpactBand>;
      by_industry: Record<string, Record<'low' | 'medium' | 'high', string>>;
    };
    match_reasons: Record<string, string>;
  };
}

export type { IBig5ReportDimension, IReportSnapshot };

let cachedTemplate: ReportTemplateJson | null = null;

function templatePath(): string {
  return path.resolve(__dirname, '../../../../../tpl/report_template.json');
}

export function loadReportTemplate(): ReportTemplateJson {
  if (cachedTemplate) return cachedTemplate;
  const raw = fs.readFileSync(templatePath(), 'utf8');
  cachedTemplate = JSON.parse(raw) as ReportTemplateJson;
  return cachedTemplate;
}

/** Z 分转 T 分（M=50, SD=10） */
export function zToT(z: number): number {
  return Math.round((50 + 10 * z) * 10) / 10;
}

function tToLevelKey(t: number): LevelKey {
  if (t <= 35) return 'very_low';
  if (t <= 45) return 'low';
  if (t <= 55) return 'medium';
  if (t <= 65) return 'high';
  return 'very_high';
}

function replacePlaceholders(tpl: string, vars: Record<string, string>): string {
  let s = tpl;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(v);
  }
  return s;
}

function careerHint(big5T: Record<string, number>): string {
  const o = big5T['O'] ?? 50;
  const c = big5T['C'] ?? 50;
  const e = big5T['E'] ?? 50;
  if (o >= 55) return '偏创意探索与跨界创新';
  if (c >= 55) return '偏精确执行与系统构建';
  if (e >= 55) return '偏沟通协作与影响力拓展';
  return '结合自身优势灵活探索方向';
}

function relationshipHint(big5T: Record<string, number>): string {
  const a = big5T['A'] ?? 50;
  const e = big5T['E'] ?? 50;
  if (a >= 55 && e >= 55) return '协作与表达并重，适合团队共创';
  if (a >= 55) return '重视和谐与共情，适合深度一对一关系';
  if (e >= 55) return '乐于社交与联结，可主动拓展人脉';
  return '可适度练习表达与倾听的平衡';
}

function growthHint(big5T: Record<string, number>): string {
  const o = big5T['O'] ?? 50;
  const c = big5T['C'] ?? 50;
  if (o >= 55 && c >= 55) return '结构化学习新知识、持续迭代习惯';
  if (o >= 55) return '保持好奇心，尝试跨领域输入';
  if (c >= 55) return '用计划与复盘巩固自我提升';
  return '小步试错、建立可持续的改进节奏';
}

function getOccupationAgeGroup(age: number): OccupationAgeGroup {
  if (age >= 45) return '45+';
  if (age >= 31) return '31-35';
  if (age >= 25) return '25-30';
  if (age >= 22) return '22-24';
  return '18-21';
}

// ── 职业区块构建 ──────────────────────────────────────────────────────────────

type AiBandKey = 'low' | 'medium' | 'high';

function resolveAiBandKey(aiRisk: number, bands: ReportTemplateJson['careers']['ai_impact']['risk_bands']): AiBandKey {
  if (aiRisk <= bands.low.max) return 'low';
  if (aiRisk <= bands.medium.max) return 'medium';
  return 'high';
}

function buildAiImpact(
  aiRisk: number | undefined,
  industryPrimary: string | undefined,
  occupationAdvice: string | undefined,
  impactTpl: ReportTemplateJson['careers']['ai_impact']
): ICareerAiImpact | undefined {
  if (aiRisk === undefined) return undefined;
  const bandKey = resolveAiBandKey(aiRisk, impactTpl.risk_bands);
  const band = impactTpl.risk_bands[bandKey];
  // 优先级：职业专属 > 行业×风险带 > 风险带通用
  const industryAdvice = occupationAdvice
    ?? (industryPrimary ? impactTpl.by_industry[industryPrimary]?.[bandKey] : undefined)
    ?? band.general_advice;
  return {
    risk:           aiRisk,
    riskLabel:      band.label,
    badge:          band.badge,
    summary:        band.summary,
    generalAdvice:  band.general_advice,
    industryAdvice,
  };
}

function shortenText(text: string | undefined, maxLen = 120): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen)}...`;
}

/** 针对单个职业生成差异化匹配原因：优先挑用户 Z 分与职业需求重叠最高的维度 */
function buildMatchReasonForCareer(
  big5Z: Record<string, number>,
  career: ICareerMatch,
  reasonTpl: Record<string, string>
): string {
  if (career.scoreBreakdown) {
    const dimLabels: Array<{ label: string; value: number }> = [
      { label: '开放性', value: career.scoreBreakdown.openness },
      { label: '尽责性', value: career.scoreBreakdown.conscientiousness },
      { label: '情绪稳定性', value: career.scoreBreakdown.emotionalStability },
    ]
      .sort((a, b) => b.value - a.value)
      .slice(0, 2);

    const dimPart = dimLabels
      .map((d) => `${d.label}贴合度${d.value >= 0 ? '较高' : '较弱'}`)
      .join('，');
    const agePart = career.scoreBreakdown.ageMultiplier >= 1
      ? '年龄阶段对该职业有加成'
      : '年龄阶段对该职业有一定折减';

    return `${dimPart}，${agePart}`;
  }

  // 计算用户各维度对该职业需求的"超额贡献"，取最显著的两个
  const dims: Array<{ key: string; score: number }> = [
    { key: 'high_O', score: big5Z['O'] ?? 0 },
    { key: 'high_C', score: big5Z['C'] ?? 0 },
    { key: 'high_E', score: big5Z['E'] ?? 0 },
    { key: 'high_A', score: big5Z['A'] ?? 0 },
    { key: 'stable_N', score: -(big5Z['N'] ?? 0) },
  ];

  // 只取有效超过阈值的维度，按分值降序排，取该职业最相关的前两条
  const thresholds: Record<string, number> = {
    high_O: 0.3, high_C: 0.3, high_E: 0.3, high_A: 0.3, stable_N: 0.3,
  };
  const hits = dims
    .filter((d) => d.score > thresholds[d.key])
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((d) => reasonTpl[d.key] ?? '')
    .filter(Boolean);

  return hits.length > 0 ? hits.join('，') : '你的综合人格特质与该职业方向高度契合';
}

function annotateCareer(
  c: ICareerMatch,
  big5Z: Record<string, number>,
  occupationAgeGroup: OccupationAgeGroup,
  ct: ReportTemplateJson['careers'],
): IAnnotatedCareerMatch {
  const industryLabel = c.industry?.primary
    ? (ct.industries[c.industry.primary]?.label ?? c.industry.primary)
    : undefined;
  const levelInfo = c.level ? ct.levels[c.level] : undefined;
  const salaryText = c.salary !== undefined
    ? `${c.salary.min}k–${c.salary.max}k / ${c.salary.unit === 'month' ? '月' : '年'}`
    : undefined;
  return {
    ...c,
    industryLabel,
    levelLabel: levelInfo?.label,
    levelYears: levelInfo?.years,
    salaryText,
    ageContextText: shortenText(c.ageHints?.[occupationAgeGroup], 120),
    matchReason: buildMatchReasonForCareer(big5Z, c, ct.match_reasons),
    aiImpact: buildAiImpact(c.aiRisk, c.industry?.primary, c.aiImpactAdvice, ct.ai_impact),
  };
}

function buildCareerSection(
  careers: ICareerMatch[],
  ageGroup: AgeGroup,
  age: number,
  gender: Gender,
  big5Z: Record<string, number>,
  tpl: ReportTemplateJson,
): ICareerSection {
  const ct = tpl.careers;
  const occupationAgeGroup = getOccupationAgeGroup(age);
  return {
    sectionTitle: ct.section_title,
    intro: ct.intro_by_age_gender[ageGroup]?.[gender] ?? '',
    ageCareerContext: ct.age_career_context[ageGroup] ?? '',
    careers: careers.map((c) => annotateCareer(c, big5Z, occupationAgeGroup, ct)),
  };
}

// ── 报告快照主函数 ─────────────────────────────────────────────────────────────

type AgeInfo = { label: string; stage: string; norm_comparison: string; reading_hint: string };
type GenderInfo = { label: string; norm_comparison: string; reading_hint: string };

function buildBig5Dimensions(
  big5Z: Record<string, number>,
  tpl: ReportTemplateJson,
): { big5Dimensions: IBig5ReportDimension[]; big5T: Record<string, number> } {
  const big5Dimensions: IBig5ReportDimension[] = [];
  const big5T: Record<string, number> = {};
  for (const code of BIG5_ORDER) {
    const z = big5Z[code] ?? 0;
    const t = zToT(z);
    big5T[code] = t;
    const levelKey = tToLevelKey(t);
    const dimTpl = tpl.dimensions[code];
    const levelTpl = tpl.levels[levelKey];
    big5Dimensions.push({
      code, name: dimTpl.name, desc: dimTpl.desc,
      zScore: z, tScore: t, levelKey,
      levelName: levelTpl.name, levelRange: levelTpl.range,
      interpretation: dimTpl.texts[levelKey],
    });
  }
  return { big5Dimensions, big5T };
}

function buildSummaryLines(
  sortedByT: IBig5ReportDimension[],
  big5T: Record<string, number>,
  personalitySummary: string,
  tpl: ReportTemplateJson,
  ageInfo: AgeInfo,
  genderInfo: GenderInfo,
): { summaryLine: string; coverLine: string; advantageLine: string; improveLine: string; suggestionLine: string } {
  const [highDim, , midDim, , lowDim] = sortedByT;
  if (!highDim || !midDim || !lowDim) throw new Error('big5Dimensions must have exactly 5 entries');
  const advNames = sortedByT.slice(0, 2).map((d) => d.name).join('、');
  const impNames = sortedByT.slice(3, 5).map((d) => d.name).join('、');
  const summaryLine = replacePlaceholders(tpl.summary.template, {
    high_dim1: highDim.name, mid_dim1: midDim.name, low_dim1: lowDim.name, summary_text: personalitySummary,
  });
  const coverLine = replacePlaceholders(tpl.summary.cover_line, {
    gender_label: genderInfo.label, age_label: ageInfo.label, life_stage: ageInfo.stage,
    age_norm_line: ageInfo.norm_comparison, gender_norm_line: genderInfo.norm_comparison,
  });
  const advantageLine = replacePlaceholders(tpl.summary.advantage, { adv_text: `相对突出的维度包括 ${advNames}。` });
  const improveLine = replacePlaceholders(tpl.summary.improve, {
    imp_text: `可留意 ${impNames} 的平衡发展，结合日常情境逐步调整。`,
  });
  const suggestionLine = replacePlaceholders(tpl.summary.suggestion, {
    career: careerHint(big5T), relationship: relationshipHint(big5T), growth: growthHint(big5T),
  });
  return { summaryLine, coverLine, advantageLine, improveLine, suggestionLine };
}

/**
 * 根据 BFI-2 模板与会话信息生成报告快照（写入 session.result.report）
 */
export function buildBegreatReportSnapshot(input: {
  gender: Gender;
  age: number;
  big5Z: Record<string, number>;
  personalitySummary: string;
  topCareers?: ICareerMatch[];
}): IReportSnapshot {
  const tpl = loadReportTemplate();
  const ageGroup = getAgeGroup(input.age);
  const ageInfo = tpl.norm_context.age_groups[ageGroup];
  const genderInfo = tpl.norm_context.genders[input.gender];

  const { big5Dimensions, big5T } = buildBig5Dimensions(input.big5Z, tpl);
  const sortedByT = [...big5Dimensions].sort((a, b) => b.tScore - a.tScore);
  const lines = buildSummaryLines(sortedByT, big5T, input.personalitySummary, tpl, ageInfo, genderInfo);
  const careerSection = input.topCareers?.length
    ? buildCareerSection(input.topCareers, ageGroup, input.age, input.gender, input.big5Z, tpl)
    : undefined;

  return {
    title: tpl.basic.title,
    normDesc: tpl.basic.norm_desc,
    disclaimer: tpl.basic.disclaimer,
    coverLine: lines.coverLine,
    normContext: {
      tScoreLine: tpl.norm_context.t_score_line,
      fallbackNote: tpl.norm_context.fallback_note,
      ageReadingHint: ageInfo.reading_hint,
      genderReadingHint: genderInfo.reading_hint,
    },
    big5Dimensions,
    summaryLine: lines.summaryLine,
    advantageLine: lines.advantageLine,
    improveLine: lines.improveLine,
    suggestionLine: lines.suggestionLine,
    careerSection,
  };
}
