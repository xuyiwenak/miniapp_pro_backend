import type { IGalleryWork, IPeerReview } from '../../entity/classroomGallery.entity';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';
import type { IWork } from '../../../../entity/work.entity';
import { studyId } from './classroomReflectionExport';

export function galleryExportRows(
  items: IGalleryWork[], reviews: IPeerReview[], participants: IClassroomParticipation[], works?: IWork[],
) {
  return {
    gallery_versions: items.map((item) => ({ galleryId: item.galleryId, workId: item.workId,
      sourceHash: item.sourceHash, displayedImageHash: item.contentHash,
      status: item.status, imageApproved: Boolean(item.imageApproved), analysisRunId: item.analysisRunId ?? null,
      modelVersion: item.modelVersion ?? null, promptVersion: item.promptVersion ?? null,
      scaleVersion: item.scaleVersion ?? null, reviewedAt: item.reviewedAt?.toISOString() ?? null })),
    peer_independent: reviews.map((review) => ({
      assignmentId: review.assignmentId, galleryId: review.galleryId,
      reviewerStudyId: studyId({ classId: review.classId, participantId: review.participantId }),
      instrumentVersion: review.instrumentVersion, consentVersion: review.consentVersion,
      consentedAt: review.consentedAt.toISOString(), submittedAt: review.independentSubmittedAt?.toISOString() ?? null,
      valence: review.independent?.valence ?? null, arousal: review.independent?.arousal ?? null,
      dominance: review.independent?.dominance ?? null, emotions: review.independent?.emotions.join('|') ?? null,
      confidence: review.independent?.confidence ?? null,
      status: review.independentSubmittedAt ? 'submitted' : 'draft',
      eligibility: reviewEligibility(review, items, participants, works),
    })),
    peer_ai_feedback: reviews.flatMap((review) => [...(review.feedbackHistory ?? []), {
      moduleResponses: review.moduleResponses, submittedAt: review.feedbackSubmittedAt,
      analysisRunId: review.analysisRunId,
    }].flatMap((snapshot, index) => Object.entries(snapshot.moduleResponses ?? {}).map(([code, value]) => ({
      assignmentId: review.assignmentId, galleryId: review.galleryId, analysisRunId: review.analysisRunId ?? null,
      revision: index + 1, isCurrent: index === (review.feedbackHistory ?? []).length,
      moduleCode: code, responseCode: value?.responseCode ?? null, missingReason: value?.missingReason ?? null,
      submittedAt: snapshot.submittedAt?.toISOString() ?? null,
      status: snapshot.submittedAt ? 'submitted' : 'draft',
    })))),
    gallery_consent: participants.flatMap((p) => (p.galleryConsentEvents ?? []).map((event) => ({
      participantStudyId: studyId(p), sharing: event.sharing, version: event.version, at: event.at.toISOString(),
    }))),
  };
}
function reviewEligibility(review: IPeerReview, items: IGalleryWork[], participants: IClassroomParticipation[],
  works?: IWork[]) {
  const item = items.find((entry) => entry.galleryId === review.galleryId);
  const author = participants.find((p) => p.participantId === item?.participantId);
  if (!item || !author?.gallerySharing || item.status === 'withdrawn') return 'excluded_withdrawn';
  if (item.status === 'rejected' || !item.imageApproved) return 'excluded_unavailable';
  if (author.artworkId !== item.workId) return 'excluded_replaced';
  if (works && !works.some((work) => work.workId === item.workId && work.contentHash === item.sourceHash)) {
    return 'excluded_replaced';
  }
  return review.independentSubmittedAt ? 'independent_submitted' : 'incomplete';
}
