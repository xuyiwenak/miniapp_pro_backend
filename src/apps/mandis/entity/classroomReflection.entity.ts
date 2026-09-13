import { Schema } from 'mongoose';

export const REFLECTION_VERSION = 'ai-feedback-evaluation-v3';
export const INTENTION_VERSION = 'artwork-intention-v1';
export const EMOTION_VERSION = 'artwork-emotion-taxonomy-v1-draft';
export const MODULE_VERSION = 'module-click-v2';
export const EMOTION_CODES = [
  'joy', 'calm', 'anxiety', 'fear', 'solitude', 'passion', 'social_aversion', 'vitality', 'other',
] as const;
export const MODULE_CODES = [
  'overallExpression', 'emotionVad', 'color', 'lineComposition', 'embeddedText', 'suggestion',
] as const;
export type ModuleCode = typeof MODULE_CODES[number];
export interface IModuleResponse {
  responseCode: string | null;
  missingReason: 'not_answered' | 'not_shown' | 'not_applicable' | null;
}
export interface IIntention {
  intentionId: string;
  status: 'draft' | 'submitted';
  revision: number;
  instrumentVersion: string;
  emotionTaxonomyVersion: string;
  intendedValence?: number;
  intendedArousal?: number;
  intendedDominance?: number;
  intendedEmotions: string[];
  otherEmotion?: string;
  expressionConfidence?: number;
  intentionText?: string;
  workId?: string;
  contentHash?: string;
  firstSubmittedAt?: Date;
  savedAt: Date;
  requestKey?: string;
  requestHash?: string;
  postExposureRevision: boolean;
}
export interface IFeedbackEvaluation {
  evaluationId: string;
  status: 'draft' | 'submitted';
  revision: number;
  instrumentVersion: string;
  moduleEvaluationVersion: string;
  analysisRunId: string;
  reportVersion: string;
  feedbackOverallHelpful?: number;
  feedbackReflectionHelp?: number;
  feedbackDiscomfort?: number;
  moduleResponses: Partial<Record<ModuleCode, IModuleResponse>>;
  overallComment?: string;
  startedAt: Date;
  firstSubmittedAt?: Date;
  requestKey?: string;
  requestHash?: string;
}
export interface IConsentEvent {
  consentId: string;
  consentType: 'private_ai' | 'sensitive_text';
  granted: boolean;
  consentTextVersion: string;
  occurredAt: Date;
  requestKey: string;
}
const SCORE_MIN = 1; // Both human response scales start at one.
const VAD_MAX = 9;
const LIKERT_MAX = 7;
const OPTIONS = { _id: false };
export const IntentionSchema = new Schema<IIntention>({
  intentionId: { type: String, required: true },
  status: { type: String, enum: ['draft', 'submitted'], required: true },
  revision: { type: Number, required: true },
  instrumentVersion: { type: String, required: true },
  emotionTaxonomyVersion: { type: String, required: true },
  intendedValence: { type: Number, min: SCORE_MIN, max: VAD_MAX },
  intendedArousal: { type: Number, min: SCORE_MIN, max: VAD_MAX },
  intendedDominance: { type: Number, min: SCORE_MIN, max: VAD_MAX },
  intendedEmotions: [String], otherEmotion: String,
  expressionConfidence: { type: Number, min: SCORE_MIN, max: LIKERT_MAX },
  intentionText: String, workId: String, contentHash: String,
  firstSubmittedAt: Date, savedAt: { type: Date, required: true },
  requestKey: String, requestHash: String, postExposureRevision: { type: Boolean, default: false },
}, OPTIONS);
const ModuleResponseSchema = new Schema<IModuleResponse>({
  responseCode: { type: String, default: null },
  missingReason: { type: String, enum: ['not_answered', 'not_shown', 'not_applicable', null], default: null },
}, OPTIONS);
const ModuleResponsesSchema = new Schema(Object.fromEntries(
  MODULE_CODES.map((code) => [code, { type: ModuleResponseSchema }]),
), OPTIONS);
export const FeedbackEvaluationSchema = new Schema<IFeedbackEvaluation>({
  evaluationId: { type: String, required: true },
  status: { type: String, enum: ['draft', 'submitted'], required: true },
  revision: { type: Number, required: true },
  instrumentVersion: { type: String, required: true },
  moduleEvaluationVersion: { type: String, required: true },
  analysisRunId: { type: String, required: true }, reportVersion: { type: String, required: true },
  feedbackOverallHelpful: { type: Number, min: SCORE_MIN, max: LIKERT_MAX },
  feedbackReflectionHelp: { type: Number, min: SCORE_MIN, max: LIKERT_MAX },
  feedbackDiscomfort: { type: Number, min: SCORE_MIN, max: LIKERT_MAX },
  moduleResponses: { type: ModuleResponsesSchema, required: true }, overallComment: String,
  startedAt: { type: Date, required: true }, firstSubmittedAt: Date, requestKey: String, requestHash: String,
}, OPTIONS);
export const ConsentEventSchema = new Schema<IConsentEvent>({
  consentId: { type: String, required: true },
  consentType: { type: String, enum: ['private_ai', 'sensitive_text'], required: true },
  granted: { type: Boolean, required: true }, consentTextVersion: { type: String, required: true },
  occurredAt: { type: Date, required: true }, requestKey: { type: String, required: true },
}, OPTIONS);
