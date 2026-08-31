import { Router, type Request, type Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  getClassroomModel,
  getClassroomParticipationModel,
  getTeacherProfileModel,
  getWorkModel,
} from '../../../../dbservice/model/GlobalInfoDBModel';
import {
  sendErr,
  sendSucc,
} from '../../../../shared/miniapp/middleware/response';
import type { IClassroom } from '../../entity/classroom.entity';
import type {
  IClassroomParticipation,
  ParticipationStage,
} from '../../entity/classroomParticipation.entity';
import {
  buildScheduledDate,
  generateAccessCode,
  generateClassroomCode,
  generateParticipantId,
  generateResumeToken,
  hashToken,
  isParticipantActive,
  isResearchRecordComplete,
} from '../services/classroomResearch';
import { createClassroomArtwork } from '../services/classroomArtwork';
import {
  classroomAccessQuery,
  findAccessibleClassroom,
  findOwnedClassroom,
} from '../services/classroomAccess';
import {
  finalizeClassroom,
  finalizeClassroomIfExpired,
} from '../services/classroomLifecycle';
import { startClassroomArtworkAnalysis } from './healing';
import teacherClassroomAssessmentResultsRouter from './teacherClassroomAssessmentResults';
import teacherClassroomCorrectionsRouter from './teacherClassroomCorrections';

const router = Router();
const DEFAULT_GRACE_PERIOD_MINUTES = 30;
const MAX_GRACE_PERIOD_MINUTES = 180;
const MAX_CODE_ATTEMPTS = 12;
type ParticipationDocument = HydratedDocument<IClassroomParticipation>;

const GradeSchema = z.enum([
  'undergraduate_1',
  'undergraduate_2',
  'undergraduate_3',
  'undergraduate_4',
  'postgraduate',
  'continuing_education',
  'mixed_adult',
  'other_adult',
]);

const ClassroomInputSchema = z.object({
  courseName: z.string().trim().min(1).max(80),
  sessionTitle: z.string().trim().min(1).max(80),
  activityTheme: z.string().trim().min(1).max(120),
  classDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.literal('Asia/Shanghai').default('Asia/Shanghai'),
  gradeLevel: GradeSchema,
  teacherDisplayName: z.string().trim().min(1).max(40),
  locationText: z.string().trim().min(1).max(80),
  gracePeriodMinutes: z
    .number()
    .int()
    .min(5)
    .max(MAX_GRACE_PERIOD_MINUTES)
    .default(DEFAULT_GRACE_PERIOD_MINUTES),
});

const UploadSchema = z.object({
  dataUrl: z.string().min(64),
  reason: z.enum([
    'device_unavailable',
    'student_upload_unavailable',
    'network_or_camera_failure',
    'other',
  ]),
});
const CollaboratorSchema = z.object({ teacherId: z.string().uuid() });

function getTeacherId(req: Request & { teacherId?: string }, res: Response): string | null {
  const teacherId = req.teacherId;
  if (!teacherId) {
    sendErr(res, 'Unauthorized', 401);
    return null;
  }
  return teacherId;
}

function validateSchedule(
  input: z.infer<typeof ClassroomInputSchema>
): boolean {
  const start = buildScheduledDate(input.classDate, input.startTime);
  const end = buildScheduledDate(input.classDate, input.endTime);
  return (
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    start < end
  );
}

function buildClassroomPayload(
  input: z.infer<typeof ClassroomInputSchema>
): Record<string, unknown> {
  return {
    ...input,
    scheduledStartAt: buildScheduledDate(input.classDate, input.startTime),
    scheduledEndAt: buildScheduledDate(input.classDate, input.endTime),
  };
}

function buildStudentUrl(req: Request, accessCode: string): string {
  const configuredBase = process.env.CLASSROOM_STUDENT_BASE_URL?.replace(
    /\/$/,
    ''
  );
  const base = configuredBase ?? `${req.protocol}://${req.get('host')}/classroom`;
  return `${base}/${accessCode}`;
}

function getIdempotencyKey(req: Request, res: Response): string | null {
  const key = String(req.headers['idempotency-key'] ?? '').trim();
  if (!key || key.length > 120) {
    sendErr(res, 'Missing or invalid idempotency key', 400);
    return null;
  }
  return key;
}

