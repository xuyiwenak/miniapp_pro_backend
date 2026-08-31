import type { AssessmentRecord, ParticipationState } from '@mandis/common/classroom-types';

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

export type SessionMeasure = {
  code: string;
  zhLabel: string;
  enLabel: string;
  pre: number | null;
  post: number | null;
  min: number;
  max: number;
};

function readVad(assessment: AssessmentRecord, code: string): number | null {
  if (assessment.status !== 'submitted') return null;
  return assessment.vad?.[code] ?? null;
}

function sumPanas(assessment: AssessmentRecord, codes: readonly string[]): number | null {
  if (assessment.status !== 'submitted') return null;
  const values = codes.map((code) => assessment.panas?.[code]);
  if (values.some((value) => typeof value !== 'number')) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function buildVadMeasures(participation: ParticipationState): SessionMeasure[] {
  const { preAssessment: pre, postAssessment: post } = participation;
  return [
    createVadMeasure('valence', '愉悦度', 'Valence', pre, post),
    createVadMeasure('arousal', '唤醒度', 'Arousal', pre, post),
    createVadMeasure('dominance', '掌控感', 'Sense of control', pre, post),
  ];
}

function createVadMeasure(
  code: string,
  zhLabel: string,
  enLabel: string,
  pre: AssessmentRecord,
  post: AssessmentRecord
): SessionMeasure {
  return { code, zhLabel, enLabel, pre: readVad(pre, code), post: readVad(post, code), min: 1, max: 9 };
}

export function buildAffectMeasures(participation: ParticipationState): SessionMeasure[] {
  const { preAssessment: pre, postAssessment: post } = participation;
  return [
    {
      code: 'positiveAffect',
      zhLabel: '积极情绪 PA',
      enLabel: 'Positive affect (PA)',
      pre: sumPanas(pre, POSITIVE_PANAS_CODES),
      post: sumPanas(post, POSITIVE_PANAS_CODES),
      min: 5,
      max: 25,
    },
    {
      code: 'negativeAffect',
      zhLabel: '消极情绪 NA',
      enLabel: 'Negative affect (NA)',
      pre: sumPanas(pre, NEGATIVE_PANAS_CODES),
      post: sumPanas(post, NEGATIVE_PANAS_CODES),
      min: 5,
      max: 25,
    },
  ];
}
