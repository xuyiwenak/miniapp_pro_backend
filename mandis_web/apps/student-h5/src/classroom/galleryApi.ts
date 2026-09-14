import type { GalleryState, GalleryDetail, PeerAnswers, EvaluationInput } from '@mandis/common/classroom-types';
import { classroomRequest } from './api';

const BASE = '/classroom-participation/gallery';
function write<T>(token: string, path: string, body: unknown) {
  return classroomRequest<T>(`${BASE}${path}`, { method: 'POST', body: JSON.stringify(body) },
    token, crypto.randomUUID());
}
export const galleryApi = {
  list: (token: string, cursor?: string) => classroomRequest<GalleryState>(
    `${BASE}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {}, token),
  detail: (token: string, id: string) => classroomRequest<GalleryDetail>(`${BASE}/${id}`, {}, token),
  sharing: (token: string, sharing: boolean) => write<{ sharing: boolean }>(token, '/sharing', { sharing }),
  save: (token: string, id: string, stage: 'independent' | 'feedback',
    answers: PeerAnswers | Partial<EvaluationInput>, submit: boolean, consent: boolean) =>
    write<GalleryDetail>(token, `/${id}/${stage}`, { answers, submit, consent }),
  image: async (token: string, id: string, signal: AbortSignal) => {
    const response = await fetch(`/api${BASE}/${id}/image`, { headers: { 'X-Participation-Token': token }, signal });
    if (!response.ok) throw new Error('图片暂时无法读取');
    return URL.createObjectURL(await response.blob());
  },
};
