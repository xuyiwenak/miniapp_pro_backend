import { asyncClassroomRoute } from '../services/classroomWriteBoundary';
import { reflectionSummary } from '../services/classroomReflectionExport';
import { createHash, randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  getClassroomParticipationModel,
  getClassroomArtworkAnalysisModel,
  getTeacherDataExportAuditModel,
  getWorkModel,
  getGalleryWorkModel, getPeerReviewModel,
} from '../../../../dbservice/model/GlobalInfoDBModel';
import { sendErr, sendSucc } from '../../../../shared/miniapp/middleware/response';
import type { IWork } from '../../../../entity/work.entity';
import { resolveImageUrl } from '../../../../util/imageUploader';
import type { IClassroom } from '../../entity/classroom.entity';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';
import {
  buildClassroomAssessmentResult,
  splitInstrumentVersion,
  type ClassroomAssessmentResult,
} from '../services/classroomAssessmentResults';
import {
  buildAssessmentCsv,
  buildAssessmentWorkbook,
  CLASSROOM_ASSESSMENT_DATASET_VERSION,
} from '../services/classroomAssessmentExport';
import { finalizeClassroomIfExpired } from '../services/classroomLifecycle';
import { findAccessibleClassroom, hasClassroomCapability } from '../services/classroomAccess';
import {
  buildArtworkSelfReportComparison,
  resolveArtworkAffect,
} from '../services/artworkAffect';

const router = Router({ mergeParams: true });
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const ParticipantQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
const ExportQuerySchema = z.object({ format: z.enum(['xlsx', 'csv']), sensitive: z.enum(['true', 'false']).optional() });
const ParticipantParamsSchema = z.object({
  classroomCode: z.string().regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/),
});

type AssessmentDataStatus = 'provisional' | 'final';
type ResultBundle = {
  classroom: IClassroom;
  participants: IClassroomParticipation[];
  works: IWork[];
  result: ClassroomAssessmentResult;
  dataStatus: AssessmentDataStatus;
};

export function buildParticipantArtworkEvaluation(
  participant: IClassroomParticipation,
  work?: IWork,
): Record<string, unknown> {
  const healing = work?.healing;
  const artworkAffect = resolveArtworkAffect(work);
  const coverUrl = work?.images[0]?.url;
  return {
    status: healing?.status ?? 'none',
    coverUrl: coverUrl ? resolveImageUrl(coverUrl) : undefined,
    summary: healing?.summary,
    colorAnalysis: healing?.colorAnalysis,
    compositionReport: healing?.compositionReport,
    suggestion: healing?.suggestion,
    artworkAffect: artworkAffect.data ? { ...artworkAffect.data,
      dimensions: Object.fromEntries(Object.entries(artworkAffect.data.dimensions)
        .map(([key, value]) => [key, { ...value, evidence: [] }])),
      vad: { ...artworkAffect.data.vad, evidence: [], interpretation: '' },
    } : undefined,
    researchEligible: artworkAffect.researchEligible,
    exclusionReason: artworkAffect.exclusionReason,
    selfReportComparison: buildArtworkSelfReportComparison(participant, work),
    feedbackFit: participant.feedback?.fit ?? null,
  };
}

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

async function loadResultBundle(
  classId: string,
  teacherId: string,
  res: Response,
): Promise<ResultBundle | null> {
  const owned = await findAccessibleClassroom(classId, teacherId, res);
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
      .select('participantId uploaderRole healing')
      .lean()
      .exec(),
  ]);
  return {
    classroom,
    participants,
    works,
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
    reflectionSummary: reflectionSummary(bundle.participants),
  };
}

async function participantDetailPayload(
  bundle: ResultBundle,
  classroomCode: string,
): Promise<Record<string, unknown> | null> {
  const participant = bundle.participants.find((item) => item.classroomCode === classroomCode);
  const participantRow = bundle.result.participants.find((item) => item.classroomCode === classroomCode);
  if (!participant || !participantRow) return null;
  const Work = getWorkModel();
  const work = await Work.findOne({
    classroomId: bundle.classroom.classId,
    participantId: participant.participantId,
  }).select('images healing uploaderRole').lean().exec();
  return {
    ...participantRow,
    instrumentVersions: splitInstrumentVersion(participant.instrumentVersion),
    artworkEvaluation: buildParticipantArtworkEvaluation(participant, work ?? undefined),
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
  sensitive: boolean,
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
    sensitiveIncluded: sensitive,
    fileSha256: createHash('sha256').update(buffer).digest('hex'),
  });
}

