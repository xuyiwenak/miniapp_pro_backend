import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../api';
import type { PatternState, Preview } from '@pattern/contract';
/** Serialize preview requests, discard obsolete queued jobs and never display an outdated response. */
export function usePreview(
  courseId: string, token: string, state: PatternState, ringIndex: number, enabled: boolean, readOnly = false,
) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  const sequence = useRef(0); const queue = useRef(Promise.resolve());
  useEffect(() => {
    const id = ++sequence.current;
    if (!enabled) { setPending(false); return; }
    setPending(true); setError('');
    const timer = window.setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (sequence.current !== id) return;
        try {
          const result = await api<Preview>(`/courses/${courseId}/design/preview`, {
            method: readOnly ? 'GET' : 'POST', body: readOnly ? undefined : JSON.stringify({ state, ringIndex }),
          }, token);
          if (sequence.current === id) setPreview(result);
        } catch (error) { if (sequence.current === id) setError(errorMessage(error)); }
        finally { if (sequence.current === id) setPending(false); }
      });
    }, 300);
    return () => { window.clearTimeout(timer); sequence.current++; };
  }, [courseId, token, state, ringIndex, enabled, readOnly]);
  return { preview, pending, error };
}
