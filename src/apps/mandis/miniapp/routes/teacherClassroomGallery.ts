import { Router } from 'express';
import { z } from 'zod';
import { getClassroomParticipationModel, getGalleryWorkModel, getPeerReviewModel, getWorkModel }
  from '../../../../dbservice/model/GlobalInfoDBModel';
import { sendSucc, sendErr } from '../../../../shared/miniapp/middleware/response';
import { resolveImageUrl } from '../../../../util/imageUploader';
import { signOssUrl } from '../../../../util/ossUploader';
import { findAccessibleClassroom, hasClassroomCapability } from '../services/classroomAccess';
import { asyncClassroomRoute, teacherWrite, assertClassroomWritable, outsideClassroomWrite,
  ClassroomWriteError } from '../services/classroomWriteBoundary';
import { prepareGalleryWork, analyzeGalleryWork } from '../services/classroomGalleryPreparation';

const router = Router();
router.use('/:classId/gallery', asyncClassroomRoute(async (req, res, next) => {
  const teacherId = (req as typeof req & { teacherId?: string }).teacherId;
  if (!teacherId) return sendErr(res, 'Unauthorized', 401);
  const classroom = await findAccessibleClassroom(req.params.classId, teacherId, res);
  if (!classroom) return;
  if (!hasClassroomCapability(classroom, teacherId, 'manage')) return sendErr(res, 'Forbidden', 403);
  res.locals.galleryTeacherId = teacherId;
  next();
}));
router.get('/:classId/gallery', asyncClassroomRoute(async (req, res) => {
  const classId = req.params.classId;
  const authors = await getClassroomParticipationModel().find({ classId, gallerySharing: true })
    .select('participantId classroomCode artworkId').lean().exec();
  const works = await getWorkModel().find({ workId: { $in: authors.map((a) => a.artworkId).filter(Boolean) } })
    .select('workId contentHash images').lean().exec();
  const items = await getGalleryWorkModel().find({ classId }).lean().exec();
  const counts = await getPeerReviewModel().aggregate<{ _id: string; independent: number; completed: number }>([
    { $match: { classId } }, { $group: { _id: '$galleryId',
      independent: { $sum: { $cond: ['$independentSubmittedAt', 1, 0] } },
      completed: { $sum: { $cond: ['$feedbackSubmittedAt', 1, 0] } } } },
  ]).exec();
  sendSucc(res, authors.map((a) => {
    const work = works.find((w) => w.workId === a.artworkId);
    return { ...a, sourceUrl: work ? resolveImageUrl(work.images[0]?.url ?? '') : undefined,
      versions: items.filter((i) => i.participantId === a.participantId).map((item) => ({ ...item,
        imageKey: undefined, imageUrl: signOssUrl(item.imageKey),
        current: item.workId === work?.workId && item.sourceHash === work?.contentHash,
        counts: counts.find((c) => c._id === item.galleryId) ?? { independent: 0, completed: 0 },
      })) };
  }));
}));
router.post('/:classId/gallery/prepare', teacherWrite(async (req, res) => {
  await assertClassroomWritable(req.params.classId);
  const input = z.object({ participantId: z.string(), dataUrl: z.string().min(64) }).strict().parse(req.body);
  const prepared = await prepareGalleryWork(req.params.classId, input.participantId, input.dataUrl);
  if (prepared.created) outsideClassroomWrite(() => { void analyzeGalleryWork(prepared.galleryId); });
  sendSucc(res, { galleryId: prepared.galleryId });
}));
router.post('/:classId/gallery/:galleryId/review', teacherWrite(async (req, res) => {
  await assertClassroomWritable(req.params.classId);
  const input = z.object({ approved: z.boolean(), imageOnly: z.boolean().default(false) }).strict().parse(req.body);
  const item = await getGalleryWorkModel().findOne({
    classId: req.params.classId, galleryId: req.params.galleryId,
  }).exec();
  if (!item || item.status === 'withdrawn'
    || (!input.imageOnly && !['review', 'approved', 'rejected'].includes(item.status))) {
    throw new ClassroomWriteError('请等待图片分析完成');
  }
  if (input.approved && item.errorCode === 'POTENTIAL_IDENTIFYING_TEXT') {
    throw new ClassroomWriteError('图片存在身份线索，请处理后重新上传');
  }
  if (input.approved) await getGalleryWorkModel().updateMany({ classId: item.classId, workId: item.workId,
    galleryId: { $ne: item.galleryId }, imageApproved: true },
  { $set: { status: 'withdrawn', imageApproved: false } }).exec();
  item.imageApproved = input.approved;
  if (!input.imageOnly || !input.approved) item.status = input.approved ? 'approved' : 'rejected';
  item.reviewerId = res.locals.galleryTeacherId as string; item.reviewedAt = new Date();
  await item.save();
  sendSucc(res, { status: item.status });
}));
export default router;
