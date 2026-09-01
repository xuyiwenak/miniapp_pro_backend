import type {
  ArtworkAffectScoreSource,
  IArtworkAffect,
  IArtworkAffectDimension,
  IWork,
} from '../../../../entity/work.entity';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';

const LEGACY_VERSION = 'legacy-unversioned';
const SCORE_PRECISION = 2;
const MIN_CORRELATION_SAMPLE_SIZE = 3;
const DEFAULT_SCORE = 50;
const ENERGY_SCORE_MAX = 10;
const ENERGY_SCORE_OFFSET = 10;
const ENERGY_SCORE_SCALE = 80;
const LEGACY_COEFFICIENTS: Record<string, number> = {
  joy: 0.9,
  calm: 0.6,
  anxiety: 0.3,
  fear: 0.2,
  solitude: 0.15,
  passion: 0.85,
  social_aversion: 0.2,
  vitality: 0.95,
};

export const ARTWORK_AFFECT_DIMENSION_CONFIG = [
  { code: 'joy', label: '快乐' },
  { code: 'calm', label: '平静' },
  { code: 'anxiety', label: '焦虑' },
  { code: 'fear', label: '恐惧' },
  { code: 'solitude', label: '孤独' },
  { code: 'passion', label: '热情' },
  { code: 'social_aversion', label: '社交抵触' },
  { code: 'vitality', label: '活力' },
] as const;

export const ARTWORK_SELF_REPORT_MAPPINGS = [
  { dimensionCode: 'joy', targetCode: 'positiveAffect', targetLabel: '课后积极情绪 PA', strength: 'moderate', direction: 'same' },
  { dimensionCode: 'joy', targetCode: 'valence', targetLabel: '课后愉悦度', strength: 'moderate', direction: 'same' },
  { dimensionCode: 'passion', targetCode: 'passionItems', targetLabel: '课后 inspired / determined / active', strength: 'moderate', direction: 'same' },
  { dimensionCode: 'passion', targetCode: 'arousal', targetLabel: '课后唤醒度', strength: 'moderate', direction: 'same' },
  { dimensionCode: 'vitality', targetCode: 'vitalityItems', targetLabel: '课后 active / alert', strength: 'strong', direction: 'same' },
  { dimensionCode: 'vitality', targetCode: 'arousal', targetLabel: '课后唤醒度', strength: 'strong', direction: 'same' },
  { dimensionCode: 'anxiety', targetCode: 'anxietyItems', targetLabel: '课后 nervous / upset', strength: 'strong', direction: 'same' },
  { dimensionCode: 'anxiety', targetCode: 'negativeAffect', targetLabel: '课后消极情绪 NA', strength: 'strong', direction: 'same' },
  { dimensionCode: 'fear', targetCode: 'fearItem', targetLabel: '课后 afraid', strength: 'strong', direction: 'same' },
  { dimensionCode: 'fear', targetCode: 'negativeAffect', targetLabel: '课后消极情绪 NA', strength: 'strong', direction: 'same' },
  { dimensionCode: 'calm', targetCode: 'arousal', targetLabel: '课后唤醒度', strength: 'limited', direction: 'inverse' },
] as const;

export type ArtworkAffectExclusionReason =
  | 'missing'
  | 'analysis_incomplete'
  | 'default_scores'
  | 'derived_scores'
  | 'legacy_unverified'
  | 'insufficient_evidence';

export type ResolvedArtworkAffect = {
  data: IArtworkAffect | null;
  researchEligible: boolean;
  exclusionReason: ArtworkAffectExclusionReason | null;
};

export type ArtworkAffectAssociation = {
  dimensionCode: string;
  dimensionLabel: string;
  targetCode: string;
  targetLabel: string;
  strength: 'strong' | 'moderate' | 'limited';
  direction: 'same' | 'inverse';
  sampleSize: number;
  correlation: number | null;
};

export type ArtworkSelfReportComparison = {
  dimensionCode: string;
  dimensionLabel: string;
  artworkScore: number | null;
  targetCode: string;
  targetLabel: string;
  postSelfReportValue: number | null;
  strength: 'strong' | 'moderate' | 'limited';
  direction: 'same' | 'inverse';
};

