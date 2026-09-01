import type { IWork } from '../../../../entity/work.entity';
import type {
  ClassroomGender,
  IClassroomParticipation,
} from '../../entity/classroomParticipation.entity';
import {
  ARTWORK_AFFECT_DIMENSION_CONFIG,
  buildArtworkAffectAssociations,
  resolveArtworkAffect,
  type ArtworkAffectAssociation,
  type ArtworkAffectExclusionReason,
} from './artworkAffect';

const POSITIVE_PANAS_CODES = [
  'PANAS_ALERT',
  'PANAS_INSPIRED',
  'PANAS_DETERMINED',
  'PANAS_ATTENTIVE',
  'PANAS_ACTIVE',
] as const;
const NEGATIVE_PANAS_CODES = [
  'PANAS_UPSET',
  'PANAS_HOSTILE',
  'PANAS_ASHAMED',
  'PANAS_NERVOUS',
  'PANAS_AFRAID',
] as const;
const SCORE_PRECISION = 2;
const CURRENT_COMBINED_INSTRUMENT_VERSION = 'sam-vad-ipanas-sf-v1';
const INDEPENDENT_VERSION_SEPARATOR = '__';

export type AssessmentMeasureCode =
  | 'valence'
  | 'arousal'
  | 'dominance'
  | 'positiveAffect'
  | 'negativeAffect';

export type DescriptiveStatistics = {
  count: number;
  mean: number | null;
  median: number | null;
  standardDeviation: number | null;
};

export type AssessmentMeasureSummary = {
  code: AssessmentMeasureCode;
  label: string;
  scaleMin: number;
  scaleMax: number;
  pre: DescriptiveStatistics;
  post: DescriptiveStatistics;
  delta: DescriptiveStatistics;
  changeCounts: { increased: number; unchanged: number; decreased: number };
};

export type AssessmentParticipantRow = {
  classroomCode: string;
  instrumentVersion: string;
  dataSchemaVersion: string;
  consentVersion: string | null;
  source: IClassroomParticipation['source'];
  gender: ClassroomGender | null;
  artExperience: string | null;
  preSubmitted: boolean;
  postSubmitted: boolean;
  assessmentPaired: boolean;
  researchRecordComplete: boolean;
  scores: Record<string, number | null>;
  artworkStatus: IClassroomParticipation['artworkStatus'];
  uploaderRole: NonNullable<IWork['uploaderRole']> | null;
  aiStatus: 'none' | 'pending' | 'success' | 'failed';
  artworkAffectScoreSource: string | null;
  artworkAffectResearchEligible: boolean;
  artworkAffectExclusionReason: ArtworkAffectExclusionReason | null;
  feedbackFit: 'mostly' | 'partly' | 'not_really' | 'unsure' | null;
  uploadReason: string | null;
  preDurationMs: number | null;
  postDurationMs: number | null;
  preClientRecovered: boolean;
  postClientRecovered: boolean;
};

export type AssessmentInstrumentVersions = {
  samVad: string;
  ipanasSf: string;
};

export type InstrumentResultGroup = {
  instrumentVersion: string;
  participantCount: number;
  assessmentPairedCount: number;
  measures: AssessmentMeasureSummary[];
  narrative: string;
};

export type ClassroomAssessmentResult = {
  participantCount: number;
  preSubmittedCount: number;
  postSubmittedCount: number;
  assessmentPairedCount: number;
  researchRecordCompleteCount: number;
  instrumentGroups: InstrumentResultGroup[];
  artworkAffectSummary: ArtworkAffectSummary;
  participants: AssessmentParticipantRow[];
};

export type ArtworkAffectDimensionSummary = {
  code: string;
  label: string;
  count: number;
  mean: number | null;
  dominantCount: number;
};

