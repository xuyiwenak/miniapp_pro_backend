import { Router, type NextFunction, type Request, type Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import { z } from 'zod';
import {
  getClassroomModel,
  getClassroomParticipationModel,
  getWorkModel,
} from '../../../../dbservice/model/GlobalInfoDBModel';
import { sendErr, sendSucc } from '../../../../shared/miniapp/middleware/response';
import type { IClassroom } from '../../entity/classroom.entity';
import type { IClassroomParticipation, IAssessmentRecord } from '../../entity/classroomParticipation.entity';
import {
  countAssessmentAnswers,
  generateClassroomCode,
  generateParticipantId,
  getStageAfterArtworkUpload,
  hasCompleteAssessment,
  hashToken,
  isResearchRecordComplete,
  isResumeAllowed,
  PANAS_ITEM_CODES,
  VAD_ITEM_CODES,
} from '../services/classroomResearch';
import { createClassroomArtwork } from '../services/classroomArtwork';
import { startClassroomArtworkAnalysis } from '../services/classroomArtworkAnalysis/service';
import { resolveImageUrl } from '../../../../util/imageUploader';

const router = Router();
const MAX_CODE_ATTEMPTS = 12;
const PARTICIPATION_TOKEN_HEADER = 'x-participation-token';

type ParticipationDocument = HydratedDocument<IClassroomParticipation>;
type ParticipationRequest = Request & { participation?: ParticipationDocument };

const StartSchema = z.object({
  accessCode: z.string().min(8),
  resumeToken: z.string().min(32).max(128),
});
const ConsentSchema = z.object({ consentVersion: z.string().min(1).max(80) });
export const ClassroomParticipantProfileSchema = z.object({
  gender: z.enum(['male', 'female']),
  artExperience: z.enum(['none', 'occasional', 'regular']).optional(),
});
const DraftSchema = z.object({
  page: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  locale: z.enum(['zh-CN', 'en']),
  vad: z.record(z.string(), z.number()).default({}),
  panas: z.record(z.string(), z.number()).default({}),
  clientRecovered: z.boolean().default(false),
});
const SubmitSchema = DraftSchema.extend({
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 1000),
});
const UploadSchema = z.object({ dataUrl: z.string().min(64) });
const FeedbackSchema = z.object({
  fit: z.enum(['mostly', 'partly', 'not_really', 'unsure']),
  comment: z.string().max(300).optional(),
  allowCommentUse: z.boolean(),
  allowArtworkUse: z.boolean(),
});

async function createUniqueClassroomCode(classId: string): Promise<string> {
  const Participation = getClassroomParticipationModel();
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateClassroomCode();
    const exists = await Participation.exists({
      classId,
      classroomCode: code,
    }).exec();
    if (!exists) return code;
  }
  throw new Error('CLASSROOM_CODE_EXHAUSTED');
}

async function closeExpiredClassroom(classId: string): Promise<void> {
  const Classroom = getClassroomModel();
  const result = await Classroom.updateOne(
    { classId, status: 'closing', gracePeriodEndsAt: { $lte: new Date() } },
    {
      $set: {
        status: 'closed',
        finalizedAt: new Date(),
        finalizedBy: 'system',
      },
    }
  ).exec();
  if (result.modifiedCount === 0) return;
  const Participation = getClassroomParticipationModel();
  await Participation.updateMany(
    { classId, artworkId: { $exists: false } },
    { $set: { artworkStatus: 'not_provided' } }
  ).exec();
}

async function requireParticipation(req: ParticipationRequest, res: Response, next: NextFunction): Promise<void> {
  const token = String(req.headers[PARTICIPATION_TOKEN_HEADER] ?? '').trim();
  if (!token) {
    sendErr(res, 'Missing participation token', 401);
    return;
  }
  const Participation = getClassroomParticipationModel();
  const participation = await Participation.findOne({
    resumeTokenHash: hashToken(token),
  }).exec();
  if (!participation) {
    sendErr(res, 'Invalid participation token', 401);
    return;
  }
  await closeExpiredClassroom(participation.classId);
  const Classroom = getClassroomModel();
  const classroom = await Classroom.findOne({ classId: participation.classId }).lean().exec();
  const mayResume = classroom && (isResumeAllowed(classroom) || participation.participantFlowCompleted);
  if (!mayResume) {
    sendErr(res, 'Classroom is closed', 410);
    return;
  }
  participation.lastActiveAt = new Date();
  await participation.save();
  req.participation = participation;
  next();
}

