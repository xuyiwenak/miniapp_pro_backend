import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, ApiError } from '../api';
import type { Course, Dashboard } from '../types';
export function useTeacherCourses() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<Course[]>([]); const [selected, setSelected] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState(''); const [agentReady, setAgentReady] = useState<boolean | null>(null);
  const requestSequence = useRef(0);
  async function load() {
    try { const result = await api<{ courses: Course[]; agentReady: boolean }>('/teacher/courses');
      setSignedIn(true); setCourses(result.courses); setAgentReady(result.agentReady);
      setSelected(value => value || result.courses[0]?.courseId || ''); setError(''); }
    catch (error) { if (error instanceof ApiError && error.status === 401) setSignedIn(false);
    else { setSignedIn(true); setError(errorMessage(error)); } }
  }
  async function detail() {
    if (!selected) return;
    const sequence = ++requestSequence.current; setData(null);
    try { const result = await api<Dashboard>(`/teacher/courses/${selected}`);
      if (sequence === requestSequence.current) setData(result); }
    catch (error) { if (sequence === requestSequence.current) setError(errorMessage(error)); }
  }
  useEffect(() => {
    const update = () => { if (!document.hidden) void load(); };
    update();
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => { void detail(); return () => { requestSequence.current++; }; }, [selected]);
  async function refresh() { await load(); await detail(); }
  async function logout() { try { await api('/teacher/logout', { method: 'POST' });
    setSignedIn(false); setSelected(''); setData(null); } catch (error) { setError(errorMessage(error)); } }
  return { signedIn, courses, selected, setSelected, data, error, agentReady, load, refresh, logout };
}