export type ArtworkAffectSummary = {
  analysisSuccessCount: number;
  researchEligibleCount: number;
  excludedCount: number;
  missingCount: number;
  dimensions: ArtworkAffectDimensionSummary[];
  associations: ArtworkAffectAssociation[];
  feedbackCounts: Record<'mostly' | 'partly' | 'not_really' | 'unsure', number>;
};

type ScoreSet = Record<AssessmentMeasureCode, number | null>;

const MEASURE_CONFIG: Array<{
  code: AssessmentMeasureCode;
  label: string;
  scaleMin: number;
  scaleMax: number;
}> = [
  { code: 'valence', label: '愉悦度', scaleMin: 1, scaleMax: 9 },
  { code: 'arousal', label: '唤醒度', scaleMin: 1, scaleMax: 9 },
  { code: 'dominance', label: '掌控度', scaleMin: 1, scaleMax: 9 },
  { code: 'positiveAffect', label: '积极情绪 PA', scaleMin: 5, scaleMax: 25 },
  { code: 'negativeAffect', label: '消极情绪 NA', scaleMin: 5, scaleMax: 25 },
];

function round(value: number): number {
  return Number(value.toFixed(SCORE_PRECISION));
}

export function splitInstrumentVersion(instrumentVersion: string): AssessmentInstrumentVersions {
  if (instrumentVersion === CURRENT_COMBINED_INSTRUMENT_VERSION) {
    return { samVad: 'sam-vad-v1', ipanasSf: 'ipanas-sf-v1' };
  }
  const [samVad, ipanasSf, ...remainder] = instrumentVersion.split(INDEPENDENT_VERSION_SEPARATOR);
  if (samVad && ipanasSf && remainder.length === 0) return { samVad, ipanasSf };
  return { samVad: instrumentVersion, ipanasSf: instrumentVersion };
}

function sumCodes(
  values: Record<string, number> | undefined,
  codes: readonly string[]
): number | null {
  const scores = codes.map((code) => values?.[code]);
  if (scores.some((score) => typeof score !== 'number')) return null;
  return scores.reduce<number>((sum, score) => sum + (score ?? 0), 0);
}

function assessmentScores(
  assessment: IClassroomParticipation['preAssessment']
): ScoreSet {
  if (assessment.status !== 'submitted') return emptyScores();
  return {
    valence: assessment.vad?.valence ?? null,
    arousal: assessment.vad?.arousal ?? null,
    dominance: assessment.vad?.dominance ?? null,
    positiveAffect: sumCodes(assessment.panas, POSITIVE_PANAS_CODES),
    negativeAffect: sumCodes(assessment.panas, NEGATIVE_PANAS_CODES),
  };
}

function emptyScores(): ScoreSet {
  return {
    valence: null,
    arousal: null,
    dominance: null,
    positiveAffect: null,
    negativeAffect: null,
  };
}

export function describeValues(values: number[]): DescriptiveStatistics {
  if (values.length === 0)
    return { count: 0, mean: null, median: null, standardDeviation: null };
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
  const variance = values.length < 2
    ? null
    : values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return {
    count: values.length,
    mean: round(mean),
    median: round(median),
    standardDeviation: variance === null ? null : round(Math.sqrt(variance)),
  };
}

function validValues(rows: ScoreSet[], code: AssessmentMeasureCode): number[] {
  return rows.flatMap((row) => typeof row[code] === 'number' ? [row[code]] : []);
}

function buildMeasureSummary(
  preScores: ScoreSet[],
  postScores: ScoreSet[],
  code: AssessmentMeasureCode
): AssessmentMeasureSummary {
  const config = MEASURE_CONFIG.find((item) => item.code === code);
  if (!config) throw new Error(`Unknown assessment measure: ${code}`);
  const deltas = preScores.flatMap((pre, index) => {
    const post = postScores[index];
    return typeof pre[code] === 'number' && typeof post?.[code] === 'number'
      ? [post[code] - pre[code]]
      : [];
  });
  return {
    ...config,
    pre: describeValues(validValues(preScores, code)),
    post: describeValues(validValues(postScores, code)),
    delta: describeValues(deltas),
    changeCounts: {
      increased: deltas.filter((value) => value > 0).length,
      unchanged: deltas.filter((value) => value === 0).length,
      decreased: deltas.filter((value) => value < 0).length,
    },
  };
}

