import { useEffect, useRef, useState } from 'react';
import type { CeramicView } from '@pattern/contract';
import { api, ApiError, errorMessage } from '../../api';
const POLL_MS = 5000;
export function useCeramic(courseId: string, token: string, revision: number) {
  const base = `/courses/${courseId}/design/ceramic`;
  const [jobs, setJobs] = useState<CeramicView[]>([]); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const locked = useRef(false);
  const job = jobs.find(item => item.revision === revision);
  const pending = job?.status === 'pending' || job?.status === 'submitting';
  useEffect(() => {
    let disposed = false;
    api<CeramicView[]>(base, {}, token).then(data => { if (!disposed) setJobs(data); })
      .catch(error => { if (!disposed) setError(errorMessage(error)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [base, token, revision]);
  const update = (data: CeramicView) => setJobs(old =>
    [data, ...old.filter(item => item.revision !== data.revision)].sort((a, b) => b.revision - a.revision));
  useCeramicPolling(base, token, revision, Boolean(pending), update, setError);
  async function generate() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      update(await api<CeramicView>(base, { method: 'POST', body: JSON.stringify({ revision }) }, token));
    } catch (error) { setError(errorMessage(error)); }
    finally { locked.current = false; setBusy(false); }
  }
  return { jobs, job, error, busy, loading, generate };
}
function useCeramicPolling(base: string, token: string, revision: number, pending: boolean,
  update: (job: CeramicView) => void, setError: (error: string) => void) {
  const onUpdate = useRef(update); onUpdate.current = update;
  useEffect(() => {
    if (!pending) return;
    let disposed = false; let querying = false;
    const timer = setInterval(() => {
      if (querying) return;
      querying = true;
      api<CeramicView>(`${base}/${revision}`, {}, token).then(data => {
        if (!disposed) { onUpdate.current(data); setError(''); }
      }).catch(error => {
        if (!disposed && !(error instanceof ApiError && error.status === 409)) setError(errorMessage(error));
      }).finally(() => { querying = false; });
    }, POLL_MS);
    return () => { disposed = true; clearInterval(timer); };
  }, [base, token, revision, pending, setError]);
}