function getParticipation(req: ParticipationRequest): ParticipationDocument {
  if (!req.participation) throw new Error('Participation middleware was not applied');
  return req.participation;
}

function getIdempotencyKey(req: Request, res: Response): string | null {
  const value = String(req.headers['idempotency-key'] ?? '').trim();
  if (!value || value.length > 120) {
    sendErr(res, 'Missing or invalid idempotency key', 400);
    return null;
  }
  return value;
}

function getAssessment(participation: IClassroomParticipation, timepoint: 'pre' | 'post'): IAssessmentRecord {
  return timepoint === 'pre' ? participation.preAssessment : participation.postAssessment;
}

function validateScoreRanges(vad: Record<string, number>, panas: Record<string, number>): boolean {
  const vadValid = Object.entries(vad).every(
    ([key, value]) =>
      (VAD_ITEM_CODES as readonly string[]).includes(key) && Number.isInteger(value) && value >= 1 && value <= 9
  );
  const panasValid = Object.entries(panas).every(
    ([key, value]) =>
      (PANAS_ITEM_CODES as readonly string[]).includes(key) && Number.isInteger(value) && value >= 1 && value <= 5
  );
  return vadValid && panasValid;
}

function assignAssessmentDraft(assessment: IAssessmentRecord, input: z.infer<typeof DraftSchema>): void {
  assessment.status = 'in_progress';
  assessment.currentPage = input.page;
  assessment.vad = input.vad;
  assessment.panas = input.panas;
  assessment.locale = input.locale;
  assessment.clientRecovered = input.clientRecovered;
  assessment.answeredCount = countAssessmentAnswers(input.vad, input.panas);
  assessment.startedAt ??= new Date();
}

async function triggerAnalysisIfReady(participation: IClassroomParticipation): Promise<void> {
  if (!participation.artworkId || participation.postAssessment.status !== 'submitted') return;
  await startClassroomArtworkAnalysis(participation.artworkId);
}

function mapParticipationState(participation: IClassroomParticipation): Record<string, unknown> {
  return {
    participantId: participation.participantId,
    classroomCode: participation.artworkStatus === 'teacher_upload_pending' ? participation.classroomCode : undefined,
    currentStage: participation.currentStage,
    consented: Boolean(participation.consentedAt),
    profileCompleted: Boolean(participation.profile),
    preAssessment: participation.preAssessment,
    postAssessment: participation.postAssessment,
    artworkStatus: participation.artworkStatus,
    artworkId: participation.artworkId,
    participantFlowCompleted: participation.participantFlowCompleted,
    researchRecordComplete: participation.researchRecordComplete,
    syncStatus: participation.syncStatus,
  };
}

async function createParticipation(
  classId: string,
  joinIdempotencyKey: string,
  requestedToken: string
): Promise<{ participation: ParticipationDocument; token: string }> {
  const Participation = getClassroomParticipationModel();
  const token = requestedToken;
  const classroomCode = await createUniqueClassroomCode(classId);
  const participation = await Participation.create({
    participantId: generateParticipantId(),
    classId,
    classroomCode,
    resumeTokenHash: hashToken(token),
    joinIdempotencyKey,
    source: 'student',
    currentStage: 'preparation',
    lastActiveAt: new Date(),
  });
  return { participation, token };
}

async function resumeExistingParticipation(
  classId: string,
  classroom: IClassroom | null,
  resumeToken?: string
): Promise<ParticipationDocument | null> {
  if (!resumeToken || !classroom) return null;
  const Participation = getClassroomParticipationModel();
  const participation = await Participation.findOne({
    classId,
    resumeTokenHash: hashToken(resumeToken),
  }).exec();
  if (!participation) return null;
  return isResumeAllowed(classroom) || participation.participantFlowCompleted ? participation : null;
}

async function findRepeatedJoin(
  classId: string,
  joinIdempotencyKey: string,
  resumeToken: string
): Promise<ParticipationDocument | null> {
  const Participation = getClassroomParticipationModel();
  return Participation.findOne({
    classId,
    joinIdempotencyKey,
    resumeTokenHash: hashToken(resumeToken),
  }).exec();
}

