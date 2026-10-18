import type { Dependencies } from '../http';
import type { CeramicJob } from '../dbservice/ceramicModels';
import type { Session } from '../schemas';
import { requireValue, SmartCourseError } from '../errors';
import { configuredCapabilities } from '../config';
import { assertRevision, patternAccess } from './patternDesign';
import { CERAMIC_PROMPT_VERSION, createCeramicProvider } from './ceramicProvider';
const SUBMISSION_GRACE_MS = 120_000;
const TASK_RETENTION_MS = 23 * 60 * 60 * 1000;
export function ceramicReady(deps: Dependencies) {
  return Boolean(deps.config.SMARTCOURSE_BAILIAN_API_KEY && configuredCapabilities(deps.config).uploadReady);
}
export function ceramicView(job: CeramicJob, deps: Dependencies) {
  const status = job.status === 'submitting' && Date.now() - job.startedAt.getTime() > SUBMISSION_GRACE_MS
    ? 'unknown' : job.status;
  return { revision: job.revision, status, model: job.model, createdAt: job.createdAt.toISOString(),
    imageUrl: job.objectKey ? deps.storage.sign(job.objectKey) : undefined };
}
export async function ceramicViews(deps: Dependencies, courseId: string, participantId: string) {
  return (await deps.repo.ceramicJobs(courseId, participantId)).map(job => ceramicView(job, deps));
}
export async function startCeramic(deps: Dependencies, courseId: string, session: Session, revision: number) {
  await patternAccess(deps, courseId, session, true);
  if (!ceramicReady(deps) && !deps.ceramicProvider) {
    throw new SmartCourseError(503, 'IMAGE_NOT_CONFIGURED', '陶瓷效果图尚未配置，可以先保存盘面设计');
  }
  return deps.access.withLock(`ceramic:${courseId}:${session.id}:${revision}`, async () => {
    const design = requireValue(await deps.repo.patternDesign(courseId, session.id)); assertRevision(design, revision);
    const output = requireValue(design.exports.find(item => item.revision === revision), '请先保存准确盘面');
    const job = await deps.repo.ceramicJob(courseId, session.id, revision);
    if (job && job.status !== 'failed') return ceramicView(job, deps);
    await deps.access.rate(`ceramic-submit:${session.id}`, 3);
    if (job) await deps.repo.updateCeramicJob(courseId, session.id, revision, { status: 'submitting', startedAt: new Date() });
    else await deps.repo.createCeramicJob({ courseId, participantId: session.id, revision, status: 'submitting', startedAt: new Date(),
      model: deps.config.SMARTCOURSE_IMAGE_MODEL, promptVersion: CERAMIC_PROMPT_VERSION });
    return submitCeramic(deps, courseId, session.id, revision, deps.storage.sign(output.objectKey));
  });
}
async function submitCeramic(deps: Dependencies, courseId: string, participantId: string,
  revision: number, imageUrl: string) {
  const provider = deps.ceramicProvider || createCeramicProvider(deps.config);
  try {
    const taskId = await provider.submit(imageUrl);
    const job = requireValue(await deps.repo.updateCeramicJob(courseId, participantId, revision,
      { taskId, status: 'pending' }));
    return ceramicView(job, deps);
  } catch (error) {
    // A lost submission response may already have incurred a charge. Never blindly resubmit it.
    const status = error instanceof SmartCourseError && error.code === 'IMAGE_REJECTED' ? 'failed' : 'unknown';
    return ceramicView(requireValue(await deps.repo.updateCeramicJob(courseId, participantId, revision,
      { status })), deps);
  }
}
export async function refreshCeramic(deps: Dependencies, courseId: string, participantId: string, revision: number) {
  return deps.access.withLock(`ceramic:${courseId}:${participantId}:${revision}`, async () => {
    const job = requireValue(await deps.repo.ceramicJob(courseId, participantId, revision));
    if (job.status !== 'pending' || !job.taskId) return ceramicView(job, deps);
    const provider = deps.ceramicProvider || createCeramicProvider(deps.config);
    if (Date.now() - job.startedAt.getTime() > TASK_RETENTION_MS) {
      return ceramicView(requireValue(await deps.repo.updateCeramicJob(courseId, participantId, revision,
        { status: 'unknown' })), deps);
    }
    const result = await provider.query(job.taskId);
    if (result.status === 'pending') return ceramicView(job, deps);
    if (result.status !== 'success') {
      return ceramicView(requireValue(await deps.repo.updateCeramicJob(courseId, participantId, revision,
        { status: result.status })), deps);
    }
    const image = await provider.download(requireValue(result.imageUrl, '效果图暂时无法读取'));
    const objectKey = await deps.storage.uploadPng(image, courseId, participantId, `ceramic/${revision}`);
    return ceramicView(requireValue(await deps.repo.updateCeramicJob(courseId, participantId, revision,
      { status: 'success', objectKey })), deps);
  });
}
