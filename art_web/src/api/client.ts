const API_BASE_URL = '/api';
export const AUTH_SESSION_EXPIRED_EVENT = 'original-sense:session-expired';

type ApiEnvelope<T> = {
  code: number;
  success: boolean;
  data?: T;
  message?: string;
};

type UploadProgressHandler = (percent: number) => void;

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function notifySessionExpired(status: number): void {
  if (status === 401) window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    notifySessionExpired(response.status);
    throw new ApiError(payload.message ?? 'Request failed', response.status);
  }
  return payload.data;
}

export function apiUploadRequest<T>(
  path: string,
  body: unknown,
  token: string,
  onProgress: UploadProgressHandler
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_BASE_URL}${path}`);
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', 'application/json');
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new ApiError('Network error while uploading', 0));
    request.onload = () => {
      try {
        const payload = JSON.parse(request.responseText) as ApiEnvelope<T>;
        if (request.status >= 400 || !payload.success || payload.data === undefined) {
          notifySessionExpired(request.status);
          reject(new ApiError(payload.message ?? 'Upload failed', request.status));
          return;
        }
        resolve(payload.data);
      } catch {
        reject(new ApiError('Invalid upload response', request.status));
      }
    };
    request.send(JSON.stringify(body));
  });
}
