import type {
  AssessmentAnswers,
  ClassroomInfo,
  Locale,
  ParticipationState,
} from '@mandis/common/classroom-types';

const STORAGE_PREFIX = 'original-sense-classroom';
const LOCALE_KEY = `${STORAGE_PREFIX}:locale`;

export function getResumeToken(accessCode: string): string {
  return localStorage.getItem(`${STORAGE_PREFIX}:${accessCode}:token`) ?? '';
}

export function saveResumeToken(accessCode: string, token: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}:${accessCode}:token`, token);
}

function cacheKey(accessCode: string, name: string): string {
  return `${STORAGE_PREFIX}:${accessCode}:${name}`;
}

function readCache<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadClassroomCache(accessCode: string): ClassroomInfo | null {
  return readCache<ClassroomInfo>(cacheKey(accessCode, 'classroom'));
}

export function saveClassroomCache(accessCode: string, classroom: ClassroomInfo): void {
  localStorage.setItem(cacheKey(accessCode, 'classroom'), JSON.stringify(classroom));
}

export function loadParticipationCache(accessCode: string): ParticipationState | null {
  return readCache<ParticipationState>(cacheKey(accessCode, 'participation'));
}

export function saveParticipationCache(accessCode: string, state: ParticipationState): void {
  const cached = {
    ...state,
    preAssessment: { ...state.preAssessment, vad: undefined, panas: undefined },
    postAssessment: { ...state.postAssessment, vad: undefined, panas: undefined },
  };
  localStorage.setItem(cacheKey(accessCode, 'participation'), JSON.stringify(cached));
}

export function getSavedLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved === 'zh-CN' || saved === 'en') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function saveLocale(locale: Locale): void {
  localStorage.setItem(LOCALE_KEY, locale);
}

export function saveAssessmentDraft(
  accessCode: string,
  timepoint: 'pre' | 'post',
  page: number,
  answers: AssessmentAnswers
): void {
  localStorage.setItem(
    `${STORAGE_PREFIX}:${accessCode}:${timepoint}`,
    JSON.stringify({ page, answers, savedAt: new Date().toISOString() })
  );
}

export function loadAssessmentDraft(
  accessCode: string,
  timepoint: 'pre' | 'post'
): { page: 1 | 2 | 3; answers: AssessmentAnswers } | null {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}:${accessCode}:${timepoint}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { page?: number; answers?: AssessmentAnswers };
    if (![1, 2, 3].includes(parsed.page ?? 0) || !parsed.answers) return null;
    return { page: parsed.page as 1 | 2 | 3, answers: parsed.answers };
  } catch {
    return null;
  }
}

export function clearAssessmentDraft(accessCode: string, timepoint: 'pre' | 'post'): void {
  localStorage.removeItem(`${STORAGE_PREFIX}:${accessCode}:${timepoint}`);
}
