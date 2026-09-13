export const EMOTION_OPTIONS = [
  ['joy', '愉悦', 'Joy'], ['calm', '平静', 'Calm'], ['anxiety', '紧张／不安', 'Tension'],
  ['fear', '害怕', 'Fear'], ['solitude', '孤独／独处感', 'Solitude'], ['passion', '热情／奔放', 'Passion'],
  ['social_aversion', '回避互动／封闭感', 'Withdrawal'], ['vitality', '活力', 'Vitality'], ['other', '其他', 'Other'],
] as const;
export type IntentionInput = {
  intendedValence?: number; intendedArousal?: number; intendedDominance?: number;
  intendedEmotions: string[]; otherEmotion?: string; expressionConfidence?: number; intentionText?: string;
};
export type IntentionRecord = IntentionInput & {
  status: 'draft' | 'submitted'; revision: number; firstSubmittedAt?: string;
};
export const MODULE_LABELS = {
  overallExpression: ['整体表达', 'Overall expression'], emotionVad: ['情绪与 VAD', 'Emotion and VAD'],
  color: ['色彩', 'Colour'], lineComposition: ['线条与构图', 'Line and composition'],
  embeddedText: ['画内文字', 'Embedded text'], suggestion: ['创作建议', 'Suggestions'],
} as const;
export type ModuleCode = keyof typeof MODULE_LABELS;
export type EvaluationInput = {
  analysisRunId: string; reportVersion: string;
  feedbackOverallHelpful?: number; feedbackReflectionHelp?: number; feedbackDiscomfort?: number;
  moduleResponses: Partial<Record<ModuleCode, { responseCode: string | null; missingReason: string | null }>>;
  overallComment?: string;
};
export type EvaluationRecord = EvaluationInput & { status: 'draft' | 'submitted'; revision: number };
