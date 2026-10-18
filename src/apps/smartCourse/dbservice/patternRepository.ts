import type { Models } from './models';
import type { PatternAsset, PatternExport } from './patternModels';
import type { CeramicJob } from './ceramicModels';
import { LIMITS } from '../config';
export function patternRepository(models: Models) {
  return {
    pendingCeramicJobs: () => models.ceramicJobs.find({ status: { $in: ['pending', 'submitting'] } })
      .sort({ updatedAt: 1 }).limit(LIMITS.pageSize).lean().exec(),
    ceramicJobs: (courseId: string, participantId: string) => models.ceramicJobs
      .find({ courseId, participantId }).sort({ revision: -1 }).limit(LIMITS.pageSize).lean().exec(),
    ceramicJob: (courseId: string, participantId: string, revision: number) => models.ceramicJobs
      .findOne({ courseId, participantId, revision }).lean().exec(),
    createCeramicJob: (job: Omit<CeramicJob, 'createdAt'>) => models.ceramicJobs.create(job),
    updateCeramicJob: (courseId: string, participantId: string, revision: number,
      update: Partial<Pick<CeramicJob, 'status' | 'taskId' | 'objectKey' | 'startedAt'>>) => models.ceramicJobs
      .findOneAndUpdate({ courseId, participantId, revision }, { $set: update }, { new: true }).lean().exec(),
    patternAsset: (assetId: string, courseId: string, participantId: string) =>
      models.patternAssets.findOne({ assetId, courseId, participantId }).lean().exec(),
    addPatternAsset: (asset: Omit<PatternAsset, 'createdAt'>) => models.patternAssets.create(asset),
    patternAssets: (courseId: string, participantId: string) =>
      models.patternAssets.find({ courseId, participantId }).sort({ createdAt: -1 })
        .limit(LIMITS.pageSize).lean().exec(),
    patternDesign: (courseId: string, participantId: string) =>
      models.patternDesigns.findOne({ courseId, participantId }).lean().exec(),
    patternDesigns: (courseId: string) => models.patternDesigns.find({ courseId })
      .sort({ updatedAt: -1 }).limit(LIMITS.pageSize).lean().exec(),
    savePattern: (courseId: string, participantId: string, revision: number, stateJson: string) =>
      models.patternDesigns.findOneAndUpdate({ courseId, participantId, revision },
        { $set: { stateJson }, $inc: { revision: 1 } }, { new: true }).lean().exec(),
    createPattern: (courseId: string, participantId: string, stateJson: string) =>
      models.patternDesigns.create({ courseId, participantId, revision: 1, stateJson, exports: [] }),
    addPatternExport: (courseId: string, participantId: string, revision: number, output: PatternExport) =>
      models.patternDesigns.findOneAndUpdate({ courseId, participantId, revision,
        'exports.revision': { $ne: revision } }, { $push: { exports: { $each: [output], $slice: -20 } } },
      { new: true }).lean().exec(),
    ensurePatternArtwork: (data: { artworkId: string; courseId: string; participantId: string;
      objectKey: string; statement: string }) => models.artworks.findOneAndUpdate(
      { artworkId: data.artworkId }, { $setOnInsert: data }, { upsert: true, new: true }).lean().exec(),
  };
}
