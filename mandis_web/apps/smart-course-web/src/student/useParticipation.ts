import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import type { Course, Participation, Turn } from '../types';
export function useParticipation(code: string) {
  const storageKey = `smartCourse:participation:${code}`;
  const [token, setToken] = useState(() => localStorage.getItem(storageKey) || '');
  const [course, setCourse] = useState<Course | null>(null);
  const [data, setData] = useState<Participation | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [consent, setConsent] = useState(false);
  async function load() {
    setError(''); setLoading(true);
    try { const course = await api<Course>(`/join/${code}`); setCourse(course);
      if (token) setData(await api<Participation>(`/courses/${course.courseId}`, {}, token)); }
    catch (error) { if (error instanceof ApiError && error.status === 401) {
      localStorage.removeItem(storageKey); setToken(''); setData(null);
    } else setError(errorMessage(error)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [code, token]);
  async function join() {
    setBusy(true); setError('');
    try { const result = await api<{ token: string; course: Course }>(`/join/${code}`, {
      method: 'POST', body: JSON.stringify({ consent }),
    }); localStorage.setItem(storageKey, result.token); setToken(result.token); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function complete() {
    if (!course) return; setBusy(true);
    try { await api(`/courses/${course.courseId}/complete`, { method: 'POST' }, token); await load(); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  function onTurn(turn: Turn) { setData(current => current ? { ...current,
    turns: [...current.turns.filter(item => item.requestId !== turn.requestId), turn] } : current); }
  return { token, course, data, error, busy, loading, consent, setConsent, load, join, complete, onTurn };
}
