import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getGalleryWorkModel, getPeerReviewModel, getClassroomParticipationModel, getWorkModel }
  from '../../../../dbservice/model/GlobalInfoDBModel';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';
import { GALLERY_VERSION, type IGalleryWork, type IPeerReview } from '../../entity/classroomGallery.entity';
import { EMOTION_CODES } from '../../entity/classroomReflection.entity';
import { ClassroomWriteError } from './classroomWriteBoundary';
import { EvaluationDraftInput, normalizeModuleResponses, requestHash } from './classroomReflection';

const MAX_EMOTIONS = 3;
const VAD_MAX = 9;
const LIKERT_MAX = 7;
const MAX_COMMENT = 300;
export const GALLERY_PAGE_SIZE = 24;
export const PeerDraftInput = z.object({
  valence: z.number().int().min(1).max(VAD_MAX).optional(),
  arousal: z.number().int().min(1).max(VAD_MAX).optional(),
  dominance: z.number().int().min(1).max(VAD_MAX).optional(),
  emotions: z.array(z.enum(EMOTION_CODES)).max(MAX_EMOTIONS),
  otherEmotion: z.string().trim().max(50).optional(),
  confidence: z.number().int().min(1).max(LIKERT_MAX).optional(),
  comment: z.string().trim().max(MAX_COMMENT).optional(),
}).strict();
export const PeerSubmitInput = PeerDraftInput.required({ valence: true, arousal: true, dominance: true,
  confidence: true }).superRefine((input, ctx) => {
  if (!input.emotions.length || new Set(input.emotions).size !== input.emotions.length
    || (input.emotions.includes('other') && !input.otherEmotion)) {
    ctx.addIssue({ code: 'custom', message: '请选择不同的情绪，并补充其他情绪说明' });
  }
});
export const PeerFeedbackInput = EvaluationDraftInput.pick({ analysisRunId: true, reportVersion: true,
  moduleResponses: true });

