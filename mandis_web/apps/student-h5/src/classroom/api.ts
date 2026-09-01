import type {
  AssessmentAnswers,
  ClassroomInfo,
  EchoResult,
  Locale,
  ParticipantProfile,
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

function post<T>(path: string, body: unknown, token?: string, idempotencyKey?: string): Promise<T> {
  return classroomRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }, token, idempotencyKey);
}

export const studentClassroomApi = {
  classroom: (accessCode: string) => classroomRequest<ClassroomInfo>(`/classrooms/${accessCode}`),
  start: (accessCode: string, resumeToken: string, idempotencyKey: string) =>
    classroomRequest<ParticipationState>(
      '/classroom-participation/start',
      {
        method: 'POST',
        body: JSON.stringify({ accessCode, resumeToken }),
      },
      undefined,
      idempotencyKey
    ),
  state: (token: string) => classroomRequest<ParticipationState>('/classroom-participation/state', {}, token),
  heartbeat: (token: string) => post('/classroom-participation/heartbeat', {}, token),
  consent: (token: string, idempotencyKey: string) =>
    post<ParticipationState>(
      '/classroom-participation/consent',
      { consentVersion: 'classroom-consent-v1' },
      token,
      idempotencyKey
    ),
  profile: (token: string, profile: ParticipantProfile, idempotencyKey: string) =>
    post<ParticipationState>('/classroom-participation/profile', profile, token, idempotencyKey),
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
    clientRecovered: boolean,
    idempotencyKey: string
  ) =>
    post<ParticipationState>(
      `/classroom-participation/assessment/${timepoint}/submit`,
      { page, locale, ...answers, durationMs, clientRecovered },
      token,
      idempotencyKey
    ),
  completeActivity: (token: string, idempotencyKey: string) =>
    post<ParticipationState>('/classroom-participation/activity/complete', {}, token, idempotencyKey),
  requestTeacherUpload: (token: string, idempotencyKey: string) =>
    post<ParticipationState>('/classroom-participation/artwork/request-teacher-upload', {}, token, idempotencyKey),
  uploadArtwork: (token: string, dataUrl: string, idempotencyKey: string) =>
    post<ParticipationState>('/classroom-participation/artwork', { dataUrl }, token, idempotencyKey),
  artworkStatus: (token: string) =>
    classroomRequest<{ artworkStatus: string; healingStatus: string }>(
      '/classroom-participation/artwork/status',
      {},
      token
    ),
  echo: (token: string) => classroomRequest<EchoResult>('/classroom-participation/echo', {}, token),
  complete: (token: string, idempotencyKey: string) =>
    post<ParticipationState>('/classroom-participation/complete', {}, token, idempotencyKey),
  feedback: (token: string, input: Record<string, unknown>, idempotencyKey: string) =>
    post<ParticipationState>('/classroom-participation/feedback', input, token, idempotencyKey),
};
