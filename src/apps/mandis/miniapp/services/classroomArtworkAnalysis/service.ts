import {
  withClassroomWrite, assertClassroomWritable, outsideClassroomWrite,
} from '../classroomWriteBoundary';
import { randomUUID } from 'crypto';
import {
  getClassroomArtworkAnalysisModel,
  getClassroomParticipationModel,
  getWorkModel,
} from '../../../../../dbservice/model/GlobalInfoDBModel';
import type { IWork } from '../../../../../entity/work.entity';
import { resolveImageUrl } from '../../../../../util/imageUploader';
import { gameLogger as logger } from '../../../../../util/logger';
import { ClassroomNotArtworkError, EDUCATION_ARTWORK_PROMPT_VERSION, EDUCATION_ARTWORK_SCALE_VERSION } from './contract';
import {
  mapEducationAnalysisToAudit,
  mapEducationAnalysisToHealingUpdate,
} from './mapper';
import { analyzeClassroomArtworkImage, EducationProviderOutputError } from './qwenProvider';

const OSS_PREFIX = 'oss://';

async function claimClassroomWork(workId: string, analysisId: string): Promise<IWork | null> {
  const Work = getWorkModel();
  return Work.findOneAndUpdate(
    {
      workId,
      classroomId: { $type: 'string', $ne: '' },
      'healing.status': { $nin: ['pending', 'success'] },
    },
    {
      $set: {
        healing: {
          scores: {},
          summary: '',
          colorAnalysis: '',
          status: 'pending',
          isPublic: false,
          cozeRunId: analysisId,
          submittedAt: new Date(),
        },
      },
    },
    { new: false },
  ).lean().exec() as Promise<IWork | null>;
}

function resolveArtworkImageUrl(work: IWork): string {
  const imageUrl = work.images[0]?.url ?? '';
  if (!imageUrl) throw new Error('Classroom artwork image is missing');
  return imageUrl.startsWith(OSS_PREFIX) ? resolveImageUrl(imageUrl) : imageUrl;
}

async function persistSuccessfulAnalysis(
  work: IWork,
  analysisId: string,
): Promise<void> {
  const result = await analyzeClassroomArtworkImage(resolveArtworkImageUrl(work), work.workId);
  await withClassroomWrite(String(work.classroomId), async () => {
    await assertClassroomWritable(String(work.classroomId));
    if (!(await analysisAllowed(work))) return;
    const generatedAt = new Date();
    const Analysis = getClassroomArtworkAnalysisModel();
    await Analysis.updateOne({ analysisId }, { $set: { ...mapEducationAnalysisToAudit(
      analysisId,
      work.workId,
      String(work.classroomId),
      work.participantId,
      work.contentHash,
      result.modelVersion,
      generatedAt,
      result.output,
    ), status: 'success', completedAt: generatedAt, rawOutputJson: result.rawOutput,
    samplingParametersJson: result.samplingParametersJson } }).exec();
    const Work = getWorkModel();
    const updateResult = await Work.updateOne(
      { workId: work.workId, 'healing.cozeRunId': analysisId },
      { $set: mapEducationAnalysisToHealingUpdate(result.output, result.modelVersion, generatedAt) },
    ).exec();
    if (updateResult.matchedCount === 0) throw new Error('Classroom artwork analysis state changed before completion');
    logger.info('education.artwork.analysis.success', {
      workId: work.workId,
      classroomId: work.classroomId,
      analysisId,
      modelVersion: result.modelVersion,
    });
  });
}

async function markAnalysisFailed(
  workId: string,
  analysisId: string,
  error: unknown,
): Promise<void> {
  const notArtwork = error instanceof ClassroomNotArtworkError
    || (error instanceof EducationProviderOutputError && error.failureCode === 'NOT_ARTWORK');
  const update: Record<string, unknown> = { 'healing.status': 'failed' };
  if (notArtwork) update['healing.failReason'] = 'NOT_ARTWORK';
  const Work = getWorkModel();
  await Work.updateOne(
    { workId, 'healing.cozeRunId': analysisId },
    { $set: update },
  ).exec();
  logger.error('education.artwork.analysis.failed', {
    workId,
    analysisId,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

async function analysisAllowed(work: IWork): Promise<boolean> {
  const participant = await getClassroomParticipationModel().findOne({ participantId: work.participantId })
    .lean().exec();
  return Boolean(participant?.allowPrivateAi && participant.postAssessment.status === 'submitted');
}

async function runClassroomArtworkAnalysis(work: IWork, analysisId: string): Promise<void> {
  try {
    await persistSuccessfulAnalysis(work, analysisId);
  } catch (error) {
    try {
      await withClassroomWrite(String(work.classroomId), async () => {
        await assertClassroomWritable(String(work.classroomId));
        await markAnalysisFailed(work.workId, analysisId, error);
        await getClassroomArtworkAnalysisModel().updateOne({ analysisId }, { $set: {
          status: 'failed', errorCode: error instanceof EducationProviderOutputError ? error.failureCode : 'ANALYSIS_FAILED',
          rawOutputJson: error instanceof EducationProviderOutputError ? error.rawOutput : undefined,
          completedAt: new Date(),
        } }).exec();
      });
    } catch {
      logger.info('education.artwork.result.not_committed', { workId: work.workId, analysisId });
    }
  }
}

export async function startClassroomArtworkAnalysis(workId: string): Promise<void> {
  const original = await getWorkModel().findOne({ workId }).lean().exec();
  if (!original?.classroomId || !(await analysisAllowed(original))) return;
  await withClassroomWrite(original.classroomId, async () => {
    await assertClassroomWritable(String(original.classroomId));
    const analysisId = randomUUID();
    const work = await claimClassroomWork(workId, analysisId);
    if (!work) return;
    await getClassroomArtworkAnalysisModel().create({ analysisId, workId, classroomId: work.classroomId,
      participantId: work.participantId, contentHash: work.contentHash, status: 'pending', submittedAt: new Date(),
      modelVersion: 'unavailable', modelProvider: 'dashscope', schemaVersion: 'education-artwork-output-v1',
      inputManifestJson: JSON.stringify({ contentHash: work.contentHash, input: 'artwork-image-only' }),
      promptVersion: EDUCATION_ARTWORK_PROMPT_VERSION,
      scaleVersion: EDUCATION_ARTWORK_SCALE_VERSION, generatedAt: new Date() });
    outsideClassroomWrite(() => { void runClassroomArtworkAnalysis(work, analysisId); });
  });
}