export async function requireGalleryWork(classId: string, galleryId: string): Promise<IGalleryWork> {
  const item = await getGalleryWorkModel().findOne({ classId, galleryId, imageApproved: true,
    status: { $nin: ['rejected', 'withdrawn'] } }).lean().exec();
  if (!item) throw new ClassroomWriteError('作品暂不可查看');
  const author = await getClassroomParticipationModel().findOne({ classId,
    participantId: item.participantId, gallerySharing: true, artworkId: item.workId }).lean().exec();
  const work = await getWorkModel().exists({ workId: item.workId, contentHash: item.sourceHash }).exec();
  if (!author || !work) throw new ClassroomWriteError('作品已退出展示或版本已更新');
  return item;
}
export function galleryProgress(review?: IPeerReview | null) {
  if (review?.feedbackSubmittedAt) return 'completed';
  if (review?.independentSubmittedAt) return 'independent_submitted';
  return review ? 'draft' : 'not_started';
}
export function galleryDetail(item: IGalleryWork, reviewer: string, review?: IPeerReview | null) {
  const waitingEcho = { status: item.status === 'failed' ? 'failed' : 'pending' };
  const echo = item.status === 'approved' ? {
    ...JSON.parse(item.reportJson ?? '{}') as Record<string, unknown>, status: 'success',
    analysisRunId: item.analysisRunId, reportVersion: item.analysisRunId, modules: item.shownModules,
  } : waitingEcho;
  return {
    galleryId: item.galleryId, mine: item.participantId === reviewer, progress: galleryProgress(review),
    independent: review?.independent, independentSubmittedAt: review?.independentSubmittedAt,
    feedbackSubmittedAt: review?.feedbackSubmittedAt, moduleResponses: review?.moduleResponses,
    ...(review?.independentSubmittedAt ? { echo } : {}),
  };
}
export async function listGallery(p: IClassroomParticipation, cursor?: string) {
  const authors = await getClassroomParticipationModel().find({ classId: p.classId, gallerySharing: true })
    .select('participantId artworkId').lean().exec();
  const works = await getWorkModel().find({ workId: { $in: authors.map((a) => a.artworkId).filter(Boolean) } })
    .select('workId contentHash participantId').lean().exec();
  const eligible = works.filter((w) => authors.some((a) => a.participantId === w.participantId
    && a.artworkId === w.workId)).map((w) => ({ workId: w.workId, sourceHash: w.contentHash }));
  if (!eligible.length) return { items: [], emptyReason: authors.length ? 'processing' : 'no_shared_works' };
  const items = await getGalleryWorkModel().find({ classId: p.classId, imageApproved: true,
    status: { $nin: ['rejected', 'withdrawn'] }, $or: eligible,
    ...(cursor ? { galleryId: { $gt: cursor } } : {}) })
    .sort({ galleryId: 1 }).limit(GALLERY_PAGE_SIZE + 1).lean().exec();
  const page = items.slice(0, GALLERY_PAGE_SIZE);
  const reviews = await getPeerReviewModel().find({ classId: p.classId, participantId: p.participantId,
    galleryId: { $in: page.map((item) => item.galleryId) } }).lean().exec();
  return { items: page.map((item) => ({ galleryId: item.galleryId, mine: item.participantId === p.participantId,
    progress: galleryProgress(reviews.find((r) => r.galleryId === item.galleryId)) })),
  emptyReason: page.length ? undefined : 'processing',
  nextCursor: items.length > GALLERY_PAGE_SIZE ? page[page.length - 1]?.galleryId : undefined };
}
export async function ensurePeerReview(p: IClassroomParticipation, item: IGalleryWork, consent: boolean) {
  if (item.participantId === p.participantId) throw new ClassroomWriteError('不能评价自己的作品');
  const query = { classId: p.classId, participantId: p.participantId, galleryId: item.galleryId };
  const previous = await getPeerReviewModel().findOne(query).exec();
  if (previous) return previous;
  if (!consent && !p.peerConsentAt) throw new ClassroomWriteError('请先确认匿名评价用于课堂研究');
  return getPeerReviewModel().create({ ...query, assignmentId: randomUUID(), instrumentVersion: GALLERY_VERSION,
    consentVersion: GALLERY_VERSION, consentedAt: new Date() });
}
export async function saveIndependent(review: Awaited<ReturnType<typeof ensurePeerReview>>, body: unknown,
  submit: boolean): Promise<void> {
  const input = (submit ? PeerSubmitInput : PeerDraftInput).parse(body);
  if (review.independentSubmittedAt) {
    if (submit && review.independentHash === requestHash(input)) return;
    throw new ClassroomWriteError('独立评价已锁定');
  }
  review.independent = input;
  if (submit) { review.independentSubmittedAt = new Date(); review.independentHash = requestHash(input); }
  await review.save();
}
export async function savePeerFeedback(review: Awaited<ReturnType<typeof ensurePeerReview>>, item: IGalleryWork,
  body: unknown, submit: boolean): Promise<void> {
  if (!review.independentSubmittedAt) throw new ClassroomWriteError('请先提交独立感受');
  if (item.status !== 'approved') throw new ClassroomWriteError('AI 解读尚未准备好');
  const input = PeerFeedbackInput.parse(body);
  if (input.analysisRunId !== item.analysisRunId || input.reportVersion !== item.analysisRunId) {
    throw new ClassroomWriteError('REPORT_VERSION_MISMATCH');
  }
  if (review.feedbackSubmittedAt) {
    if (submit && review.feedbackHash === requestHash(input)) return;
    if (!submit) throw new ClassroomWriteError('修订评价请确认后提交');
  }
  const responses = normalizeModuleResponses(input, item.shownModules, submit);
  if (review.feedbackSubmittedAt) review.feedbackHistory.push({ moduleResponses: review.moduleResponses ?? {},
    submittedAt: review.feedbackSubmittedAt, analysisRunId: review.analysisRunId, hash: review.feedbackHash });
  review.moduleResponses = responses;
  review.analysisRunId = item.analysisRunId;
  if (submit) { review.feedbackSubmittedAt = new Date(); review.feedbackHash = requestHash(input); }
  await review.save();
}
