import { randomBytes } from 'crypto';
import type { Router, Request, Response, RequestHandler } from 'express';
import type { HydratedDocument } from 'mongoose';
import { z } from 'zod';
import { getWorkModel, getClassroomArtworkAnalysisModel, getClassroomParticipationModel }
  from '../../../../dbservice/model/GlobalInfoDBModel';
import { sendSucc } from '../../../../shared/miniapp/middleware/response';
import { resolveImageUrl } from '../../../../util/imageUploader';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';
import type { ModuleCode } from '../../entity/classroomReflection.entity';
import { ClassroomWriteError, assertClassroomWritable, withClassroomWrite } from '../services/classroomWriteBoundary';
import { hashToken, isResearchRecordComplete } from '../services/classroomResearch';
import {
  IntentionDraftInput, IntentionSubmitInput, EvaluationDraftInput, EvaluationSubmitInput,
  assertCanViewReport, assertRepeatedRequest, requestHash, buildIntention, buildEvaluation, retainFirstSubmission,
} from '../services/classroomReflection';

type Participant = HydratedDocument<IClassroomParticipation>;
type GetParticipant = (req: Request) => Participant;
type MapParticipant = (participant: IClassroomParticipation) => Record<string, unknown>;
type WriteHandler = (handler: (req: Request, res: Response) => Promise<void>) => RequestHandler;
const RECOVERY_BYTES = 32;
const STUDENT_HIDDEN_MODULES = new Set<ModuleCode>(['emotionVad']);

