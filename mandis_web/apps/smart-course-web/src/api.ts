const API_BASE = import.meta.env.VITE_API_BASE || '/smartcourse-api';
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, {
    signal: AbortSignal.timeout(120_000), ...init, headers, credentials: 'same-origin',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.message || '请求未完成，请稍后重试');
  return body as T;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求未完成，请稍后重试';
}
export function joinUrl(code: string) {
  return `${location.origin}${import.meta.env.BASE_URL}#/join/${code}`;
}
