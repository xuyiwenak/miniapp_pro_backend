import { createHash } from 'crypto';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';
import { MODULE_CODES, REFLECTION_VERSION, MODULE_VERSION, EMOTION_VERSION }
  from '../../entity/classroomReflection.entity';

export type ReflectionExportRow = Record<string, string | number | boolean | null>;
const CORE_FIELDS = ['feedbackOverallHelpful', 'feedbackReflectionHelp', 'feedbackDiscomfort'] as const;
const NORMAL_95 = 1.959963984540054;
const AGREEMENT_MIN = 5;
export function studyId(p: Pick<IClassroomParticipation, 'classId' | 'participantId'>): string {
  return createHash('sha256').update(`${p.classId}:${p.participantId}`).digest('hex');
}
export function firstEvaluation(p: IClassroomParticipation) {
  return p.evaluationHistory?.find((entry) => entry.status === 'submitted') ?? p.evaluation;
}
export function firstIntention(p: IClassroomParticipation) {
  return p.intentionHistory?.find((entry) => entry.status === 'submitted') ?? p.intention;
}
export function reflectionMissingReasons(p: IClassroomParticipation): string[] {
  const reasons: string[] = [];
  if (p.preAssessment.status !== 'submitted') reasons.push('missing_t0');
  if (p.postAssessment.status !== 'submitted') reasons.push('missing_t1');
  if (!p.artworkId) reasons.push('no_artwork');
  if (p.intention?.status !== 'submitted') reasons.push('missing_intention');
  if (!p.allowPrivateAi) reasons.push('ai_declined');
  if (!p.reportViewedAt) reasons.push('report_not_shown');
  if (p.evaluation?.status !== 'submitted') reasons.push('missing_evaluation');
  return reasons;
}
export function reflectionWideRow(p: IClassroomParticipation, sensitive = false): ReflectionExportRow {
  const intention = firstIntention(p);
  const evaluation = firstEvaluation(p);
  const includeText = sensitive && p.allowSensitiveText;
  return {
    participantStudyId: studyId(p), classroomCode: p.classroomCode, workId: p.artworkId ?? null,
    contentHash: intention?.contentHash ?? p.intention?.contentHash ?? null,
    intentionStatus: intention?.status ?? 'not_started', intentionVersion: intention?.instrumentVersion ?? null,
    intentionVadCollection: intention?.instrumentVersion === 'artwork-intention-v2-emotions'
      ? 'not_collected_by_instrument' : 'instrument_version_dependent',
    emotionTaxonomyVersion: intention?.emotionTaxonomyVersion ?? null,
    intendedValence: intention?.intendedValence ?? null, intendedArousal: intention?.intendedArousal ?? null,
    intendedDominance: intention?.intendedDominance ?? null,
    intendedEmotions: intention?.intendedEmotions.join('|') ?? null,
    expressionConfidence: intention?.expressionConfidence ?? null,
    intentionText: includeText ? intention?.intentionText ?? null : null,
    otherEmotion: includeText ? intention?.otherEmotion ?? null : null,
    intentionSubmittedAt: intention?.firstSubmittedAt?.toISOString() ?? null,
    analysisRunId: evaluation?.analysisRunId ?? p.viewedAnalysisRunId ?? null,
    reportReturnedAt: p.reportReturnedAt?.toISOString() ?? null,
    reportVersion: evaluation?.reportVersion ?? null, reportViewedAt: p.reportViewedAt?.toISOString() ?? null,
    evaluationStatus: evaluation?.status ?? 'not_started', evaluationVersion: evaluation?.instrumentVersion ?? null,
    feedbackOverallHelpful: evaluation?.feedbackOverallHelpful ?? null,
    feedbackReflectionHelp: evaluation?.feedbackReflectionHelp ?? null,
    feedbackDiscomfort: evaluation?.feedbackDiscomfort ?? null,
    evaluationSubmittedAt: evaluation?.firstSubmittedAt?.toISOString() ?? null,
    overallComment: includeText ? evaluation?.overallComment ?? null : null,
    missingReasons: reflectionMissingReasons(p).join('|'),
  };
}
export function moduleExportRows(participants: IClassroomParticipation[]): ReflectionExportRow[] {
  return participants.flatMap((p) => MODULE_CODES.map((moduleCode) => {
    const evaluation = firstEvaluation(p);
    const response = evaluation?.moduleResponses[moduleCode];
    return { participantStudyId: studyId(p), analysisRunId: evaluation?.analysisRunId ?? null,
      evaluationStatus: evaluation?.status ?? 'not_started', moduleCode, responseCode: response?.responseCode ?? null,
      missingReason: response?.missingReason ?? 'evaluation_not_submitted', moduleEvaluationVersion: MODULE_VERSION };
  }));
}
export function consentExportRows(participants: IClassroomParticipation[]): ReflectionExportRow[] {
  return participants.flatMap((p) => (p.consentEvents ?? []).map((event) => ({
    participantStudyId: studyId(p), consentId: event.consentId, consentType: event.consentType,
    granted: event.granted, consentTextVersion: event.consentTextVersion, occurredAt: event.occurredAt.toISOString(),
  })));
}
function quantile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}
export function describeFeedback(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = values.length;
  const agreeCount = values.filter((value) => value >= AGREEMENT_MIN).length;
  const proportion = count ? agreeCount / count : null;
  const zSquared = NORMAL_95 ** 2;
  const center = count ? (agreeCount + zSquared / 2) / (count + zSquared) : null;
  const radius = count && proportion !== null
    ? NORMAL_95 * Math.sqrt(proportion * (1 - proportion) / count + zSquared / (4 * count ** 2))
      / (1 + zSquared / count) : null;
  return { count, median: quantile(sorted, 0.5), q1: quantile(sorted, 0.25), q3: quantile(sorted, 0.75),
    mean: count ? values.reduce((sum, value) => sum + value, 0) / count : null,
    agreementCount: agreeCount, agreementProportion: proportion,
    agreementCiLow: center !== null && radius !== null ? Math.max(0, center - radius) : null,
    agreementCiHigh: center !== null && radius !== null ? Math.min(1, center + radius) : null,
    distribution: Object.fromEntries(Array.from({ length: 7 }, (_, i) =>
      [i + 1, values.filter((value) => value === i + 1).length])),
  };
}
export function reflectionSummary(participants: IClassroomParticipation[]) {
  const evaluations = participants.map(firstEvaluation).filter((entry) => entry?.status === 'submitted');
  const reportShown = participants.filter((p) => p.reportViewedAt).length;
  return { participantCount: participants.length,
    intentionSubmitted: participants.filter((p) => p.intention?.status === 'submitted').length,
    reportShown, evaluationSubmitted: evaluations.length,
    responseRate: reportShown ? evaluations.length / reportShown : null,
    aiDeclined: participants.filter((p) => !p.allowPrivateAi).length,
    complete: participants.filter((p) => p.researchRecordComplete).length,
    instrumentVersion: REFLECTION_VERSION, emotionTaxonomyVersion: EMOTION_VERSION,
    questions: CORE_FIELDS.map((field) => ({ field, ...describeFeedback(evaluations.flatMap((entry) => {
      const value = entry?.[field]; return typeof value === 'number' ? [value] : [];
    })) })),
    modules: MODULE_CODES.map((moduleCode) => ({ moduleCode,
      counts: moduleCounts(participants, moduleCode) })),
  };
}
function moduleCounts(participants: IClassroomParticipation[], moduleCode: typeof MODULE_CODES[number]) {
  const counts: Record<string, number> = {};
  for (const p of participants) {
    const evaluation = firstEvaluation(p);
    const response = evaluation?.status === 'submitted' ? evaluation.moduleResponses[moduleCode] : undefined;
    const code = response?.responseCode ?? response?.missingReason ?? 'evaluation_not_submitted';
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}
