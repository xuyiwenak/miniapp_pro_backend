import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import { z } from 'zod';
import {
  getClassroomArtworkCorrectionAuditModel,
  getClassroomParticipationModel,
  getWorkModel,
} from '../../../../dbservice/model/GlobalInfoDBModel';
import { sendErr, sendSucc } from '../../../../shared/miniapp/middleware/response';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';
import { createClassroomArtwork, replaceClassroomArtwork } from '../services/classroomArtwork';
import { findAccessibleClassroom } from '../services/classroomAccess';
import { isResearchRecordComplete } from '../services/classroomResearch';
import { startClassroomArtworkAnalysis } from '../services/classroomArtworkAnalysis/service';

const router = Router({ mergeParams: true });
const CorrectionSchema = z.object({
  dataUrl: z.string().min(64),
  correctionType: z.enum(['late_upload', 'replace']),
  reason: z.string().trim().min(3).max(300),
});
type CorrectionData = z.infer<typeof CorrectionSchema>;
type ParticipationDocument = HydratedDocument<IClassroomParticipation>;

function getTeacherId(req: Request & { teacherId?: string }, res: Response): string | null {
  if (req.teacherId) return req.teacherId;
  sendErr(res, 'Unauthorized', 401);
  return null;
}

function getIdempotencyKey(req: Request, res: Response): string | null {
  const key = String(req.headers['idempotency-key'] ?? '').trim();
  if (key && key.length <= 120) return key;
  sendErr(res, 'Missing or invalid idempotency key', 400);
  return null;
}

async function existingCorrection(classId: string, key: string): Promise<Record<string, unknown> | null> {
  const Audit = getClassroomArtworkCorrectionAuditModel();
  const audit = await Audit.findOne({ classId, idempotencyKey: key }).lean().exec();
  if (!audit) return null;
  return {
    correctionId: audit.correctionId,
    artworkId: audit.artworkId,
    classroomCode: audit.classroomCode,
  };
}

router.get('/', async (req: Request<{ classId: string }>, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classId = String(req.params.classId ?? '');
  if (!(await findAccessibleClassroom(classId, teacherId, res))) return;
  const Audit = getClassroomArtworkCorrectionAuditModel();
  const list = await Audit.find({ classId })
    .sort({ createdAt: -1 })
    .select('-participantId -previousImageUrl -replacementImageUrl')
    .lean()
    .exec();
  sendSucc(res, { list });
});

async function buildCorrectionArtwork(
  classId: string,
  participant: ParticipationDocument,
  input: CorrectionData
) {
  if (!participant.artworkId) {
    return createLateArtwork(
      classId,
      participant.participantId,
      input.dataUrl,
      input.reason
    );
  }
  return replaceClassroomArtwork(
    {
      classId,
      participantId: participant.participantId,
      dataUrl: input.dataUrl,
      uploaderRole: 'teacher',
      uploadReason: input.reason,
    },
    participant.artworkId
  );
}

async function persistCorrection(
  participant: ParticipationDocument,
  teacherId: string,
  key: string,
  input: CorrectionData,
  result: Awaited<ReturnType<typeof buildCorrectionArtwork>>
): Promise<string> {
  participant.artworkId = result.artworkId;
  participant.artworkStatus = 'teacher_uploaded';
  participant.uploadReason = input.reason;
  participant.researchRecordComplete = isResearchRecordComplete(participant);
  await participant.save();
  const correctionId = await saveCorrectionAudit({
    classId: participant.classId,
    classroomCode: participant.classroomCode,
    participantId: participant.participantId,
    teacherId,
    key,
    reason: input.reason,
    correctionType: input.correctionType,
    ...result,
  });
  if (participant.postAssessment.status === 'submitted') {
    void startClassroomArtworkAnalysis(result.artworkId);
  }
  return correctionId;
}

router.post('/:classroomCode', async (
  req: Request<{ classId: string; classroomCode: string }>,
  res
) => {
  const teacherId = getTeacherId(req, res);
  const key = getIdempotencyKey(req, res);
  if (!teacherId || !key) return;
  const classId = String(req.params.classId ?? '');
  const repeated = await existingCorrection(classId, key);
  if (repeated) return sendSucc(res, repeated);
  const classroom = await findAccessibleClassroom(classId, teacherId, res);
  const parsed = CorrectionSchema.safeParse(req.body);
  if (!classroom || !parsed.success) {
    if (classroom) sendErr(res, 'Invalid artwork correction', 400);
    return;
  }
  if (!['closing', 'closed'].includes(classroom.status)) {
    sendErr(res, 'Research correction is available after classroom closing', 409);
    return;
  }
  const Participation = getClassroomParticipationModel();
  const participant = await Participation.findOne({
    classId,
    classroomCode: req.params.classroomCode,
  }).exec();
  if (!participant) return sendErr(res, 'Classroom code not found', 404);
  const hasArtwork = Boolean(participant.artworkId);
  if (hasArtwork !== (parsed.data.correctionType === 'replace')) {
    return sendErr(res, 'Correction type does not match the current artwork state', 409);
  }
  try {
    const result = await buildCorrectionArtwork(classId, participant, parsed.data);
    const correctionId = await persistCorrection(participant, teacherId, key, parsed.data, result);
    sendSucc(res, { correctionId, artworkId: result.artworkId, classroomCode: participant.classroomCode });
  } catch (error) {
    sendErr(res, error instanceof Error ? error.message : 'Artwork correction failed', 400);
  }
});

async function createLateArtwork(
  classId: string,
  participantId: string,
  dataUrl: string,
  reason: string
): Promise<{
  artworkId: string;
  replacementImageUrl: string;
  replacementContentHash: string;
}> {
  const artworkId = await createClassroomArtwork({
    classId,
    participantId,
    dataUrl,
    uploaderRole: 'teacher',
    uploadReason: reason,
  });
  const Work = getWorkModel();
  const work = await Work.findOne({ workId: artworkId }).lean().exec();
  if (!work?.images[0]?.url || !work.contentHash) throw new Error('ARTWORK_SAVE_INCOMPLETE');
  return {
    artworkId,
    replacementImageUrl: work.images[0].url,
    replacementContentHash: work.contentHash,
  };
}

type CorrectionAuditInput = {
  classId: string;
  classroomCode: string;
  participantId: string;
  teacherId: string;
  key: string;
  reason: string;
  correctionType: 'late_upload' | 'replace';
  artworkId: string;
  previousImageUrl?: string;
  replacementImageUrl: string;
  previousContentHash?: string;
  replacementContentHash: string;
};

async function saveCorrectionAudit(input: CorrectionAuditInput): Promise<string> {
  const correctionId = randomUUID();
  const Audit = getClassroomArtworkCorrectionAuditModel();
  await Audit.create({
    correctionId,
    classId: input.classId,
    participantId: input.participantId,
    classroomCode: input.classroomCode,
    correctedByTeacherId: input.teacherId,
    idempotencyKey: input.key,
    correctionType: input.correctionType,
    reason: input.reason,
    artworkId: input.artworkId,
    previousImageUrl: input.previousImageUrl,
    replacementImageUrl: input.replacementImageUrl,
    previousContentHash: input.previousContentHash,
    replacementContentHash: input.replacementContentHash,
  });
  return correctionId;
}

export default router;
