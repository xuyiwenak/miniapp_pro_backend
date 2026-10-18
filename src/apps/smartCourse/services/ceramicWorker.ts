import type { Dependencies } from '../http';
import { gameLogger } from '../../../util/logger';
import { SmartCourseError } from '../errors';
import { refreshCeramic } from './ceramic';
const POLL_MS = 5000;
const SUBMISSION_GRACE_MS = 120_000;
/** Reconciles already-submitted jobs only. It never starts or retries paid generation. */
export function startCeramicWorker(deps: Dependencies) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const jobs = await deps.repo.pendingCeramicJobs();
      for (const job of jobs) {
        if (job.status === 'submitting') {
          if (Date.now() - job.startedAt.getTime() > SUBMISSION_GRACE_MS) {
            await deps.repo.updateCeramicJob(job.courseId, job.participantId, job.revision, { status: 'unknown' });
          }
          continue;
        }
        try { await refreshCeramic(deps, job.courseId, job.participantId, job.revision); }
        catch (error) {
          if (!(error instanceof SmartCourseError && error.code === 'BUSY')) {
            gameLogger.warn('Ceramic result reconciliation deferred', { courseId: job.courseId, revision: job.revision });
          }
        }
      }
    } catch { gameLogger.warn('Ceramic pending-job scan deferred'); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, POLL_MS); timer.unref(); void tick();
  return () => clearInterval(timer);
}