function parseArtworkUpload(
  body: unknown,
  res: Response
): z.infer<typeof UploadSchema> | null {
  const parsed = UploadSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  sendErr(res, 'Invalid artwork upload', 400);
  return null;
}

async function createPlaceholderCode(classId: string): Promise<string> {
  const Participation = getClassroomParticipationModel();
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateClassroomCode();
    if (!(await Participation.exists({ classId, classroomCode: code }).exec()))
      return code;
  }
  throw new Error('CLASSROOM_CODE_EXHAUSTED');
}

function emptyStageCounts(): Record<ParticipationStage, number> {
  return {
    preparation: 0,
    pre_assessment: 0,
    activity_in_progress: 0,
    artwork_upload: 0,
    post_assessment: 0,
    ai_echo: 0,
    completed: 0,
  };
}

function buildAssessmentCounts(
  participants: IClassroomParticipation[],
  timepoint: 'pre' | 'post'
): Record<string, number> {
  const records = participants.map((participant) =>
    timepoint === 'pre' ? participant.preAssessment : participant.postAssessment
  );
  const inProgress = records.filter(
    (record) => record.status === 'in_progress'
  );
  const answeredTotal = inProgress.reduce(
    (sum, record) => sum + record.answeredCount,
    0
  );
  return {
    notStarted: records.filter((record) => record.status === 'not_started')
      .length,
    inProgress: inProgress.length,
    page1: inProgress.filter((record) => record.currentPage === 1).length,
    page2: inProgress.filter((record) => record.currentPage === 2).length,
    page3: inProgress.filter((record) => record.currentPage === 3).length,
    submitted: records.filter((record) => record.status === 'submitted').length,
    answeredTotal,
  };
}

function buildArtworkCounts(
  participants: IClassroomParticipation[]
): Record<string, number> {
  const count = (status: IClassroomParticipation['artworkStatus']) =>
    participants.filter((participant) => participant.artworkStatus === status)
      .length;
  return {
    studentUploaded: count('student_uploaded'),
    teacherPending: count('teacher_upload_pending'),
    teacherUploaded: count('teacher_uploaded'),
    notProvided: count('not_provided'),
  };
}

function buildIssueCounts(
  participants: IClassroomParticipation[]
): Record<string, number> {
  return {
    pendingSync: participants.filter(
      (participant) => participant.syncStatus === 'pending'
    ).length,
    failedSync: participants.filter(
      (participant) => participant.syncStatus === 'failed'
    ).length,
    missingPre: participants.filter(
      (participant) => participant.preAssessment.status !== 'submitted'
    ).length,
    missingPost: participants.filter(
      (participant) => participant.postAssessment.status !== 'submitted'
    ).length,
    artworkOnly: participants.filter(
      (participant) => participant.source === 'artwork_only'
    ).length,
  };
}

function buildResearchCounts(
  participants: IClassroomParticipation[]
): Record<string, number> {
  return {
    completePairs: participants.filter(
      (participant) => participant.researchRecordComplete
    ).length,
    missingArtwork: participants.filter(
      (participant) =>
        !participant.artworkId &&
        participant.preAssessment.status === 'submitted' &&
        participant.postAssessment.status === 'submitted'
    ).length,
  };
}

function buildProgressSummary(
  classroom: IClassroom,
  participants: IClassroomParticipation[],
  aiFailed: number
): Record<string, unknown> {
  const stageCounts = emptyStageCounts();
  participants.forEach((participant) => {
    stageCounts[participant.currentStage] += 1;
  });
  return {
    generatedAt: new Date().toISOString(),
    classStatus: classroom.status,
    gracePeriodEndsAt: classroom.gracePeriodEndsAt,
    joinedTotal: participants.length,
    activeNow: participants.filter((participant) =>
      isParticipantActive(participant)
    ).length,
    completedTotal: stageCounts.completed,
    currentStageCounts: stageCounts,
    preAssessmentCounts: buildAssessmentCounts(participants, 'pre'),
    postAssessmentCounts: buildAssessmentCounts(participants, 'post'),
    artworkCounts: buildArtworkCounts(participants),
    issueCounts: { ...buildIssueCounts(participants), aiFailed },
    researchCounts: buildResearchCounts(participants),
  };
}

