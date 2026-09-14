import type { Router, Request, Response, RequestHandler } from 'express';
import type { HydratedDocument } from 'mongoose';
import { z } from 'zod';
import { getClassroomModel, getPeerReviewModel, getGalleryWorkModel }
  from '../../../../dbservice/model/GlobalInfoDBModel';
import { signOssUrl } from '../../../../util/ossUploader';
import { sendSucc } from '../../../../shared/miniapp/middleware/response';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';
import { GALLERY_VERSION } from '../../entity/classroomGallery.entity';
import { asyncClassroomRoute, ClassroomWriteError } from '../services/classroomWriteBoundary';
import { requireGalleryWork, listGallery, galleryDetail, ensurePeerReview, saveIndependent, savePeerFeedback,
  PeerDraftInput, PeerSubmitInput, PeerFeedbackInput }
  from '../services/classroomGallery';
import { requestHash } from '../services/classroomReflection';

type Participant = HydratedDocument<IClassroomParticipation>;
type Write = (handler: (req: Request, res: Response) => Promise<void>) => RequestHandler;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_RECEIPTS = 500;
function requestKey(req: Request): string {
  return z.string().min(1).max(120).parse(req.headers['idempotency-key']);
}
export function registerGalleryRoutes(router: Router, get: (req: Request) => Participant, write: Write) {
  router.use('/gallery', asyncClassroomRoute((req, _res, next) => {
    if (!get(req).consentedAt) throw new ClassroomWriteError('请先完成课堂参与说明');
    next();
  }));
  router.get('/gallery', asyncClassroomRoute(async (req, res) => {
    const p = get(req);
    if (!p.consentedAt) throw new ClassroomWriteError('请先完成课堂参与说明');
    const cursor = z.string().uuid().optional().parse(req.query.cursor);
    const classroom = await getClassroomModel().findOne({ classId: p.classId }).lean().exec();
    sendSucc(res, { ...await listGallery(p, cursor), sharing: Boolean(p.gallerySharing),
      readOnly: classroom?.status === 'closed',
      deadline: classroom?.status === 'closing' ? classroom.gracePeriodEndsAt : undefined });
  }));
  router.post('/gallery/sharing', write(async (req, res) => {
    const p = get(req);
    const { sharing } = z.object({ sharing: z.boolean() }).strict().parse(req.body);
    const key = requestKey(req);
    const previous = p.galleryConsentEvents?.find((event) => event.requestKey === key);
    if (previous && previous.sharing !== sharing) throw new ClassroomWriteError('IDEMPOTENCY_CONFLICT');
    if (previous) { sendSucc(res, { sharing: p.gallerySharing }); return; }
    if (!p.consentedAt) throw new ClassroomWriteError('请先完成课堂参与说明');
    p.gallerySharing = sharing; p.galleryConsentVersion = GALLERY_VERSION; p.galleryConsentAt = new Date();
    p.galleryConsentEvents ??= [];
    p.galleryConsentEvents.push({ sharing, at: p.galleryConsentAt, version: GALLERY_VERSION, requestKey: key });
    if (!sharing) await getGalleryWorkModel().updateMany({ classId: p.classId, participantId: p.participantId },
      { $set: { status: 'withdrawn', imageApproved: false } }).exec();
    await p.save();
    sendSucc(res, { sharing });
  }));
  registerGalleryReads(router, get);
  registerGalleryWrites(router, get, write);
}
function registerGalleryReads(router: Router, get: (req: Request) => Participant) {
  router.get('/gallery/:galleryId', asyncClassroomRoute(async (req, res) => {
    const p = get(req);
    const item = await requireGalleryWork(p.classId, req.params.galleryId);
    const review = await getPeerReviewModel().findOne({ classId: p.classId, galleryId: item.galleryId,
      participantId: p.participantId }).lean().exec();
    sendSucc(res, { ...galleryDetail(item, p.participantId, review), peerConsented: Boolean(p.peerConsentAt) });
  }));
  router.get('/gallery/:galleryId/image', asyncClassroomRoute(async (req, res) => {
    const p = get(req);
    const item = await requireGalleryWork(p.classId, req.params.galleryId);
    const image = await fetch(signOssUrl(item.imageKey), { signal: AbortSignal.timeout(15000) });
    if (!image.ok) throw new ClassroomWriteError('图片暂时无法读取');
    const buffer = Buffer.from(await image.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) throw new ClassroomWriteError('INVALID_IMAGE_SIZE');
    // Check authorization again after storage I/O; never expose the underlying private object URL.
    await requireGalleryWork(p.classId, item.galleryId);
    res.set('Content-Type', 'image/jpeg').set('Cache-Control', 'no-store, private').send(buffer);
  }));
}
function registerGalleryWrites(router: Router, get: (req: Request) => Participant, write: Write) {
  for (const stage of ['independent', 'feedback'] as const) {
    router.post(`/gallery/:galleryId/${stage}`, write(async (req, res) => {
      const p = get(req);
      const input = z.object({ submit: z.boolean(), consent: z.boolean(), answers: z.unknown() })
        .strict().parse(req.body);
      const key = requestKey(req);
      const independentSchema = input.submit ? PeerSubmitInput : PeerDraftInput;
      const answers = (stage === 'feedback' ? PeerFeedbackInput : independentSchema).parse(input.answers);
      if (!p.consentedAt) throw new ClassroomWriteError('请先完成课堂参与说明');
      const item = await requireGalleryWork(p.classId, req.params.galleryId);
      const review = stage === 'independent' ? await ensurePeerReview(p, item, input.consent)
        : await getPeerReviewModel().findOne({ classId: p.classId, participantId: p.participantId,
          galleryId: item.galleryId }).exec();
      if (!review) throw new ClassroomWriteError('请先提交独立感受');
      const hash = requestHash({ stage, ...input });
      const previous = review.requestReceipts.find((receipt) => receipt.key === key);
      if (previous && previous.hash !== hash) throw new ClassroomWriteError('IDEMPOTENCY_CONFLICT');
      if (previous) { sendSucc(res, galleryDetail(item, p.participantId, review)); return; }
      if (review.requestReceipts.length >= MAX_REQUEST_RECEIPTS) throw new ClassroomWriteError('保存次数过多');
      review.requestReceipts.push({ key, hash });
      if (stage === 'independent') await saveIndependent(review, answers, input.submit);
      else await savePeerFeedback(review, item, answers, input.submit);
      if (!p.peerConsentAt && input.consent) { p.peerConsentAt = new Date(); await p.save(); }
      sendSucc(res, { ...galleryDetail(item, p.participantId, review), peerConsented: Boolean(p.peerConsentAt) });
    }));
  }
}
