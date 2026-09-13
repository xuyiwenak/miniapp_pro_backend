import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import type { HydratedDocument } from 'mongoose';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';
import {
  EMOTION_CODES, EMOTION_VERSION, INTENTION_VERSION, REFLECTION_VERSION, MODULE_VERSION, MODULE_CODES,
  type IIntention, type IFeedbackEvaluation, type ModuleCode,
} from '../../entity/classroomReflection.entity';
import { ClassroomWriteError } from './classroomWriteBoundary';

const VAD_MAX = 9;
const LIKERT_MAX = 7;
const MAX_EMOTIONS = 3;
const MAX_INTENTION_LENGTH = 200;
const MAX_COMMENT_LENGTH = 300;
const MAX_OTHER_LENGTH = 50;
const LikertSchema = z.number().int().min(1).max(LIKERT_MAX);
const VadSchema = z.number().int().min(1).max(VAD_MAX);
export const IntentionDraftInput = z.object({
  intendedValence: VadSchema.optional(), intendedArousal: VadSchema.optional(),
  intendedDominance: VadSchema.optional(), intendedEmotions: z.array(z.enum(EMOTION_CODES)).max(MAX_EMOTIONS),
  otherEmotion: z.string().trim().max(MAX_OTHER_LENGTH).optional(),
  expressionConfidence: LikertSchema.optional(), intentionText: z.string().trim().max(MAX_INTENTION_LENGTH).optional(),
}).strict();
export const IntentionSubmitInput = IntentionDraftInput.extend({
  intendedValence: VadSchema, intendedArousal: VadSchema, intendedDominance: VadSchema,
  expressionConfidence: LikertSchema,
  intendedEmotions: z.array(z.enum(EMOTION_CODES)).min(1).max(MAX_EMOTIONS),
}).superRefine((value, ctx) => {
  if (new Set(value.intendedEmotions).size !== value.intendedEmotions.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate emotions' });
  }
  if (value.intendedEmotions.includes('other') && !value.otherEmotion) {
    ctx.addIssue({ code: 'custom', message: 'Other emotion text required' });
  }
});
const ResponseSchema = z.object({
  responseCode: z.enum(['matches', 'partly_matches', 'does_not_match', 'cannot_judge',
    'helpful', 'partly_helpful', 'not_helpful']).nullable(),
  missingReason: z.enum(['not_answered', 'not_shown', 'not_applicable']).nullable(),
}).strict().refine((value) => (value.responseCode === null) !== (value.missingReason === null));
export const EvaluationDraftInput = z.object({
  analysisRunId: z.string().uuid(), reportVersion: z.string().min(1).max(120),
  feedbackOverallHelpful: LikertSchema.optional(), feedbackReflectionHelp: LikertSchema.optional(),
  feedbackDiscomfort: LikertSchema.optional(),
  moduleResponses: z.record(z.enum(MODULE_CODES), ResponseSchema).default({}),
  overallComment: z.string().trim().max(MAX_COMMENT_LENGTH).optional(),
}).strict();
export const EvaluationSubmitInput = EvaluationDraftInput.extend({
  feedbackOverallHelpful: LikertSchema, feedbackReflectionHelp: LikertSchema, feedbackDiscomfort: LikertSchema,
});
export function requestHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
export function assertRepeatedRequest(
  record: { requestKey?: string; requestHash?: string } | undefined, key: string, hash: string,
): boolean {
  if (record?.requestKey !== key) return false;
  if (record.requestHash !== hash) throw new ClassroomWriteError('IDEMPOTENCY_CONFLICT');
  return true;
}
export function assertCanViewReport(participant: IClassroomParticipation): void {
  if (!participant.allowPrivateAi) throw new ClassroomWriteError('CONSENT_REQUIRED');
  if (participant.postAssessment.status !== 'submitted') throw new ClassroomWriteError('POST_ASSESSMENT_REQUIRED');
  if (participant.intention?.status !== 'submitted') throw new ClassroomWriteError('INTENTION_REQUIRED');
}
export function normalizeModuleResponses(
  input: z.infer<typeof EvaluationDraftInput>, shown: ModuleCode[],
): IFeedbackEvaluation['moduleResponses'] {
  return Object.fromEntries(MODULE_CODES.map((code) => {
    const value = input.moduleResponses[code];
    if (!shown.includes(code)) {
      if (value?.responseCode) throw new ClassroomWriteError('MODULE_NOT_SHOWN');
      return [code, { responseCode: null, missingReason: 'not_shown' }];
    }
    const allowed = code === 'suggestion'
      ? ['helpful', 'partly_helpful', 'not_helpful', 'cannot_judge']
      : ['matches', 'partly_matches', 'does_not_match', 'cannot_judge'];
    if (value?.responseCode && !allowed.includes(value.responseCode)) {
      throw new ClassroomWriteError('INVALID_MODULE_RESPONSE');
    }
    if (value?.missingReason && value.missingReason !== 'not_answered') {
      throw new ClassroomWriteError('INVALID_MISSING_REASON');
    }
    return [code, value ?? { responseCode: null, missingReason: 'not_answered' }];
  }));
}
export function buildIntention(
  participant: IClassroomParticipation, input: z.infer<typeof IntentionDraftInput>, key: string, submit: boolean,
): IIntention {
  const previous = participant.intention;
  return {
    ...input, intentionId: previous?.intentionId ?? randomUUID(), status: submit ? 'submitted' : 'draft',
    revision: (previous?.revision ?? 0) + 1, instrumentVersion: INTENTION_VERSION,
    emotionTaxonomyVersion: EMOTION_VERSION, workId: participant.artworkId,
    firstSubmittedAt: previous?.firstSubmittedAt ?? (submit ? new Date() : undefined), savedAt: new Date(),
    requestKey: key, requestHash: requestHash(input), postExposureRevision: Boolean(participant.reportViewedAt),
  };
}
export function buildEvaluation(
  participant: IClassroomParticipation, input: z.infer<typeof EvaluationDraftInput>,
  key: string, submit: boolean, shown: ModuleCode[],
): IFeedbackEvaluation {
  const previous = participant.evaluation;
  return {
    ...input, evaluationId: previous?.evaluationId ?? randomUUID(), status: submit ? 'submitted' : 'draft',
    revision: (previous?.revision ?? 0) + 1, instrumentVersion: REFLECTION_VERSION,
    moduleEvaluationVersion: MODULE_VERSION, moduleResponses: normalizeModuleResponses(input, shown),
    startedAt: previous?.startedAt ?? new Date(),
    firstSubmittedAt: previous?.firstSubmittedAt ?? (submit ? new Date() : undefined),
    requestKey: key, requestHash: requestHash(input),
  };
}
export function retainFirstSubmission(participant: HydratedDocument<IClassroomParticipation>, kind: 'intention' | 'evaluation') {
  const current = participant[kind];
  if (current?.status !== 'submitted') return;
  if (kind === 'intention' && participant.intention) participant.intentionHistory.push(participant.intention);
  if (kind === 'evaluation' && participant.evaluation) participant.evaluationHistory.push(participant.evaluation);
}
