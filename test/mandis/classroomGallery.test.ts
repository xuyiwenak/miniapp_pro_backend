import { strict as assert } from 'assert';
import { randomUUID } from 'crypto';
import { model, models } from 'mongoose';
import sinon from 'sinon';
import * as db from '../../src/dbservice/model/GlobalInfoDBModel';
import { PeerReviewSchema, type IPeerReview, type IGalleryWork }
  from '../../src/apps/mandis/entity/classroomGallery.entity';
import type { IClassroomParticipation } from '../../src/apps/mandis/entity/classroomParticipation.entity';
import { PeerSubmitInput, galleryDetail, ensurePeerReview, requireGalleryWork, saveIndependent, savePeerFeedback }
  from '../../src/apps/mandis/miniapp/services/classroomGallery';
import { galleryExportRows } from '../../src/apps/mandis/miniapp/services/classroomGalleryExport';

const ReviewModel = models.GalleryTestReview ?? model<IPeerReview>('GalleryTestReview', PeerReviewSchema);
const runId = randomUUID();
const item: IGalleryWork = { galleryId: randomUUID(), classId: 'class', participantId: 'author',
  workId: 'work', sourceHash: 'source-hash', imageKey: 'private-key', contentHash: 'same-input-for-ai-and-person',
  status: 'approved', imageApproved: true, analysisRunId: runId, reportJson: JSON.stringify({ summary: 'AI text' }),
  shownModules: ['color', 'suggestion'] };
