import { createHash, randomUUID } from 'crypto';
import sharp from 'sharp';
import { getGalleryWorkModel, getClassroomParticipationModel, getWorkModel }
  from '../../../../dbservice/model/GlobalInfoDBModel';
import { uploadToOss, signOssUrl } from '../../../../util/ossUploader';
import { checkImage } from '../../../../util/wxContentSecurity';
import { normalizeClassroomImage } from './classroomArtwork';
import { ClassroomWriteError, withClassroomWrite, assertClassroomWritable } from './classroomWriteBoundary';
import { analyzeClassroomArtworkImage } from './classroomArtworkAnalysis/qwenProvider';
import { mapEducationAnalysisToAudit } from './classroomArtworkAnalysis/mapper';

export async function prepareGalleryWork(classId: string, participantId: string, dataUrl: string) {
  const author = await getClassroomParticipationModel().findOne({ classId, participantId, gallerySharing: true })
    .lean().exec();
  const work = author?.artworkId ? await getWorkModel().findOne({ workId: author.artworkId }).lean().exec() : null;
  if (!work?.contentHash) throw new ClassroomWriteError('作品未到或作者未同意展示');
  const normalized = await normalizeClassroomImage(dataUrl);
  const buffer = await sharp(normalized.buffer).jpeg({ quality: 92 }).toBuffer();
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const previous = await getGalleryWorkModel().findOne({ classId, workId: work.workId,
    sourceHash: work.contentHash, contentHash }).lean().exec();
  if (previous) {
    if (previous.status === 'failed') {
      await getGalleryWorkModel().updateOne({ galleryId: previous.galleryId },
        { $set: { status: 'preparing' }, $unset: { errorCode: 1 } }).exec();
      return { galleryId: previous.galleryId, created: true };
    }
    if (previous.status === 'withdrawn') {
      await getGalleryWorkModel().updateOne({ galleryId: previous.galleryId },
        { $set: { status: previous.reportJson ? 'review' : 'preparing', imageApproved: false } }).exec();
      return { galleryId: previous.galleryId, created: !previous.reportJson };
    }
    if (previous.status === 'rejected') {
      throw new ClassroomWriteError('该图片版本已停用，请修正图片后重新提交');
    }
    return { galleryId: previous.galleryId, created: false };
  }
  if (!(await checkImage(buffer, 'image/jpeg')).safe) throw new ClassroomWriteError('UNSAFE_IMAGE');
  const galleryId = randomUUID();
  const imageKey = await uploadToOss(buffer, `gallery/${galleryId}.jpg`, 'image/jpeg', true);
  await assertClassroomWritable(classId);
  await getGalleryWorkModel().create({ galleryId, classId, participantId, workId: work.workId,
    sourceHash: work.contentHash, imageKey, contentHash,
    status: 'preparing', shownModules: [] });
  return { galleryId, created: true };
}
export async function analyzeGalleryWork(galleryId: string): Promise<void> {
  const item = await getGalleryWorkModel().findOne({ galleryId }).lean().exec();
  if (!item) return;
  try {
    const result = await analyzeClassroomArtworkImage(signOssUrl(item.imageKey), galleryId);
    const analysisRunId = randomUUID();
    const audit = mapEducationAnalysisToAudit(analysisRunId, galleryId, item.classId, undefined,
      item.contentHash, result.modelVersion, new Date(), result.output);
    await withClassroomWrite(item.classId, async () => {
      await assertClassroomWritable(item.classId);
      await getGalleryWorkModel().updateOne({ galleryId, status: 'preparing' }, { $set: {
        status: 'review', analysisRunId, reportJson: audit.reportJson, shownModules: audit.shownModules,
        modelVersion: result.modelVersion, promptVersion: audit.promptVersion, scaleVersion: audit.scaleVersion,
        errorCode: audit.embeddedText?.containsPotentialPii ? 'POTENTIAL_IDENTIFYING_TEXT' : undefined,
        ...(audit.embeddedText?.containsPotentialPii ? { imageApproved: false } : {}),
      } }).exec();
    });
  } catch {
    await withClassroomWrite(item.classId, async () => {
      await assertClassroomWritable(item.classId);
      await getGalleryWorkModel().updateOne({ galleryId, status: 'preparing' },
        { $set: { status: 'failed', errorCode: 'GALLERY_ANALYSIS_FAILED' } }).exec();
    }).catch(() => { /* A sealed classroom never accepts late analysis writes. */ });
  }
}
