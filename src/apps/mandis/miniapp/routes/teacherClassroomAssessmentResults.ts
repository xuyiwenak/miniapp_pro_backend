import { createHash, randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  getClassroomModel,
  getClassroomParticipationModel,
  getTeacherDataExportAuditModel,
  getWorkModel,
} from '../../../../dbservice/model/GlobalInfoDBModel';
import { sendErr, sendSucc } from '../../../../shared/miniapp/middleware/response';
import type { IClassroom } from '../../entity/classroom.entity';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';
import {
  buildClassroomAssessmentResult,
  type ClassroomAssessmentResult,
} from '../services/classroomAssessmentResults';
import {
  buildAssessmentCsv,
  buildAssessmentWorkbook,
  CLASSROOM_ASSESSMENT_DATASET_VERSION,
} from '../services/classroomAssessmentExport';
import { finalizeClassroomIfExpired } from '../services/classroomLifecycle';

const router = Router({ mergeParams: true });
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const ParticipantQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
const ExportQuerySchema = z.object({ format: z.enum(['xlsx', 'csv']) });

type AssessmentDataStatus = 'provisional' | 'final';
type ResultBundle = {
  classroom: IClassroom;
  participants: IClassroomParticipation[];
  result: ClassroomAssessmentResult;
  dataStatus: AssessmentDataStatus;
};

export function getAssessmentResultDataStatus(
  classroom: IClassroom,
): AssessmentDataStatus | null {
  if (classroom.status === 'closing') return 'provisional';
  if (classroom.status === 'closed') return 'final';
  return null;
}

function getTeacherId(req: Request & { teacherId?: string }, res: Response): string | null {
  if (req.teacherId) return req.teacherId;
  sendErr(res, 'Unauthorized', 401);
  return null;
}

function getClassId(req: Request): string {
  return String((req.params as Record<string, string>).classId ?? '');
}

async function findOwnedClassroom(
  classId: string,
  teacherId: string,
  res: Response,
): Promise<IClassroom | null> {
  const Classroom = getClassroomModel();
  const found = await Classroom.findOne({ classId, createdByTeacherId: teacherId }).lean().exec();
  if (!found) sendErr(res, 'Classroom not found', 404);
  return found;
}

async function loadResultBundle(
  classId: string,
  teacherId: string,
  res: Response,
): Promise<ResultBundle | null> {
  const owned = await findOwnedClassroom(classId, teacherId, res);
  if (!owned) return null;
  const classroom = await finalizeClassroomIfExpired(owned);
  const dataStatus = getAssessmentResultDataStatus(classroom);
  if (!dataStatus) {
    sendErr(res, 'Assessment results are available after the classroom enters closing', 409);
    return null;
  }
  const Participation = getClassroomParticipationModel();
  const Work = getWorkModel();
  const [participants, works] = await Promise.all([
    Participation.find({ classId }).sort({ createdAt: 1 }).lean().exec(),
    Work.find({ classroomId: classId })
      .select('participantId uploaderRole healing.status')
      .lean()
      .exec(),
  ]);
  return {
    classroom,
    participants,
    result: buildClassroomAssessmentResult(participants, works),
    dataStatus,
  };
}

function summaryPayload(bundle: ResultBundle): Record<string, unknown> {
  const { participants: _participants, ...summary } = bundle.result;
  return {
    generatedAt: new Date().toISOString(),
    dataStatus: bundle.dataStatus,
    classStatus: bundle.classroom.status,
    finalizedAt: bundle.classroom.finalizedAt,
    datasetVersion: CLASSROOM_ASSESSMENT_DATASET_VERSION,
    missingValuePolicy: 'not_imputed',
    disclaimer: bundle.dataStatus === 'provisional'
      ? '宽限期内数据仍可能变化，仅供课堂观察。'
      : '课堂数据已封存；结果为描述性统计，不代表因果效应。',
    ...summary,
  };
}

function exportMetadata(format: 'xlsx' | 'csv'): { contentType: string; extension: string } {
  if (format === 'csv') return { contentType: 'text/csv; charset=utf-8', extension: 'csv' };
  return {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  };
}

async function saveExportAudit(
  bundle: ResultBundle,
  teacherId: string,
  format: 'xlsx' | 'csv',
  buffer: Buffer,
): Promise<void> {
  const Audit = getTeacherDataExportAuditModel();
  await Audit.create({
    exportId: randomUUID(),
    teacherId,
    classId: bundle.classroom.classId,
    format,
    datasetVersion: CLASSROOM_ASSESSMENT_DATASET_VERSION,
    recordCount: bundle.result.participantCount,
    exportedAt: new Date(),
    fileSha256: createHash('sha256').update(buffer).digest('hex'),
  });
}

router.get('/', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const bundle = await loadResultBundle(getClassId(req), teacherId, res);
  if (!bundle) return;
  sendSucc(res, summaryPayload(bundle));
});

router.get('/participants', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const parsed = ParticipantQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendErr(res, 'Invalid pagination', 400);
    return;
  }
  const bundle = await loadResultBundle(getClassId(req), teacherId, res);
  if (!bundle) return;
  const start = (parsed.data.page - 1) * parsed.data.pageSize;
  sendSucc(res, {
    list: bundle.result.participants.slice(start, start + parsed.data.pageSize),
    total: bundle.result.participants.length,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    dataStatus: bundle.dataStatus,
  });
});

router.get('/export', async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const parsed = ExportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendErr(res, 'Invalid export format', 400);
    return;
  }
  const bundle = await loadResultBundle(getClassId(req), teacherId, res);
  if (!bundle) return;
  if (bundle.dataStatus !== 'final') {
    sendErr(res, 'Export is available only after the classroom is finalized', 409);
    return;
  }
  const format = parsed.data.format;
  const buffer = format === 'xlsx'
    ? buildAssessmentWorkbook(bundle.classroom, bundle.participants, bundle.result)
    : buildAssessmentCsv(bundle.result);
  await saveExportAudit(bundle, teacherId, format, buffer);
  const metadata = exportMetadata(format);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Content-Type', metadata.contentType);
  res.set('Content-Disposition', `attachment; filename="classroom-assessment-results.${metadata.extension}"`);
  res.status(200).send(buffer);
});

export default router;
