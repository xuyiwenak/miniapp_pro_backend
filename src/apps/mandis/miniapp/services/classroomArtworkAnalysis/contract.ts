import { z } from 'zod';

export const EDUCATION_ARTWORK_CONSTRUCT = 'perceived_expressed_affect' as const;
export const EDUCATION_ARTWORK_SCALE_VERSION = 'artwork-affect-v1';
export const EDUCATION_ARTWORK_PROMPT_VERSION = 'education-artwork-affect-prompt-v1';
export const EDUCATION_NOT_ARTWORK_ERROR_CODE = 'NOT_ARTWORK';

export const EDUCATION_ARTWORK_DIMENSIONS = [
  'joy',
  'calm',
  'anxiety',
  'fear',
  'solitude',
  'passion',
  'social_aversion',
  'vitality',
] as const;

const AffectDimensionSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  assessable: z.boolean(),
  evidence: z.array(z.string().trim().min(1)).min(1).max(3),
}).strict().superRefine((value, context) => {
  const valid = value.assessable ? value.score !== null : value.score === null;
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: 'score and assessable disagree' });
});

const AffectDimensionsSchema = z.object({
  joy: AffectDimensionSchema,
  calm: AffectDimensionSchema,
  anxiety: AffectDimensionSchema,
  fear: AffectDimensionSchema,
  solitude: AffectDimensionSchema,
  passion: AffectDimensionSchema,
  social_aversion: AffectDimensionSchema,
  vitality: AffectDimensionSchema,
}).strict();

const AffectVadSchema = z.object({
  valence: z.number().min(0).max(100).nullable(),
  arousal: z.number().min(0).max(100).nullable(),
  dominance: z.number().min(0).max(100).nullable(),
  assessable: z.boolean(),
  evidence: z.array(z.string().trim().min(1)).min(1).max(3),
  interpretation: z.string().trim().min(1),
}).strict().superRefine((value, context) => {
  const scores = [value.valence, value.arousal, value.dominance];
  const valid = value.assessable
    ? scores.every((score) => score !== null)
    : scores.every((score) => score === null);
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: 'VAD scores and assessable disagree' });
});

const FusedArtworkAnalysisSchema = z.object({
  construct: z.literal(EDUCATION_ARTWORK_CONSTRUCT),
  scale_version: z.literal(EDUCATION_ARTWORK_SCALE_VERSION),
  dimensions: AffectDimensionsSchema,
  vad: AffectVadSchema,
  insight: z.string().trim().min(1),
  color_analysis: z.object({
    interpretation: z.string().trim().min(1),
    key_colors: z.array(z.string().trim().min(1)).min(2).max(4),
  }).strict(),
  line_analysis: z.object({
    energy_score: z.number().min(0).max(10).nullable(),
    style: z.string().trim().min(1),
    interpretation: z.string().trim().min(1),
  }).strict(),
  composition_report: z.string().trim().min(1),
  suggestion: z.string().trim().min(1),
}).strict();

const EmbeddedTextSchema = z.object({
  detected: z.boolean(),
  legibility: z.enum(['high', 'medium', 'low', 'none']),
  completeness: z.enum(['complete', 'partial', 'unreadable', 'none']),
  affect_cues: z.array(z.string().trim().min(1)).max(5),
  contains_potential_pii: z.boolean(),
}).strict();

export const EducationArtworkAnalysisOutputSchema = z.object({
  visual: z.object({
    dimensions: AffectDimensionsSchema,
    vad: AffectVadSchema,
  }).strict(),
  embedded_text: EmbeddedTextSchema,
  relation: z.enum(['reinforces', 'contrasts', 'independent', 'unclear']),
  fused: FusedArtworkAnalysisSchema,
}).strict().superRefine((value, context) => {
  const text = value.embedded_text;
  const absentTextValid = text.detected
    || (text.legibility === 'none' && text.completeness === 'none' && text.affect_cues.length === 0);
  if (!absentTextValid) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['embedded_text'], message: 'absent text metadata disagrees' });
  }
  const presentTextValid = !text.detected
    || (text.legibility !== 'none' && text.completeness !== 'none');
  if (!presentTextValid) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['embedded_text'], message: 'present text metadata disagrees' });
  }
  const cuesAllowed = text.legibility === 'high' || text.legibility === 'medium';
  if (!cuesAllowed && text.affect_cues.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['embedded_text', 'affect_cues'], message: 'unreadable text has cues' });
  }
  if (!text.detected && value.relation !== 'independent') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relation'], message: 'no text requires independent relation' });
  }
});

export type EducationArtworkAnalysisOutput = z.infer<typeof EducationArtworkAnalysisOutputSchema>;
export type EducationFusedArtworkAnalysis = z.infer<typeof FusedArtworkAnalysisSchema>;

export type EducationArtworkAnalysisResult = {
  output: EducationArtworkAnalysisOutput;
  modelVersion: string;
};

export function parseEducationArtworkAnalysisOutput(input: unknown): EducationArtworkAnalysisOutput {
  return EducationArtworkAnalysisOutputSchema.parse(input);
}

export class ClassroomNotArtworkError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super('Not a classroom artwork');
    this.name = 'ClassroomNotArtworkError';
    this.reason = reason;
  }
}