async function findClassroomByAccessCode(accessCode: string): Promise<IClassroom | null> {
  const Classroom = getClassroomModel();
  return Classroom.findOne({ accessCode }).lean().exec();
}

async function loadStartClassroom(
  accessCode: string,
  res: Response
): Promise<{ classroom: IClassroom; current: IClassroom } | null> {
  const classroom = await findClassroomByAccessCode(accessCode);
  if (!classroom) {
    sendErr(res, 'Classroom not found', 404);
    return null;
  }
  await closeExpiredClassroom(classroom.classId);
  const Classroom = getClassroomModel();
  const current = await Classroom.findOne({ classId: classroom.classId }).lean().exec();
  if (!current) {
    sendErr(res, 'Classroom not found', 404);
    return null;
  }
  return { classroom, current };
}

async function startOrResumeParticipation(
  classroom: IClassroom,
  current: IClassroom,
  key: string,
  token: string,
  res: Response
): Promise<ParticipationDocument | null> {
  const resumed = await resumeExistingParticipation(classroom.classId, current, token);
  if (resumed) return resumed;
  if (current.status !== 'open') {
    sendErr(res, 'Classroom is not accepting new participants', 409);
    return null;
  }
  try {
    return (await createParticipation(classroom.classId, key, token)).participation;
  } catch (error) {
    const retried = await findRepeatedJoin(classroom.classId, key, token);
    if (retried) return retried;
    throw error;
  }
}

router.post('/start', async (req, res) => {
  const key = getIdempotencyKey(req, res);
  if (!key) return;
  const parsed = StartSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, 'Invalid classroom request', 400);
    return;
  }
  const context = await loadStartClassroom(parsed.data.accessCode, res);
  if (!context) return;
  const { classroom, current } = context;
  const participation = await startOrResumeParticipation(classroom, current, key, parsed.data.resumeToken, res);
  if (!participation) return;
  sendSucc(res, {
    resumeToken: parsed.data.resumeToken,
    ...mapParticipationState(participation),
  });
});

router.use(requireParticipation);

router.get('/state', (req: ParticipationRequest, res) => {
  sendSucc(res, mapParticipationState(getParticipation(req)));
});

router.post('/heartbeat', (_req: ParticipationRequest, res) => {
  sendSucc(res, { active: true, serverTime: new Date().toISOString() });
});

router.post('/consent', async (req: ParticipationRequest, res) => {
  const key = getIdempotencyKey(req, res);
  if (!key) return;
  const parsed = ConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, 'Invalid consent', 400);
    return;
  }
  const participation = getParticipation(req);
  if (participation.consentedAt) {
    sendSucc(res, mapParticipationState(participation));
    return;
  }
  participation.consentedAt ??= new Date();
  participation.consentVersion = parsed.data.consentVersion;
  participation.consentIdempotencyKey = key;
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
});

router.post('/profile', async (req: ParticipationRequest, res) => {
  const key = getIdempotencyKey(req, res);
  if (!key) return;
  const parsed = ClassroomParticipantProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, 'Invalid profile', 400);
    return;
  }
  const participation = getParticipation(req);
  if (!participation.consentedAt) {
    sendErr(res, 'Consent required', 409);
    return;
  }
  if (participation.profile) {
    if (participation.profileIdempotencyKey === key) {
      sendSucc(res, mapParticipationState(participation));
      return;
    }
    sendErr(res, 'Profile already submitted', 409);
    return;
  }
  participation.profile = parsed.data;
  participation.profileIdempotencyKey = key;
  participation.currentStage = 'pre_assessment';
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
});

router.put('/assessment/:timepoint/draft', async (req: ParticipationRequest, res) => {
  const timepoint = req.params.timepoint;
  if (timepoint !== 'pre' && timepoint !== 'post') {
    sendErr(res, 'Invalid timepoint', 400);
    return;
  }
  const parsed = DraftSchema.safeParse(req.body);
  if (!parsed.success || !validateScoreRanges(parsed.data.vad, parsed.data.panas)) {
    sendErr(res, 'Invalid assessment draft', 400);
    return;
  }
  const participation = getParticipation(req);
  const assessment = getAssessment(participation, timepoint);
  if (assessment.status === 'submitted') {
    sendErr(res, 'Assessment already submitted', 409);
    return;
  }
  assignAssessmentDraft(assessment, parsed.data);
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
});