function studentReportModules(modules: ModuleCode[]): ModuleCode[] {
  return modules.filter((moduleCode) => !STUDENT_HIDDEN_MODULES.has(moduleCode));
}
export function reflectionState(p: IClassroomParticipation): Record<string, unknown> {
  return { intention: p.intention, evaluation: p.evaluation, allowPrivateAi: p.allowPrivateAi,
    allowSensitiveText: p.allowSensitiveText, reportViewedAt: p.reportViewedAt };
}
function keyOf(req: Request): string {
  const key = String(req.headers['idempotency-key'] ?? '');
  if (!key || key.length > 120) throw new ClassroomWriteError('IDEMPOTENCY_KEY_REQUIRED');
  return key;
}
async function reportFor(p: IClassroomParticipation) {
  assertCanViewReport(p);
  const work = p.artworkId ? await getWorkModel().findOne({ workId: p.artworkId,
    participantId: p.participantId }).lean().exec() : null;
  const base = { status: work?.healing?.status ?? 'none', artworkStatus: p.artworkStatus };
  if (!work || work.healing?.status !== 'success') return { ...base, modules: [] as ModuleCode[], analysisRunId: undefined, reportVersion: undefined };
  const run = await getClassroomArtworkAnalysisModel().findOne({
    analysisId: work.healing.cozeRunId, workId: work.workId, contentHash: work.contentHash,
  }).lean().exec();
  if (!run?.reportJson) throw new ClassroomWriteError('ANALYSIS_NOT_READY');
  const report = JSON.parse(run.reportJson) as Record<string, unknown>;
  return { ...base, ...report, coverUrl: resolveImageUrl(work.images[0]?.url ?? ''),
    analysisRunId: run.analysisId, reportVersion: run.analysisId,
    modules: studentReportModules(run.shownModules as ModuleCode[]) };
}
async function saveIntention(req: Request, p: Participant, submit: boolean): Promise<void> {
  if (p.postAssessment.status !== 'submitted') throw new ClassroomWriteError('POST_ASSESSMENT_REQUIRED');
  const input = (submit ? IntentionSubmitInput : IntentionDraftInput).parse(req.body);
  const key = keyOf(req);
  if ([p.intention, ...p.intentionHistory]
    .some((record) => assertRepeatedRequest(record, key, requestHash(input)))) return;
  if (!submit && p.intention?.status === 'submitted') throw new ClassroomWriteError('INTENTION_ALREADY_SUBMITTED');
  retainFirstSubmission(p, 'intention');
  p.intention = buildIntention(p, input, key, submit);
  if (p.artworkId) {
    const work = await getWorkModel().findOne({ workId: p.artworkId }).lean().exec();
    p.intention.contentHash = work?.contentHash;
  }
  await assertClassroomWritable(p.classId);
  await p.save();
}
async function saveEvaluation(req: Request, p: Participant, submit: boolean): Promise<void> {
  const input = (submit ? EvaluationSubmitInput : EvaluationDraftInput).parse(req.body);
  const report = await reportFor(p);
  if (report.analysisRunId !== input.analysisRunId || report.reportVersion !== input.reportVersion) {
    throw new ClassroomWriteError('REPORT_VERSION_MISMATCH');
  }
  if (p.viewedAnalysisRunId !== input.analysisRunId || !p.reportViewedAt) {
    throw new ClassroomWriteError('REPORT_NOT_VIEWED');
  }
  const key = keyOf(req);
  if ([p.evaluation, ...p.evaluationHistory]
    .some((record) => assertRepeatedRequest(record, key, requestHash(input)))) return;
  if (!submit && p.evaluation?.status === 'submitted') throw new ClassroomWriteError('EVALUATION_ALREADY_SUBMITTED');
  retainFirstSubmission(p, 'evaluation');
  p.evaluation = buildEvaluation(p, input, key, submit, report.modules);
  p.researchRecordComplete = isResearchRecordComplete(p);
  p.participantFlowCompleted = p.researchRecordComplete;
  if (p.participantFlowCompleted) p.currentStage = 'completed';
  await assertClassroomWritable(p.classId);
  await p.save();
}
export function registerReflectionRoutes(
  router: Router, get: GetParticipant, map: MapParticipant, write: WriteHandler,
): void {
  for (const submit of [false, true]) {
    const path = submit ? '/intention/submit' : '/intention/draft';
    router[submit ? 'post' : 'put'](path, write(async (req, res) => {
      const p = get(req);
      await saveIntention(req, p, submit);
      sendSucc(res, map(p));
    }));
    router[submit ? 'post' : 'put'](submit ? '/feedback' : '/feedback/draft', write(async (req, res) => {
      const p = get(req);
      await saveEvaluation(req, p, submit);
      sendSucc(res, map(p));
    }));
  }
  registerReportRoutes(router, get, map, write);
}
function registerReportRoutes(router: Router, get: GetParticipant, map: MapParticipant, write: WriteHandler): void {
  router.get('/echo', async (req, res, next) => {
    try { sendSucc(res, await returnedReport(get(req))); } catch (error) { next(error); }
  });
  router.post('/echo/viewed', write(async (req, res) => {
    const p = get(req);
    const input = z.object({ analysisRunId: z.string().uuid() }).strict().parse(req.body);
    keyOf(req);
    const report = await reportFor(p);
    if (report.analysisRunId !== input.analysisRunId) throw new ClassroomWriteError('REPORT_VERSION_MISMATCH');
    if (p.viewedAnalysisRunId !== input.analysisRunId) {
      p.reportViewedAt = new Date(); p.viewedAnalysisRunId = input.analysisRunId;
      await assertClassroomWritable(p.classId);
      await p.save();
    }
    sendSucc(res, map(p));
  }));
  router.post('/recovery', write(async (req, res) => {
    const p = get(req);
    const recoveryToken = randomBytes(RECOVERY_BYTES).toString('base64url');
    p.recoveryTokenHash = hashToken(recoveryToken);
    await assertClassroomWritable(p.classId);
    await p.save();
    sendSucc(res, { recoveryToken });
  }));
}

async function returnedReport(participant: Participant) {
  const report = await reportFor(participant);
  if (!report.analysisRunId || participant.returnedAnalysisRunId === report.analysisRunId) return report;
  await withClassroomWrite(participant.classId, async () => {
    try { await assertClassroomWritable(participant.classId); }
    catch (error) {
      if (error instanceof ClassroomWriteError && error.code === 'CLASSROOM_READ_ONLY') return;
      throw error;
    }
    const fresh = await getClassroomParticipationModel().findOne({ participantId: participant.participantId }).exec();
    if (!fresh) throw new ClassroomWriteError('PARTICIPATION_NOT_FOUND');
    assertCanViewReport(fresh);
    if (fresh.returnedAnalysisRunId === report.analysisRunId) return;
    fresh.reportReturnedAt = new Date(); fresh.returnedAnalysisRunId = report.analysisRunId;
    await assertClassroomWritable(participant.classId);
    await fresh.save();
  });
  return report;
}