async function countAiFailures(
  participants: IClassroomParticipation[]
): Promise<number> {
  const artworkIds = participants.flatMap((participant) =>
    participant.artworkId ? [participant.artworkId] : []
  );
  if (artworkIds.length === 0) return 0;
  const Work = getWorkModel();
  return Work.countDocuments({
    workId: { $in: artworkIds },
    'healing.status': 'failed',
  }).exec();
}

router.get('/', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const Classroom = getClassroomModel();
  const classrooms = await Classroom.find(classroomAccessQuery(teacherId))
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  sendSucc(res, { list: classrooms });
});

router.post('/', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const parsed = ClassroomInputSchema.safeParse(req.body);
  if (!parsed.success || !validateSchedule(parsed.data)) {
    sendErr(res, 'Invalid classroom schedule', 400);
    return;
  }
  const Classroom = getClassroomModel();
  const classroom = await Classroom.create({
    classId: uuidv4(),
    createdByTeacherId: teacherId,
    status: 'draft',
    ...buildClassroomPayload(parsed.data),
  });
  sendSucc(res, classroom.toObject());
});

router.patch('/:classId', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classroom = await findOwnedClassroom(req.params.classId, teacherId, res);
  if (!classroom) return;
  if (classroom.status !== 'draft') {
    sendErr(res, 'Open classrooms are locked', 409);
    return;
  }
  const parsed = ClassroomInputSchema.safeParse(req.body);
  if (!parsed.success || !validateSchedule(parsed.data)) {
    sendErr(res, 'Invalid classroom schedule', 400);
    return;
  }
  const Classroom = getClassroomModel();
  const updated = await Classroom.findOneAndUpdate(
    { classId: classroom.classId },
    { $set: buildClassroomPayload(parsed.data) },
    { new: true }
  )
    .lean()
    .exec();
  sendSucc(res, updated);
});

router.post('/:classId/open', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classroom = await findOwnedClassroom(req.params.classId, teacherId, res);
  if (!classroom) return;
  if (classroom.status !== 'draft') {
    sendErr(res, 'Classroom is not a draft', 409);
    return;
  }
  const accessCode = classroom.accessCode ?? generateAccessCode();
  const Classroom = getClassroomModel();
  await Classroom.updateOne(
    { classId: classroom.classId },
    { $set: { accessCode, status: 'open', openedAt: new Date() } }
  ).exec();
  sendSucc(res, {
    classId: classroom.classId,
    accessCode,
    studentUrl: buildStudentUrl(req, accessCode),
  });
});

router.post('/:classId/close', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classroom = await findOwnedClassroom(req.params.classId, teacherId, res);
  if (!classroom) return;
  if (classroom.status !== 'open') {
    sendErr(res, 'Classroom is not open', 409);
    return;
  }
  const gracePeriodEndsAt = new Date(
    Date.now() + classroom.gracePeriodMinutes * 60 * 1000
  );
  const Classroom = getClassroomModel();
  await Classroom.updateOne(
    { classId: classroom.classId },
    {
      $set: {
        status: 'closing',
        closedByTeacherAt: new Date(),
        gracePeriodEndsAt,
      },
    }
  ).exec();
  sendSucc(res, { status: 'closing', gracePeriodEndsAt });
});

router.post('/:classId/finalize', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classroom = await findOwnedClassroom(req.params.classId, teacherId, res);
  if (!classroom) return;
  if (classroom.status !== 'closing') {
    sendErr(res, 'Classroom is not in the grace period', 409);
    return;
  }
  const finalizedAt = new Date();
  const finalized = await finalizeClassroom(
    classroom.classId,
    'teacher',
    finalizedAt
  );
  if (!finalized) {
    sendErr(res, 'Classroom has already been finalized', 409);
    return;
  }
  sendSucc(res, { status: 'closed', finalizedAt, finalizedBy: 'teacher' });
});