const answers = { valence: 6, arousal: 4, dominance: 5, emotions: ['calm'], confidence: 6 };
function reviewDocument() {
  const document = new ReviewModel({ assignmentId: randomUUID(), classId: 'class', galleryId: item.galleryId,
    participantId: 'viewer', instrumentVersion: 'classroom-gallery-v1', consentVersion: 'classroom-gallery-v1',
    consentedAt: new Date(), requestReceipts: [] });
  sinon.stub(document, 'save').callsFake(async () => document);
  return document;
}
function query<T>(value: T) {
  return { lean: () => ({ exec: async () => value }), exec: async () => value };
}
describe('classroom gallery independent review boundaries', () => {
  afterEach(() => sinon.restore());
  it('requires complete integer VAD, unique emotions and confidence before independent submission', () => {
    assert.equal(PeerSubmitInput.safeParse(answers).success, true);
    for (const patch of [{ valence: undefined }, { arousal: 0 }, { dominance: 10 }, { confidence: 2.5 },
      { emotions: [] }, { emotions: ['calm', 'calm'] }, { emotions: ['other'] }]) {
      assert.equal(PeerSubmitInput.safeParse({ ...answers, ...patch }).success, false);
    }
  });
  it('does not serialize AI or private image identifiers before independent submission', () => {
    const detail = galleryDetail(item, 'viewer');
    assert.equal('echo' in detail, false);
    for (const value of ['AI text', 'private-key', 'source-hash', 'author', runId]) {
      assert.equal(JSON.stringify(detail).includes(value), false);
    }
  });
  it('locks independent answers while allowing an identical final retry', async () => {
    const review = reviewDocument();
    await saveIndependent(review, { emotions: ['calm'] }, false);
    assert.equal(review.independentSubmittedAt, undefined);
    await saveIndependent(review, answers, true);
    const submittedAt = review.independentSubmittedAt?.getTime();
    await saveIndependent(review, answers, true);
    assert.equal(review.independentSubmittedAt?.getTime(), submittedAt);
    await assert.rejects(saveIndependent(review, { ...answers, valence: 1 }, true), /独立评价已锁定/);
    await assert.rejects(saveIndependent(review, answers, false), /独立评价已锁定/);
    assert.equal(galleryDetail(item, 'viewer', review).echo?.status, 'success');
  });
  it('keeps AI locked until the teacher approves text, without losing independent answers', async () => {
    const review = reviewDocument(); await saveIndependent(review, answers, true);
    const waiting = galleryDetail({ ...item, status: 'preparing' }, 'viewer', review);
    assert.equal(waiting.echo?.status, 'pending');
    assert.equal(JSON.stringify(waiting).includes('AI text'), false);
    assert.ok(waiting.independentSubmittedAt);
  });
  it('rejects self-review and missing explicit research consent', async () => {
    await assert.rejects(ensurePeerReview({ participantId: 'author' } as IClassroomParticipation, item, true),
      /不能评价自己的作品/);
    sinon.stub(db, 'getPeerReviewModel').returns({ findOne: () => query(null) } as unknown as ReturnType<typeof db.getPeerReviewModel>);
    await assert.rejects(ensurePeerReview({ participantId: 'viewer', classId: 'class' } as IClassroomParticipation,
      item, false), /请先确认/);
  });
  it('checks current author sharing and original version on every read', async () => {
    sinon.stub(db, 'getGalleryWorkModel').returns({ findOne: () => query(item) } as unknown as ReturnType<typeof db.getGalleryWorkModel>);
    const authorQuery = sinon.stub().returns(query(null));
    sinon.stub(db, 'getClassroomParticipationModel').returns({ findOne: authorQuery } as unknown as ReturnType<typeof db.getClassroomParticipationModel>);
    const workQuery = sinon.stub().returns(query({ _id: 'work' }));
    sinon.stub(db, 'getWorkModel').returns({ exists: workQuery } as unknown as ReturnType<typeof db.getWorkModel>);
    await assert.rejects(requireGalleryWork('class', item.galleryId), /退出展示/);
    authorQuery.returns(query({ participantId: 'author' }));
    assert.equal((await requireGalleryWork('class', item.galleryId)).contentHash, item.contentHash);
    workQuery.returns(query(null));
    await assert.rejects(requireGalleryWork('class', item.galleryId), /版本已更新/);
    assert.equal(authorQuery.firstCall.args[0].gallerySharing, true);
  });
  it('requires each displayed module and exact AI version for final feedback', async () => {
    const review = reviewDocument();
    const feedback = { analysisRunId: runId, reportVersion: runId, moduleResponses: {
      color: { responseCode: 'strongly_matches', missingReason: null },
      suggestion: { responseCode: 'very_helpful', missingReason: null },
    } };
    await assert.rejects(savePeerFeedback(review, item, feedback, true), /请先提交独立感受/);
    await saveIndependent(review, answers, true);
    await assert.rejects(savePeerFeedback(review, item, { ...feedback, moduleResponses: {} }, true), /MODULE_RESPONSE_REQUIRED/);
    await assert.rejects(savePeerFeedback(review, item, { ...feedback, reportVersion: 'wrong' }, true), /REPORT_VERSION_MISMATCH/);
    await savePeerFeedback(review, item, feedback, true);
    assert.ok(review.feedbackSubmittedAt);
    assert.ok(review.independentSubmittedAt);
    await savePeerFeedback(review, item, { ...feedback, moduleResponses: { ...feedback.moduleResponses,
      color: { responseCode: 'does_not_match', missingReason: null } } }, true);
    assert.equal(review.feedbackHistory.length, 1);
    assert.equal(review.feedbackHistory[0].moduleResponses?.color?.responseCode, 'strongly_matches');
    assert.equal(review.independent?.valence, 6);
  });
  it('exports author and peer instruments separately and omits sensitive comments', async () => {
    const review = reviewDocument(); await saveIndependent(review, { ...answers, comment: 'private text' }, true);
    const rows = galleryExportRows([item], [review], [{ participantId: 'author', gallerySharing: false,
      artworkId: 'work' } as IClassroomParticipation]);
    assert.equal(rows.peer_independent[0].eligibility, 'excluded_withdrawn');
    assert.equal(JSON.stringify(rows).includes('private text'), false);
    assert.equal(rows.peer_independent[0].valence, 6);
  });
});
