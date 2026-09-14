import { randomUUID } from 'crypto';
import { resolveImageUrl } from '../../../../util/imageUploader';
import { withClassroomWrite, assertClassroomWritable, ClassroomWriteError, asyncClassroomRoute } from '../services/classroomWriteBoundary';
import { finalizeClassroomIfExpired } from '../services/classroomLifecycle';
import { registerReflectionRoutes, reflectionState } from './classroomReflection';
import { registerGalleryRoutes } from './classroomGallery';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import { z } from 'zod';
import {
  getClassroomModel,
  getClassroomArtworkAnalysisModel,
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
  PANAS_ITEM_CODES,
  VAD_ITEM_CODES,
} from '../services/classroomResearch';
import { createClassroomArtwork } from '../services/classroomArtwork';
import { startClassroomArtworkAnalysis } from '../services/classroomArtworkAnalysis/service';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store, private'); next(); });
const MAX_CODE_ATTEMPTS = 12;
const PARTICIPATION_TOKEN_HEADER = 'x-participation-token';

type ParticipationDocument = HydratedDocument<IClassroomParticipation>;
type ParticipationRequest = Request & { participation?: ParticipationDocument };

const StartSchema = z.object({
  accessCode: z.string().min(8),
  resumeToken: z.string().min(32).max(128),
});
const ConsentSchema = z.discriminatedUnion('consentVersion', [z.object({
  consentVersion: z.literal('classroom-consent-v3-2026-09-13'),
  allowPrivateAi: z.boolean(), allowSensitiveText: z.boolean(),
}).strict(), z.object({
  consentVersion: z.literal('classroom-consent-v4-2026-09-13'),
  allowPrivateAi: z.literal(true), allowSensitiveText: z.literal(true),
}).strict()]);
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
  const classroom = await getClassroomModel().findOne({ classId }).lean().exec();
  if (classroom) await finalizeClassroomIfExpired(classroom);
}

async function requireParticipation(req: ParticipationRequest, res: Response, next: NextFunction): Promise<void> {
  const token = String(req.headers[PARTICIPATION_TOKEN_HEADER] ?? '').trim();
  if (!token) {
    sendErr(res, 'Missing participation token', 401);
    return;
  }
  const Participation = getClassroomParticipationModel();
  const participation = await Participation.findOne({
    $or: [{ resumeTokenHash: hashToken(token) }, { recoveryTokenHash: hashToken(token) }],
  }).exec();
  if (!participation) {
    sendErr(res, 'Invalid participation token', 401);
    return;
  }
  await closeExpiredClassroom(participation.classId);
  const Classroom = getClassroomModel();
  const classroom = await Classroom.findOne({ classId: participation.classId }).lean().exec();
  const mayResume = classroom && classroom.status !== 'draft';
  if (!mayResume) {
    sendErr(res, 'Classroom is closed', 410);
    return;
  }

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
    ...reflectionState(participation),
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
    $or: [{ resumeTokenHash: hashToken(resumeToken) }, { recoveryTokenHash: hashToken(resumeToken) }],
  }).exec();
  if (!participation) return null;
  return classroom.status !== 'draft' ? participation : null;
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
    return await withClassroomWrite(classroom.classId, async () => {
      const latest = await findClassroomByAccessCode(classroom.accessCode ?? '');
      if (latest?.status !== 'open') throw new ClassroomWriteError('CLASSROOM_READ_ONLY');
      return (await createParticipation(classroom.classId, key, token)).participation;
    });
  } catch (error) {
    const retried = await findRepeatedJoin(classroom.classId, key, token);
    if (retried) return retried;
    throw error;
  }
}

function participationWrite(
  handler: (req: ParticipationRequest, res: Response) => Promise<void>,
) {
  return async (req: ParticipationRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const original = getParticipation(req);
      await withClassroomWrite(original.classId, async () => {
        await assertClassroomWritable(original.classId);
        const fresh = await getClassroomParticipationModel().findOne({ participantId: original.participantId }).exec();
        if (!fresh) throw new ClassroomWriteError('PARTICIPATION_NOT_FOUND');
        req.participation = fresh;
        await handler(req, res);
      });
    } catch (error) {
      if (error instanceof ClassroomWriteError) sendErr(res, error.code, 409);
      else next(error);
    }
  };
}

router.post('/start', asyncClassroomRoute(async (req, res) => {
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
    readOnly: current.status === 'closed',
  });
}));

router.use(asyncClassroomRoute(requireParticipation));

router.get('/state', asyncClassroomRoute(async (req: ParticipationRequest, res) => {
  const participation = getParticipation(req);
  const classroom = await getClassroomModel().findOne({ classId: participation.classId }).lean().exec();
  sendSucc(res, { ...mapParticipationState(participation), readOnly: classroom?.status === 'closed',
    gracePeriodEndsAt: classroom?.gracePeriodEndsAt });
}));

router.post('/heartbeat', participationWrite(async (req: ParticipationRequest, res) => {
  const p = getParticipation(req);
  p.lastActiveAt = new Date();
  await assertClassroomWritable(p.classId);
  await p.save();
  sendSucc(res, { active: true });
}));