router.get('/', asyncClassroomRoute(async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const bundle = await loadResultBundle(getClassId(req), teacherId, res);
  if (!bundle) return;
  sendSucc(res, { ...summaryPayload(bundle), capabilities: {
    detail: hasClassroomCapability(bundle.classroom, teacherId, 'detail'),
    sensitiveExport: hasClassroomCapability(bundle.classroom, teacherId, 'sensitiveExport'),
  } });
}));

router.get('/participants', asyncClassroomRoute(async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const parsed = ParticipantQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendErr(res, 'Invalid pagination', 400);
    return;
  }
  const bundle = await loadResultBundle(getClassId(req), teacherId, res);
  if (!bundle) return;
  if (!hasClassroomCapability(bundle.classroom, teacherId, 'detail')) return sendErr(res, 'FORBIDDEN', 403);
  const start = (parsed.data.page - 1) * parsed.data.pageSize;
  sendSucc(res, {
    list: bundle.result.participants.slice(start, start + parsed.data.pageSize),
    total: bundle.result.participants.length,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    dataStatus: bundle.dataStatus,
  });
}));

router.get('/participants/:classroomCode', asyncClassroomRoute(async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const parsed = ParticipantParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    sendErr(res, 'Invalid classroom code', 400);
    return;
  }
  const bundle = await loadResultBundle(getClassId(req), teacherId, res);
  if (!bundle) return;
  if (!hasClassroomCapability(bundle.classroom, teacherId, 'detail')) return sendErr(res, 'FORBIDDEN', 403);
  const payload = await participantDetailPayload(bundle, parsed.data.classroomCode);
  if (!payload) {
    sendErr(res, 'Participant not found', 404);
    return;
  }
  sendSucc(res, payload);
}));

router.get('/export', asyncClassroomRoute(async (req, res) => {
  const teacherId = getTeacherId(req, res);
  if (!teacherId) return;
  const parsed = ExportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendErr(res, 'Invalid export format', 400);
    return;
  }
  const bundle = await loadResultBundle(getClassId(req), teacherId, res);
  if (!bundle) return;
  if (!hasClassroomCapability(bundle.classroom, teacherId, 'detail')) return sendErr(res, 'FORBIDDEN', 403);
  if (bundle.dataStatus !== 'final') {
    sendErr(res, 'Export is available only after the classroom is finalized', 409);
    return;
  }
  const sensitive = parsed.data.sensitive === 'true';
  if (sensitive && !hasClassroomCapability(bundle.classroom, teacherId, 'sensitiveExport')) {
    return sendErr(res, 'FORBIDDEN', 403);
  }
  const analyses = await getClassroomArtworkAnalysisModel().find({ classroomId: bundle.classroom.classId })
    .sort({ submittedAt: 1, analysisId: 1 }).lean().exec();
  const format = parsed.data.format;
  const items = await getGalleryWorkModel().find({ classId: bundle.classroom.classId })
    .sort({ galleryId: 1 }).lean().exec();
  const reviews = await getPeerReviewModel().find({ classId: bundle.classroom.classId })
    .sort({ assignmentId: 1 }).lean().exec();
  const buffer = format === 'xlsx'
    ? buildAssessmentWorkbook(bundle.classroom, bundle.participants, bundle.result, bundle.works, analyses,
      sensitive, { items, reviews })
    : buildAssessmentCsv(bundle.result, bundle.participants);
  await saveExportAudit(bundle, teacherId, format, buffer, sensitive);
  const metadata = exportMetadata(format);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Content-Type', metadata.contentType);
  res.set('Content-Disposition', `attachment; filename="classroom-assessment-results.${metadata.extension}"`);
  res.status(200).send(buffer);
}));

export default router;