function legacyDimension(score: number | undefined): IArtworkAffectDimension {
  return {
    score: typeof score === 'number' ? score : null,
    assessable: typeof score === 'number',
    evidence: [],
  };
}

function legacySource(work: IWork): ArtworkAffectScoreSource {
  const values = ARTWORK_AFFECT_DIMENSION_CONFIG.map(({ code }) => work.healing?.scores[code]);
  if (values.every((value) => value === DEFAULT_SCORE)) return 'default';
  if (matchesLegacyEnergyDerivation(work)) return 'derived_from_energy';
  return 'legacy_unverified';
}

function matchesLegacyEnergyDerivation(work: IWork): boolean {
  const energy = work.healing?.lineAnalysis?.energy_score;
  if (typeof energy !== 'number') return false;
  const activity = (Math.max(0, Math.min(ENERGY_SCORE_MAX, energy)) / ENERGY_SCORE_MAX)
    * ENERGY_SCORE_SCALE + ENERGY_SCORE_OFFSET;
  return ARTWORK_AFFECT_DIMENSION_CONFIG.every(({ code }) => {
    const coefficient = LEGACY_COEFFICIENTS[code] ?? 0;
    const raw = legacyDerivedScore(code, activity, coefficient);
    const expected = Math.max(5, Math.min(98, Math.round(raw)));
    return work.healing?.scores[code] === expected;
  });
}

function legacyDerivedScore(code: string, activity: number, coefficient: number): number {
  if (code === 'calm') return 100 - activity * coefficient;
  if (code === 'solitude' || code === 'social_aversion') return (100 - activity) * coefficient;
  return activity * coefficient;
}

function legacyArtworkAffect(work: IWork): IArtworkAffect | null {
  if (work.healing?.status !== 'success') return null;
  const dimensions = Object.fromEntries(ARTWORK_AFFECT_DIMENSION_CONFIG.map(({ code }) => [
    code,
    legacyDimension(work.healing?.scores[code]),
  ]));
  return {
    construct: 'perceived_expressed_affect',
    scoreSource: legacySource(work),
    modelVersion: LEGACY_VERSION,
    promptVersion: LEGACY_VERSION,
    scaleVersion: LEGACY_VERSION,
    generatedAt: work.healing.analyzedAt ?? work.updatedAt,
    dimensions,
    vad: {
      valence: work.healing.vad?.valence ?? null,
      arousal: work.healing.vad?.arousal ?? null,
      dominance: work.healing.vad?.dominance ?? null,
      assessable: Boolean(work.healing.vad),
      evidence: [],
      interpretation: work.healing.vad?.interpretation ?? '',
    },
  };
}

function exclusionReason(data: IArtworkAffect | null): ArtworkAffectExclusionReason | null {
  if (!data) return 'missing';
  if (data.scoreSource === 'default') return 'default_scores';
  if (data.scoreSource === 'derived_from_energy') return 'derived_scores';
  if (data.scoreSource === 'legacy_unverified') return 'legacy_unverified';
  const assessedCount = Object.values(data.dimensions).filter((item) => item.assessable).length;
  return assessedCount === 0 ? 'insufficient_evidence' : null;
}

export function resolveArtworkAffect(work: IWork | undefined): ResolvedArtworkAffect {
  if (!work) return { data: null, researchEligible: false, exclusionReason: 'missing' };
  if (work.healing?.status !== 'success') {
    return { data: null, researchEligible: false, exclusionReason: 'analysis_incomplete' };
  }
  const data = work.healing.artworkAffect ?? legacyArtworkAffect(work);
  const reason = exclusionReason(data);
  return { data, researchEligible: reason === null, exclusionReason: reason };
}

function mean(values: Array<number | undefined>): number | null {
  if (values.some((value) => typeof value !== 'number')) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / values.length;
}

function sum(values: Record<string, number> | undefined, codes: readonly string[]): number | null {
  return mean(codes.map((code) => values?.[code])) === null
    ? null
    : codes.reduce((total, code) => total + (values?.[code] ?? 0), 0);
}