async function applyConsentConsequences(participation: ParticipationDocument): Promise<void> {
  if (!participation.allowPrivateAi && participation.artworkId) {
    await getWorkModel().updateOne({ workId: participation.artworkId, 'healing.status': 'pending' },
      { $set: { 'healing.status': 'failed', 'healing.failReason': 'CONSENT_REVOKED' } }).exec();
    await getClassroomArtworkAnalysisModel().updateMany({ workId: participation.artworkId, status: 'pending' },
      { $set: { status: 'failed', errorCode: 'CONSENT_REVOKED', completedAt: new Date() } }).exec();
  }
  participation.researchRecordComplete = isResearchRecordComplete(participation);
  participation.participantFlowCompleted = participation.researchRecordComplete;
  if (!participation.participantFlowCompleted && participation.currentStage === 'completed') {
    participation.currentStage = 'ai_echo';
  }
}

router.post('/consent', participationWrite(async (req: ParticipationRequest, res) => {
  const key = getIdempotencyKey(req, res);
  if (!key) return;
  const parsed = ConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, 'Invalid consent', 400);
    return;
  }
  const participation = getParticipation(req);
  const previous = participation.consentEvents.filter((event) => event.requestKey === key);
  if (previous.length) {
    const same = previous.every((event) => event.granted === (event.consentType === 'private_ai'
      ? parsed.data.allowPrivateAi : parsed.data.allowSensitiveText));
    if (!same) throw new ClassroomWriteError('IDEMPOTENCY_CONFLICT');
    sendSucc(res, mapParticipationState(participation));
    return;
  }
  participation.allowPrivateAi = parsed.data.allowPrivateAi;
  participation.allowSensitiveText = parsed.data.allowSensitiveText;
  for (const consentType of ['private_ai', 'sensitive_text'] as const) {
    participation.consentEvents.push({ consentId: randomUUID(), consentType,
      granted: consentType === 'private_ai' ? parsed.data.allowPrivateAi : parsed.data.allowSensitiveText,
      consentTextVersion: parsed.data.consentVersion, occurredAt: new Date(), requestKey: key });
  }
  participation.consentedAt ??= new Date();
  participation.consentVersion = parsed.data.consentVersion;
  await applyConsentConsequences(participation);
  participation.consentIdempotencyKey = key;
  await assertClassroomWritable(participation.classId);
  await participation.save();
  await triggerAnalysisIfReady(participation);
  sendSucc(res, mapParticipationState(participation));
}));

router.post('/profile', participationWrite(async (req: ParticipationRequest, res) => {
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
  await assertClassroomWritable(participation.classId);
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
}));

router.put('/assessment/:timepoint/draft', participationWrite(async (req: ParticipationRequest, res) => {
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
  await assertClassroomWritable(participation.classId);
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
}));

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
  await assertClassroomWritable(participation.classId);
  await participation.save();
  if (timepoint === 'post') await triggerAnalysisIfReady(participation);
}

router.post('/assessment/:timepoint/submit', participationWrite(async (req: ParticipationRequest, res) => {
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
}));

router.post('/activity/complete', participationWrite(async (req: ParticipationRequest, res) => {
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
  await assertClassroomWritable(participation.classId);
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
}));

router.post('/artwork/request-teacher-upload', participationWrite(async (req: ParticipationRequest, res) => {
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
  await assertClassroomWritable(participation.classId);
  await participation.save();
  sendSucc(res, mapParticipationState(participation));
}));

async function saveStudentArtwork(
  participation: ParticipationDocument,
  dataUrl: string,
  idempotencyKey: string
): Promise<void> {
  participation.artworkStatus = 'student_uploading';
  await assertClassroomWritable(participation.classId);
  await participation.save();
  participation.artworkId = await createClassroomArtwork({
    classId: participation.classId,
    participantId: participation.participantId,
    dataUrl,
    uploaderRole: 'student',
  });
  if (participation.intention) {
    const work = await getWorkModel().findOne({ workId: participation.artworkId }).lean().exec();
    participation.intention.workId = participation.artworkId;
    participation.intention.contentHash = work?.contentHash;
  }
  participation.artworkStatus = 'student_uploaded';
  participation.uploadIdempotencyKey = idempotencyKey;
  participation.syncStatus = 'synced';
  participation.currentStage = getStageAfterArtworkUpload(participation);
  await assertClassroomWritable(participation.classId);
  await participation.save();
  await triggerAnalysisIfReady(participation);
}

router.post('/artwork', participationWrite(async (req: ParticipationRequest, res) => {
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
    await assertClassroomWritable(participation.classId);
    await participation.save();
    sendErr(res, error instanceof Error ? error.message : 'Artwork upload failed', 400);
  }
}));

router.get('/artwork/status', asyncClassroomRoute(async (req: ParticipationRequest, res) => {
  const participation = getParticipation(req);
  const work = participation.artworkId ? await getWorkModel().findOne({
    workId: participation.artworkId, participantId: participation.participantId,
  }).lean().exec() : null;
  sendSucc(res, { artworkStatus: participation.artworkStatus, healingStatus: work?.healing?.status ?? 'none',
    coverUrl: work?.images[0]?.url ? resolveImageUrl(work.images[0].url) : undefined });
}));

registerReflectionRoutes(router, getParticipation, mapParticipationState, participationWrite);
registerGalleryRoutes(router, getParticipation, participationWrite);

router.post('/complete', participationWrite(async (req: ParticipationRequest, res) => {
  sendSucc(res, mapParticipationState(getParticipation(req)));
}));

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof ClassroomWriteError) return sendErr(res, error.code, 409);
  if (error instanceof z.ZodError) return sendErr(res, 'INVALID_REFLECTION_INPUT', 400);
  next(error);
});

export default router;
