import type {
  AssessmentAnswers,
  ClassroomInfo,
  EchoResult,
  Locale,
  ParticipationState,
} from '@mandis/common/classroom-types';

const API_BASE = '/api';

type ApiEnvelope<T> = { success: boolean; data?: T; message?: string };

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const responseText = await response.text();
  try {
    return JSON.parse(responseText) as ApiEnvelope<T>;
  } catch {
    throw new Error('课堂服务暂不可用，请稍后重试');
  }
}

async function classroomRequest<T>(
  path: string,
  options: RequestInit = {},
  resumeToken?: string,
  idempotencyKey?: string
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (resumeToken) headers.set('X-Participation-Token', resumeToken);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const payload = await readEnvelope<T>(response);
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.message ?? 'Request failed');
  }
  return payload.data;
}

function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  return classroomRequest<T>(
    path,
    { method: 'POST', body: JSON.stringify(body) },
    token,
    crypto.randomUUID()
  );
}

export const studentClassroomApi = {
  classroom: (accessCode: string) =>
    classroomRequest<ClassroomInfo>(`/classrooms/${accessCode}`),
  start: (accessCode: string, resumeToken?: string) =>
    classroomRequest<ParticipationState>('/classroom-participation/start', {
      method: 'POST',
      body: JSON.stringify({ accessCode, resumeToken: resumeToken || undefined }),
    }),
  state: (token: string) => classroomRequest<ParticipationState>('/classroom-participation/state', {}, token),
  heartbeat: (token: string) => post('/classroom-participation/heartbeat', {}, token),
  consent: (token: string) =>
    post<ParticipationState>(
      '/classroom-participation/consent',
      { consentVersion: 'classroom-consent-v1' },
      token
    ),
  profile: (token: string, profile: Record<string, string>) =>
    post<ParticipationState>('/classroom-participation/profile', profile, token),
  saveDraft: (
    token: string,
    timepoint: 'pre' | 'post',
    page: number,
    locale: Locale,
    answers: AssessmentAnswers,
    clientRecovered: boolean
  ) =>
    classroomRequest<ParticipationState>(
      `/classroom-participation/assessment/${timepoint}/draft`,
      { method: 'PUT', body: JSON.stringify({ page, locale, ...answers, clientRecovered }) },
      token
    ),
  submitAssessment: (
    token: string,
    timepoint: 'pre' | 'post',
    page: number,
    locale: Locale,
    answers: AssessmentAnswers,
    durationMs: number,
    clientRecovered: boolean
  ) =>
    post<ParticipationState>(
      `/classroom-participation/assessment/${timepoint}/submit`,
      { page, locale, ...answers, durationMs, clientRecovered },
      token
    ),
  completeActivity: (token: string) =>
    post<ParticipationState>('/classroom-participation/activity/complete', {}, token),
  requestTeacherUpload: (token: string) =>
    post<ParticipationState>('/classroom-participation/artwork/request-teacher-upload', {}, token),
  uploadArtwork: (token: string, dataUrl: string) =>
    post<ParticipationState>('/classroom-participation/artwork', { dataUrl }, token),
  artworkStatus: (token: string) =>
    classroomRequest<{ artworkStatus: string; healingStatus: string }>(
      '/classroom-participation/artwork/status',
      {},
      token
    ),
  echo: (token: string) => classroomRequest<EchoResult>('/classroom-participation/echo', {}, token),
  feedback: (token: string, input: Record<string, unknown>) =>
    post<ParticipationState>('/classroom-participation/feedback', input, token),
};
