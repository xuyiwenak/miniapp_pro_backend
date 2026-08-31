import { http } from './client';
import type {
  ClassroomInput,
  ClassroomAssessmentSummary,
  AssessmentParticipantPage,
  ClassroomProgress,
  ClassroomRecord,
  ClassroomCollaborator,
  ArtworkCorrectionAudit,
  PendingArtwork,
} from '@mandis/common/classroom-types';
export type {
  AssessmentMeasureSummary,
  AssessmentParticipantPage,
  AssessmentParticipantRow,
  AssessmentCounts,
  ClassroomAssessmentSummary,
  ClassroomInput,
  ClassroomProgress,
  ClassroomRecord,
  ClassroomCollaborator,
  ArtworkCorrectionAudit,
  PendingArtwork,
} from '@mandis/common/classroom-types';

const BASE_PATH = '/api/teacher/classrooms';

export const classroomApi = {
  list: () => http.get<{ list: ClassroomRecord[] }>(BASE_PATH),
  create: (input: ClassroomInput) =>
    http.post<ClassroomRecord>(BASE_PATH, input),
  update: (classId: string, input: ClassroomInput) =>
    http.patch<ClassroomRecord>(`${BASE_PATH}/${classId}`, input),
  open: (classId: string) =>
    http.post<{ studentUrl: string }>(`${BASE_PATH}/${classId}/open`),
  close: (classId: string) =>
    http.post<{ gracePeriodEndsAt: string }>(`${BASE_PATH}/${classId}/close`),
  finalize: (classId: string) =>
    http.post<{ finalizedAt: string; finalizedBy: 'teacher' }>(
      `${BASE_PATH}/${classId}/finalize`
    ),
  progress: (classId: string) =>
    http.get<ClassroomProgress>(`${BASE_PATH}/${classId}/progress`),
  assessmentResults: (classId: string) =>
    http.get<ClassroomAssessmentSummary>(
      `${BASE_PATH}/${classId}/assessment-results`
    ),
  assessmentParticipants: (classId: string, page: number, pageSize: number) =>
    http.get<AssessmentParticipantPage>(
      `${BASE_PATH}/${classId}/assessment-results/participants`,
      { params: { page, pageSize } }
    ),
  exportAssessmentResults: (classId: string, format: 'xlsx' | 'csv') =>
    http.get<Blob>(`${BASE_PATH}/${classId}/assessment-results/export`, {
      params: { format },
      responseType: 'blob',
    }),
  pendingArtworks: (classId: string) =>
    http.get<{ list: PendingArtwork[] }>(
      `${BASE_PATH}/${classId}/pending-artworks`
    ),
  createArtworkPlaceholder: (classId: string) =>
    http.post<{ classroomCode: string }>(
      `${BASE_PATH}/${classId}/artwork-placeholders`
    ),
  uploadArtwork: (
    classId: string,
    classroomCode: string,
    input: { dataUrl: string; reason: string },
    idempotencyKey: string
  ) =>
    http.post<{ artworkId: string }>(
      `${BASE_PATH}/${classId}/participants/${classroomCode}/artwork`,
      input,
      { headers: { 'Idempotency-Key': idempotencyKey } }
    ),
  collaborators: (classId: string) =>
    http.get<{ list: ClassroomCollaborator[] }>(`${BASE_PATH}/${classId}/collaborators`),
  addCollaborator: (classId: string, teacherId: string) =>
    http.post<ClassroomCollaborator>(`${BASE_PATH}/${classId}/collaborators`, { teacherId }),
  removeCollaborator: (classId: string, teacherId: string) =>
    http.delete<{ removed: boolean }>(`${BASE_PATH}/${classId}/collaborators/${teacherId}`),
  corrections: (classId: string) =>
    http.get<{ list: ArtworkCorrectionAudit[] }>(`${BASE_PATH}/${classId}/artwork-corrections`),
  correctArtwork: (
    classId: string,
    classroomCode: string,
    input: { dataUrl: string; correctionType: 'late_upload' | 'replace'; reason: string },
    idempotencyKey: string
  ) =>
    http.post<{ correctionId: string; artworkId: string }>(
      `${BASE_PATH}/${classId}/artwork-corrections/${classroomCode}`,
      input,
      { headers: { 'Idempotency-Key': idempotencyKey } }
    ),
};