async function saveSubmittedAssessment(
  participation: ParticipationDocument,
  timepoint: 'pre' | 'post',
  input: z.infer<typeof SubmitSchema>,
  idempotencyKey: string
): Promise<void> {
  const assessment = getAssessment(participation, timepoint);
  assignAssessmentDraft(assessment, input);
  assessment.status = 'submitted';
  assessment.submittedAt = new Date();
  assessment.durationMs = input.durationMs;
  assessment.submitIdempotencyKey = idempotencyKey;
  participation.currentStage = timepoint === 'pre' ? 'activity_in_progress' : 'ai_echo';
  if (timepoint === 'pre') participation.activityStartedAt = new Date();
  participation.researchRecordComplete = isResearchRecordComplete(participation);
  await participation.save();
  if (timepoint === 'post') void triggerAnalysisIfReady(participation);
}

router.post('/assessment/:timepoint/submit', async (req: ParticipationRequest, res) => {
  const key = getIdempotencyKey(req, res);
  if (!key) return;
  const timepoint = req.params.timepoint;
  if (timepoint !== 'pre' && timepoint !== 'post') {
    sendErr(res, 'Invalid timepoint', 400);
    return;
  }
  const parsed = SubmitSchema.safeParse(req.body);
  const valid =
    parsed.success &&
    validateScoreRanges(parsed.data.vad, parsed.data.panas) &&
    hasCompleteAssessment(parsed.data.vad, parsed.data.panas);
  if (!valid || !parsed.success) {
    sendErr(res, 'All assessment items are required', 400);
    return;
  }
  const participation = getParticipation(req);
  const assessment = getAssessment(participation, timepoint);
  if (assessment.submitIdempotencyKey === key) {
    sendSucc(res, mapParticipationState(participation));
    return;
  }
  if (assessment.status === 'submitted') {
    sendErr(res, 'Assessment already submitted', 409);
    return;
  }
  await saveSubmittedAssessment(participation, timepoint, parsed.data, key);
  sendSucc(res, mapParticipationState(participation));
});

router.post('/activity/complete', async (req: ParticipationRequest, res) => {
  const key = getIdempotencyKey(req, res);
  if (!key) return;
  const participation = getParticipation(req);
  if (participation.activityCompletedAt) {
    sendSucc(res, mapParticipationState(participation));
    return;
  }
  if (participation.currentStage !== 'activity_in_progress') {
    sendErr(res, 'Activity is not active', 409);
    return;
  }
  participation.activityCompletedAt = new Date();
  participation.activityIdempotencyKey = key;
  participation.currentStage = 'artwork_upload';
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
});

router.post('/artwork/request-teacher-upload', async (req: ParticipationRequest, res) => {
  const key = getIdempotencyKey(req, res);
  if (!key) return;
  const participation = getParticipation(req);
  if (participation.artworkId) {
    sendErr(res, 'Artwork already exists', 409);
    return;
  }
  if (participation.artworkStatus === 'teacher_upload_pending') {
    sendSucc(res, mapParticipationState(participation));
    return;
  }
  participation.artworkStatus = 'teacher_upload_pending';
  participation.uploadIdempotencyKey = key;
  participation.currentStage = 'post_assessment';
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
});

async function saveStudentArtwork(
  participation: ParticipationDocument,
  dataUrl: string,
  idempotencyKey: string
): Promise<void> {
  participation.artworkStatus = 'student_uploading';
  await participation.save();
  participation.artworkId = await createClassroomArtwork({
    classId: participation.classId,
    participantId: participation.participantId,
    dataUrl,
    uploaderRole: 'student',
  });
  participation.artworkStatus = 'student_uploaded';
  participation.uploadIdempotencyKey = idempotencyKey;
  participation.syncStatus = 'synced';
  participation.currentStage = getStageAfterArtworkUpload(participation);
  await participation.save();
  void triggerAnalysisIfReady(participation);
}