export function postSelfReportValue(
  participant: IClassroomParticipation,
  targetCode: string,
): number | null {
  if (participant.postAssessment.status !== 'submitted') return null;
  const { panas, vad } = participant.postAssessment;
  if (targetCode === 'valence' || targetCode === 'arousal') return vad?.[targetCode] ?? null;
  if (targetCode === 'positiveAffect') {
    return sum(panas, ['PANAS_ALERT', 'PANAS_INSPIRED', 'PANAS_DETERMINED', 'PANAS_ATTENTIVE', 'PANAS_ACTIVE']);
  }
  if (targetCode === 'negativeAffect') {
    return sum(panas, ['PANAS_UPSET', 'PANAS_HOSTILE', 'PANAS_ASHAMED', 'PANAS_NERVOUS', 'PANAS_AFRAID']);
  }
  if (targetCode === 'passionItems') return mean(['PANAS_INSPIRED', 'PANAS_DETERMINED', 'PANAS_ACTIVE'].map((code) => panas?.[code]));
  if (targetCode === 'vitalityItems') return mean(['PANAS_ACTIVE', 'PANAS_ALERT'].map((code) => panas?.[code]));
  if (targetCode === 'anxietyItems') return mean(['PANAS_NERVOUS', 'PANAS_UPSET'].map((code) => panas?.[code]));
  if (targetCode === 'fearItem') return panas?.PANAS_AFRAID ?? null;
  return null;
}

export function buildArtworkSelfReportComparison(
  participant: IClassroomParticipation,
  work: IWork | undefined,
): ArtworkSelfReportComparison[] {
  const artworkAffect = resolveArtworkAffect(work).data;
  return ARTWORK_SELF_REPORT_MAPPINGS.map((mapping) => ({
    ...mapping,
    dimensionLabel: ARTWORK_AFFECT_DIMENSION_CONFIG.find(
      ({ code }) => code === mapping.dimensionCode,
    )?.label ?? mapping.dimensionCode,
    artworkScore: artworkAffect?.dimensions[mapping.dimensionCode]?.score ?? null,
    postSelfReportValue: postSelfReportValue(participant, mapping.targetCode),
  }));
}

function correlation(pairs: Array<[number, number]>): number | null {
  if (pairs.length < MIN_CORRELATION_SAMPLE_SIZE) return null;
  const xMean = pairs.reduce((sumValue, [x]) => sumValue + x, 0) / pairs.length;
  const yMean = pairs.reduce((sumValue, [, y]) => sumValue + y, 0) / pairs.length;
  const numerator = pairs.reduce((sumValue, [x, y]) => sumValue + (x - xMean) * (y - yMean), 0);
  const xSquared = pairs.reduce((sumValue, [x]) => sumValue + (x - xMean) ** 2, 0);
  const ySquared = pairs.reduce((sumValue, [, y]) => sumValue + (y - yMean) ** 2, 0);
  if (xSquared === 0 || ySquared === 0) return null;
  return Number((numerator / Math.sqrt(xSquared * ySquared)).toFixed(SCORE_PRECISION));
}

export function buildArtworkAffectAssociations(
  participants: IClassroomParticipation[],
  works: IWork[],
): ArtworkAffectAssociation[] {
  const participantById = new Map(participants.map((participant) => [participant.participantId, participant]));
  return ARTWORK_SELF_REPORT_MAPPINGS.map((mapping) => {
    const pairs = works.flatMap((work): Array<[number, number]> => {
      const participant = work.participantId ? participantById.get(work.participantId) : undefined;
      const resolved = resolveArtworkAffect(work);
      const score = resolved.data?.dimensions[mapping.dimensionCode]?.score;
      const target = participant ? postSelfReportValue(participant, mapping.targetCode) : null;
      return resolved.researchEligible && score !== null && score !== undefined && target !== null
        ? [[score, target]] : [];
    });
    const dimensionLabel = ARTWORK_AFFECT_DIMENSION_CONFIG.find(
      ({ code }) => code === mapping.dimensionCode,
    )?.label ?? mapping.dimensionCode;
    return { ...mapping, dimensionLabel, sampleSize: pairs.length, correlation: correlation(pairs) };
  });
}