router.get('/:classId/collaborators', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classroom = await findOwnedClassroom(req.params.classId, teacherId, res);
  if (!classroom) return;
  const Teacher = getTeacherProfileModel();
  const list = await Teacher.find({
    teacherId: { $in: classroom.authorizedTeacherIds ?? [] },
    status: 'active',
  }).select('teacherId displayName organization').lean().exec();
  sendSucc(res, { list });
});

router.post('/:classId/collaborators', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classroom = await findOwnedClassroom(req.params.classId, teacherId, res);
  const parsed = CollaboratorSchema.safeParse(req.body);
  if (!classroom || !parsed.success) {
    if (classroom) sendErr(res, 'Invalid collaborator', 400);
    return;
  }
  if (parsed.data.teacherId === teacherId) {
    sendErr(res, 'The classroom owner already has access', 409);
    return;
  }
  const Teacher = getTeacherProfileModel();
  const collaborator = await Teacher.findOne({
    teacherId: parsed.data.teacherId,
    status: 'active',
  }).select('teacherId displayName organization').lean().exec();
  if (!collaborator) return sendErr(res, 'Teacher profile not found', 404);
  const Classroom = getClassroomModel();
  await Classroom.updateOne(
    { classId: classroom.classId },
    { $addToSet: { authorizedTeacherIds: collaborator.teacherId } }
  ).exec();
  sendSucc(res, collaborator);
});

router.delete('/:classId/collaborators/:collaboratorTeacherId', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classroom = await findOwnedClassroom(req.params.classId, teacherId, res);
  if (!classroom) return;
  const Classroom = getClassroomModel();
  await Classroom.updateOne(
    { classId: classroom.classId },
    { $pull: { authorizedTeacherIds: req.params.collaboratorTeacherId } }
  ).exec();
  sendSucc(res, { removed: true });
});

router.get('/:classId/progress', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const ownedClassroom = await findAccessibleClassroom(
    req.params.classId,
    teacherId,
    res
  );
  if (!ownedClassroom) return;
  const classroom = await finalizeClassroomIfExpired(ownedClassroom);
  const Participation = getClassroomParticipationModel();
  const participants = await Participation.find({ classId: classroom.classId })
    .lean()
    .exec();
  const aiFailed = await countAiFailures(participants);
  sendSucc(res, buildProgressSummary(classroom, participants, aiFailed));
});

router.get('/:classId/pending-artworks', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classroom = await findAccessibleClassroom(req.params.classId, teacherId, res);
  if (!classroom) return;
  const Participation = getClassroomParticipationModel();
  const records = await Participation.find({
    classId: classroom.classId,
    artworkStatus: 'teacher_upload_pending',
  })
    .sort({ createdAt: 1 })
    .lean()
    .exec();
  const list = records.map((participant) => ({
    classroomCode: participant.classroomCode,
    currentStage: participant.currentStage,
    preSubmitted: participant.preAssessment.status === 'submitted',
    postSubmitted: participant.postAssessment.status === 'submitted',
    artworkStatus: participant.artworkStatus,
    joinedAt: participant.createdAt,
    lastActiveAt: participant.lastActiveAt,
  }));
  sendSucc(res, { list });
});

router.post('/:classId/artwork-placeholders', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classroom = await findAccessibleClassroom(req.params.classId, teacherId, res);
  if (!classroom || !['open', 'closing'].includes(classroom.status)) {
    if (classroom) sendErr(res, 'Classroom is closed', 409);
    return;
  }
  const token = generateResumeToken();
  const Participation = getClassroomParticipationModel();
  const participant = await Participation.create({
    participantId: generateParticipantId(),
    classId: classroom.classId,
    classroomCode: await createPlaceholderCode(classroom.classId),
    resumeTokenHash: hashToken(token),
    source: 'artwork_only',
    currentStage: 'artwork_upload',
    artworkStatus: 'teacher_upload_pending',
    lastActiveAt: new Date(),
  });
  sendSucc(res, {
    classroomCode: participant.classroomCode,
    source: participant.source,
  });
});

