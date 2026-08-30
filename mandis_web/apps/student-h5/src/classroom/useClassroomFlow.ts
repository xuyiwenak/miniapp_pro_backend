import { useCallback, useEffect, useState } from 'react';
import type {
  AssessmentAnswers,
  ClassroomInfo,
  EchoResult,
  Locale,
  ParticipationState,
} from '@mandis/common/classroom-types';
import { studentClassroomApi } from './api';
import {
  getResumeToken,
  getSavedLocale,
  loadClassroomCache,
  loadParticipationCache,
  saveClassroomCache,
  saveLocale,
  saveParticipationCache,
  saveResumeToken,
} from './storage';

export function useClassroomFlow(accessCode: string) {
  const [locale, setLocaleState] = useState<Locale>(getSavedLocale);
  const [classroom, setClassroom] = useState<ClassroomInfo | null>(() => loadClassroomCache(accessCode));
  const [participation, setParticipation] = useState<ParticipationState | null>(() =>
    loadParticipationCache(accessCode)
  );
  const [token, setToken] = useState(() => getResumeToken(accessCode));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [teacherUploadConfirmation, setTeacherUploadConfirmation] = useState<ParticipationState | null>(null);

  function changeLocale(next: Locale): void {
    setLocaleState(next);
    saveLocale(next);
    document.documentElement.lang = next;
  }

  const updateParticipation = useCallback(
    (next: ParticipationState): void => {
      setParticipation(next);
      saveParticipationCache(accessCode, next);
    },
    [accessCode]
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) return;
    updateParticipation(await studentClassroomApi.state(token));
  }, [token, updateParticipation]);

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      try {
        const info = await studentClassroomApi.classroom(accessCode);
        if (!active) return;
        setClassroom(info);
        saveClassroomCache(accessCode, info);
        if (token) {
          const resumed = await studentClassroomApi.start(accessCode, token);
          if (active) updateParticipation(resumed);
        }
      } catch (nextError) {
        if (active) setError(nextError instanceof Error ? nextError.message : 'Classroom unavailable');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [accessCode, token, updateParticipation]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void studentClassroomApi.heartbeat(token);
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, refresh]);

  async function run(action: () => Promise<ParticipationState>, throwOnFailure = false): Promise<void> {
    setSaving(true);
    setError('');
    try {
      updateParticipation(await action());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Request failed');
      if (throwOnFailure) throw nextError;
    } finally {
      setSaving(false);
    }
  }

  async function start(): Promise<void> {
    setSaving(true);
    try {
      const started = await studentClassroomApi.start(accessCode);
      const nextToken = started.resumeToken ?? '';
      saveResumeToken(accessCode, nextToken);
      setToken(nextToken);
      updateParticipation(started);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to join');
    } finally {
      setSaving(false);
    }
  }

  async function requestTeacherUpload(): Promise<void> {
    setSaving(true);
    setError('');
    try {
      setTeacherUploadConfirmation(await studentClassroomApi.requestTeacherUpload(token));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Request failed');
    } finally {
      setSaving(false);
    }
  }

  function confirmTeacherUpload(): void {
    if (!teacherUploadConfirmation) return;
    updateParticipation(teacherUploadConfirmation);
    setTeacherUploadConfirmation(null);
  }

  const loadEcho = useCallback((): Promise<EchoResult> => studentClassroomApi.echo(token), [token]);
  return {
    locale,
    classroom,
    participation,
    token,
    loading,
    saving,
    error,
    teacherUploadConfirmation,
    changeLocale,
    start,
    refresh,
    loadEcho,
    consent: () => run(() => studentClassroomApi.consent(token)),
    saveProfile: (profile: Record<string, string>) => run(() => studentClassroomApi.profile(token, profile)),
    saveDraft: (timepoint: 'pre' | 'post', page: number, answers: AssessmentAnswers, clientRecovered: boolean) =>
      run(() => studentClassroomApi.saveDraft(token, timepoint, page, locale, answers, clientRecovered), true),
    submitAssessment: (
      timepoint: 'pre' | 'post',
      page: number,
      answers: AssessmentAnswers,
      durationMs: number,
      clientRecovered: boolean
    ) =>
      run(
        () =>
          studentClassroomApi.submitAssessment(token, timepoint, page, locale, answers, durationMs, clientRecovered),
        true
      ),
    completeActivity: () => run(() => studentClassroomApi.completeActivity(token)),
    uploadArtwork: (dataUrl: string) => run(() => studentClassroomApi.uploadArtwork(token, dataUrl)),
    requestTeacherUpload,
    confirmTeacherUpload,
    submitFeedback: (input: Record<string, unknown>) => run(() => studentClassroomApi.feedback(token, input)),
  };
}