router.post('/artwork', async (req: ParticipationRequest, res) => {
  const key = getIdempotencyKey(req, res);
  if (!key) return;
  const parsed = UploadSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, 'Invalid artwork', 400);
    return;
  }
  const participation = getParticipation(req);
  if (participation.uploadIdempotencyKey === key && participation.artworkId) {
    sendSucc(res, mapParticipationState(participation));
    return;
  }
  if (participation.artworkId) {
    sendErr(res, 'Artwork already exists', 409);
    return;
  }
  try {
    await saveStudentArtwork(participation, parsed.data.dataUrl, key);
    sendSucc(res, mapParticipationState(participation));
  } catch (error) {
    participation.artworkStatus = 'not_started';
    participation.syncStatus = 'failed';
    await participation.save();
    sendErr(res, error instanceof Error ? error.message : 'Artwork upload failed', 400);
  }
});

router.get('/artwork/status', async (req: ParticipationRequest, res) => {
  const participation = getParticipation(req);
  let healingStatus = 'none';
  if (participation.artworkId && participation.postAssessment.status === 'submitted') {
    const Work = getWorkModel();
    const work = await Work.findOne({ workId: participation.artworkId }).select('healing').lean().exec();
    healingStatus = work?.healing?.status ?? 'none';
  }
  sendSucc(res, { artworkStatus: participation.artworkStatus, healingStatus });
});

router.get('/echo', async (req: ParticipationRequest, res) => {
  const participation = getParticipation(req);
  if (participation.postAssessment.status !== 'submitted') {
    sendErr(res, 'Post assessment required', 409);
    return;
  }
  if (!participation.artworkId) {
    sendSucc(res, {
      status: 'none',
      artworkStatus: participation.artworkStatus,
      classroomCode: participation.classroomCode,
    });
    return;
  }
  const Work = getWorkModel();
  const work = await Work.findOne({ workId: participation.artworkId }).lean().exec();
  if (!work) {
    sendErr(res, 'Artwork not found', 404);
    return;
  }
  const healing = work.healing;
  sendSucc(res, {
    status: healing?.status ?? 'none',
    artworkStatus: participation.artworkStatus,
    coverUrl: resolveImageUrl(work.images[0]?.url ?? ''),
    summary: healing?.status === 'success' ? healing.summary : undefined,
    colorAnalysis: healing?.status === 'success' ? healing.colorAnalysis : undefined,
    compositionReport: healing?.status === 'success' ? healing.compositionReport : undefined,
    suggestion: healing?.status === 'success' ? healing.suggestion : undefined,
  });
});

async function hasReadyArtworkEcho(participation: IClassroomParticipation): Promise<boolean> {
  if (!participation.artworkId) return false;
  const Work = getWorkModel();
  const work = await Work.findOne({ workId: participation.artworkId }).select('healing.status').lean().exec();
  return work?.healing?.status === 'success';
}

router.post('/complete', async (req: ParticipationRequest, res) => {
  const key = getIdempotencyKey(req, res);
  if (!key) return;
  const participation = getParticipation(req);
  if (participation.participantFlowCompleted) {
    sendSucc(res, mapParticipationState(participation));
    return;
  }
  if (participation.postAssessment.status !== 'submitted') {
    sendErr(res, 'Post assessment required', 409);
    return;
  }
  participation.completionIdempotencyKey = key;
  participation.participantFlowCompleted = true;
  participation.researchRecordComplete = isResearchRecordComplete(participation);
  participation.currentStage = 'completed';
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
});

router.post('/feedback', async (req: ParticipationRequest, res) => {
  const key = getIdempotencyKey(req, res);
  if (!key) return;
  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, 'Invalid feedback', 400);
    return;
  }
  const participation = getParticipation(req);
  if (participation.postAssessment.status !== 'submitted') {
    sendErr(res, 'Post assessment required', 409);
    return;
  }
  if (participation.feedbackIdempotencyKey === key && participation.feedback) {
    sendSucc(res, mapParticipationState(participation));
    return;
  }
  if (participation.participantFlowCompleted) {
    sendErr(res, 'Feedback already submitted', 409);
    return;
  }
  if (!(await hasReadyArtworkEcho(participation))) {
    sendErr(res, 'Artwork reflection is not ready', 409);
    return;
  }
  participation.feedback = parsed.data;
  participation.feedbackIdempotencyKey = key;
  participation.participantFlowCompleted = true;
  participation.researchRecordComplete = isResearchRecordComplete(participation);
  participation.currentStage = 'completed';
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
});

export default router;