async function saveTeacherArtwork(
  participant: ParticipationDocument,
  classroom: IClassroom,
  input: z.infer<typeof UploadSchema>,
  teacherId: string,
  idempotencyKey: string
): Promise<string> {
  const artworkId = await createClassroomArtwork({
    classId: classroom.classId,
    participantId: participant.participantId,
    dataUrl: input.dataUrl,
    uploaderRole: 'teacher',
    uploadReason: input.reason,
  });
  participant.artworkId = artworkId;
  participant.artworkStatus = 'teacher_uploaded';
  participant.uploadReason = input.reason;
  participant.teacherUploadAudit = {
    participantId: participant.participantId,
    classroomCode: participant.classroomCode,
    artworkId,
    uploaderRole: 'teacher',
    uploaderTeacherId: teacherId,
    reason: input.reason,
    uploadedAt: new Date(),
    idempotencyKey,
  };
  participant.researchRecordComplete = isResearchRecordComplete(participant);
  await participant.save();
  if (participant.postAssessment.status === 'submitted')
    void startClassroomArtworkAnalysis(artworkId);
  return artworkId;
}

async function findTeacherUploadTarget(
  classroom: IClassroom,
  classroomCode: string,
  idempotencyKey: string,
  res: Response
): Promise<ParticipationDocument | null> {
  const Participation = getClassroomParticipationModel();
  const participant = await Participation.findOne({
    classId: classroom.classId,
    classroomCode,
  }).exec();
  if (!participant) {
    sendErr(res, 'Classroom code not found', 404);
    return null;
  }
  if (
    participant.teacherUploadAudit?.idempotencyKey === idempotencyKey &&
    participant.artworkId
  ) {
    sendSucc(res, {
      artworkId: participant.artworkId,
      classroomCode: participant.classroomCode,
    });
    return null;
  }
  if (participant.artworkId) {
    sendErr(res, 'Artwork already exists', 409);
    return null;
  }
  return participant;
}

router.post(
  '/:classId/participants/:classroomCode/artwork',
  async (req, res) => {
    const teacherId = getTeacherId(req, res);
    if (!teacherId) return;
    const key = getIdempotencyKey(req, res);
    if (!key) return;
    const classId = req.params.classId;
    const classroom = await findAccessibleClassroom(classId, teacherId, res);
    if (!classroom || !['open', 'closing'].includes(classroom.status)) {
      if (classroom) sendErr(res, 'Classroom is closed', 409);
      return;
    }
    const input = parseArtworkUpload(req.body, res);
    if (!input) return;
    const classroomCode = req.params.classroomCode;
    const participant = await findTeacherUploadTarget(
      classroom,
      classroomCode,
      key,
      res
    );
    if (!participant) return;
    try {
      const artworkId = await saveTeacherArtwork(
        participant,
        classroom,
        input,
        teacherId,
        key
      );
      sendSucc(res, { artworkId, classroomCode: participant.classroomCode });
    } catch (error) {
      sendErr(
        res,
        error instanceof Error ? error.message : 'Artwork upload failed',
        400
      );
    }
  }
);

router.get('/:classId/data-completeness', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const classroom = await findAccessibleClassroom(req.params.classId, teacherId, res);
  if (!classroom) return;
  const Participation = getClassroomParticipationModel();
  const records = await Participation.find({ classId: classroom.classId })
    .lean()
    .exec();
  sendSucc(res, {
    completePairs: records.filter((record) => record.researchRecordComplete)
      .length,
    missingArtwork: records.filter(
      (record) =>
        !record.artworkId &&
        record.preAssessment.status === 'submitted' &&
        record.postAssessment.status === 'submitted'
    ).length,
    missingPre: records.filter(
      (record) => record.preAssessment.status !== 'submitted'
    ).length,
    missingPost: records.filter(
      (record) => record.postAssessment.status !== 'submitted'
    ).length,
    artworkOnly: records.filter((record) => record.source === 'artwork_only')
      .length,
    studentUploaded: records.filter(
      (record) => record.artworkStatus === 'student_uploaded'
    ).length,
    teacherUploaded: records.filter(
      (record) => record.artworkStatus === 'teacher_uploaded'
    ).length,
  });
});

router.use('/:classId/assessment-results', teacherClassroomAssessmentResultsRouter);
router.use('/:classId/artwork-corrections', teacherClassroomCorrectionsRouter);

export default router;