function scoreColumns(pre: ScoreSet, post: ScoreSet): Record<string, number | null> {
  return Object.fromEntries(MEASURE_CONFIG.flatMap(({ code }) => [
    [`pre_${code}`, pre[code]],
    [`post_${code}`, post[code]],
    [`delta_${code}`, typeof pre[code] === 'number' && typeof post[code] === 'number'
      ? round(post[code] - pre[code])
      : null],
  ]));
}

function participantRow(
  participant: IClassroomParticipation,
  work: IWork | undefined
): AssessmentParticipantRow {
  const pre = assessmentScores(participant.preAssessment);
  const post = assessmentScores(participant.postAssessment);
  const artworkAffect = resolveArtworkAffect(work);
  return {
    classroomCode: participant.classroomCode,
    instrumentVersion: participant.instrumentVersion,
    dataSchemaVersion: participant.dataSchemaVersion,
    consentVersion: participant.consentVersion ?? null,
    source: participant.source,
    gender: participant.profile?.gender === 'male' || participant.profile?.gender === 'female'
      ? participant.profile.gender
      : null,
    artExperience: participant.profile?.artExperience ?? null,
    preSubmitted: participant.preAssessment.status === 'submitted',
    postSubmitted: participant.postAssessment.status === 'submitted',
    assessmentPaired: participant.preAssessment.status === 'submitted'
      && participant.postAssessment.status === 'submitted',
    researchRecordComplete: participant.researchRecordComplete,
    scores: scoreColumns(pre, post),
    artworkStatus: participant.artworkStatus,
    uploaderRole: work?.uploaderRole ?? null,
    aiStatus: work?.healing?.status ?? 'none',
    artworkAffectScoreSource: artworkAffect.data?.scoreSource ?? null,
    artworkAffectResearchEligible: artworkAffect.researchEligible,
    artworkAffectExclusionReason: artworkAffect.exclusionReason,
    feedbackFit: participant.feedback?.fit ?? null,
    uploadReason: participant.uploadReason ?? null,
    preDurationMs: participant.preAssessment.durationMs ?? null,
    postDurationMs: participant.postAssessment.durationMs ?? null,
    preClientRecovered: Boolean(participant.preAssessment.clientRecovered),
    postClientRecovered: Boolean(participant.postAssessment.clientRecovered),
  };
}

function dominantDimension(work: IWork): string | null {
  const resolved = resolveArtworkAffect(work);
  if (!resolved.researchEligible || !resolved.data) return null;
  const assessed = Object.entries(resolved.data.dimensions)
    .filter(([, dimension]) => dimension.assessable && dimension.score !== null)
    .sort((left, right) => (right[1].score ?? 0) - (left[1].score ?? 0));
  return assessed[0]?.[0] ?? null;
}

function dimensionSummary(works: IWork[]): ArtworkAffectDimensionSummary[] {
  const eligible = works.filter((work) => resolveArtworkAffect(work).researchEligible);
  const dominantCodes = eligible.flatMap((work) => dominantDimension(work) ?? []);
  return ARTWORK_AFFECT_DIMENSION_CONFIG.map(({ code, label }) => {
    const values = eligible.flatMap((work) => {
      const dimension = resolveArtworkAffect(work).data?.dimensions[code];
      return dimension?.assessable && dimension.score !== null ? [dimension.score] : [];
    });
    const average = values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    return {
      code,
      label,
      count: values.length,
      mean: average,
      dominantCount: dominantCodes.filter((item) => item === code).length,
    };
  });
}

