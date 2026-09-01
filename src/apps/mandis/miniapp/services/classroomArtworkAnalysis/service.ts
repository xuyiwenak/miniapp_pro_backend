import { randomUUID } from 'crypto';
import {
  getClassroomArtworkAnalysisModel,
  getWorkModel,
} from '../../../../../dbservice/model/GlobalInfoDBModel';
import type { IWork } from '../../../../../entity/work.entity';
import { resolveImageUrl } from '../../../../../util/imageUploader';
import { gameLogger as logger } from '../../../../../util/logger';
import { ClassroomNotArtworkError } from './contract';
import {
  mapEducationAnalysisToAudit,
  mapEducationAnalysisToHealingUpdate,
} from './mapper';
import { analyzeClassroomArtworkImage } from './qwenProvider';

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
  const generatedAt = new Date();
  const Analysis = getClassroomArtworkAnalysisModel();
  await Analysis.create(mapEducationAnalysisToAudit(
    analysisId,
    work.workId,
    String(work.classroomId),
    work.participantId,
    work.contentHash,
    result.modelVersion,
    generatedAt,
    result.output,
  ));
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
}

async function markAnalysisFailed(
  workId: string,
  analysisId: string,
  error: unknown,
): Promise<void> {
  const notArtwork = error instanceof ClassroomNotArtworkError;
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

async function runClassroomArtworkAnalysis(work: IWork, analysisId: string): Promise<void> {
  try {
    await persistSuccessfulAnalysis(work, analysisId);
  } catch (error) {
    await markAnalysisFailed(work.workId, analysisId, error);
  }
}

export async function startClassroomArtworkAnalysis(workId: string): Promise<void> {
  const analysisId = randomUUID();
  const work = await claimClassroomWork(workId, analysisId);
  if (!work) return;
  void runClassroomArtworkAnalysis(work, analysisId);
}
