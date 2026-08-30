import { http } from './client';
import type {
  ClassroomInput,
  ClassroomProgress,
  ClassroomRecord,
  PendingArtwork,
} from '@mandis/common/classroom-types';
export type {
  AssessmentCounts,
  ClassroomInput,
  ClassroomProgress,
  ClassroomRecord,
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
  progress: (classId: string) =>
    http.get<ClassroomProgress>(`${BASE_PATH}/${classId}/progress`),
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
};