function feedbackCounts(
  participants: IClassroomParticipation[],
): ArtworkAffectSummary['feedbackCounts'] {
  const counts = { mostly: 0, partly: 0, not_really: 0, unsure: 0 };
  participants.forEach((participant) => {
    if (participant.feedback) counts[participant.feedback.fit] += 1;
  });
  return counts;
}

function artworkAffectSummary(
  participants: IClassroomParticipation[],
  works: IWork[],
): ArtworkAffectSummary {
  const resolved = works.map(resolveArtworkAffect);
  const successCount = works.filter((work) => work.healing?.status === 'success').length;
  const eligibleCount = resolved.filter((item) => item.researchEligible).length;
  return {
    analysisSuccessCount: successCount,
    researchEligibleCount: eligibleCount,
    excludedCount: successCount - eligibleCount,
    missingCount: Math.max(0, participants.length - works.length),
    dimensions: dimensionSummary(works),
    associations: buildArtworkAffectAssociations(participants, works),
    feedbackCounts: feedbackCounts(participants),
  };
}

function buildNarrative(measures: AssessmentMeasureSummary[], pairedCount: number): string {
  if (pairedCount === 0) return '当前版本尚未形成可比较的前后测配对记录。';
  const changes = measures.map((measure) => {
    const value = measure.delta.mean;
    const formatted = value === null ? '暂无有效值' : `${value >= 0 ? '+' : ''}${value}`;
    return `${measure.label}平均变化 ${formatted}`;
  });
  return `当前版本形成 ${pairedCount} 份前后测配对记录；${changes.join('，')}。结果仅作课堂描述，不代表因果效应。`;
}

function instrumentGroup(
  instrumentVersion: string,
  participants: IClassroomParticipation[]
): InstrumentResultGroup {
  const paired = participants.filter((participant) =>
    participant.preAssessment.status === 'submitted'
    && participant.postAssessment.status === 'submitted');
  const preScores = paired.map((participant) => assessmentScores(participant.preAssessment));
  const postScores = paired.map((participant) => assessmentScores(participant.postAssessment));
  const measures = MEASURE_CONFIG.map(({ code }) =>
    buildMeasureSummary(preScores, postScores, code));
  return {
    instrumentVersion,
    participantCount: participants.length,
    assessmentPairedCount: paired.length,
    measures,
    narrative: buildNarrative(measures, paired.length),
  };
}

export function buildClassroomAssessmentResult(
  participants: IClassroomParticipation[],
  works: IWork[] = []
): ClassroomAssessmentResult {
  const workByParticipant = new Map(works.map((work) => [work.participantId, work]));
  const versions = [...new Set(participants.map((participant) => participant.instrumentVersion))];
  const isSubmitted = (participant: IClassroomParticipation, timepoint: 'pre' | 'post') =>
    (timepoint === 'pre' ? participant.preAssessment : participant.postAssessment).status === 'submitted';
  const paired = participants.filter((participant) =>
    isSubmitted(participant, 'pre') && isSubmitted(participant, 'post'));
  return {
    participantCount: participants.length,
    preSubmittedCount: participants.filter((participant) => isSubmitted(participant, 'pre')).length,
    postSubmittedCount: participants.filter((participant) => isSubmitted(participant, 'post')).length,
    assessmentPairedCount: paired.length,
    researchRecordCompleteCount: participants.filter((participant) => participant.researchRecordComplete).length,
    instrumentGroups: versions.map((version) => instrumentGroup(
      version,
      participants.filter((participant) => participant.instrumentVersion === version),
    )),
    artworkAffectSummary: artworkAffectSummary(participants, works),
    participants: participants.map((participant) =>
      participantRow(participant, workByParticipant.get(participant.participantId))),
  };
}

export const ASSESSMENT_MEASURE_CONFIG = MEASURE_CONFIG;
export const ASSESSMENT_POSITIVE_PANAS_CODES = POSITIVE_PANAS_CODES;
export const ASSESSMENT_NEGATIVE_PANAS_CODES = NEGATIVE_PANAS_CODES;
