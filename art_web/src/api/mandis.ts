import { apiRequest } from './client';

export type AuthResult = { token: string; userId: string };

export type AuthProfile = {
  userId: string;
  nickname?: string;
  phone?: string;
  email?: string;
};

export type ReportItem = {
  workId: string;
  coverUrl: string;
  desc: string;
  dominantEmotionLabel: string;
  createdAt: string;
};

export function requestSms(phone: string): Promise<{ expiresInSeconds: number }> {
  return apiRequest('/web-auth/sms/send', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function verifySms(phone: string, code: string): Promise<AuthResult> {
  return apiRequest('/web-auth/sms/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
}

export function requestEmail(email: string, locale: string): Promise<{ expiresInSeconds: number }> {
  return apiRequest('/web-auth/email/send', {
    method: 'POST',
    body: JSON.stringify({ email, locale }),
  });
}

export function verifyEmail(email: string, code: string): Promise<AuthResult> {
  return apiRequest('/web-auth/email/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export function getAuthProfile(token: string): Promise<AuthProfile> {
  return apiRequest('/web-auth/profile', {}, token);
}

export function requestBoundPhone(phone: string, token: string): Promise<{ expiresInSeconds: number }> {
  return apiRequest('/web-auth/profile/phone/send', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  }, token);
}

export function bindPhone(phone: string, code: string, token: string): Promise<unknown> {
  return apiRequest('/web-auth/profile/phone/bind', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  }, token);
}

export function requestBoundEmail(email: string, locale: string, token: string): Promise<{ expiresInSeconds: number }> {
  return apiRequest('/web-auth/profile/email/send', {
    method: 'POST',
    body: JSON.stringify({ email, locale }),
  }, token);
}

export function bindEmail(email: string, code: string, token: string): Promise<unknown> {
  return apiRequest('/web-auth/profile/email/bind', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  }, token);
}

export function publishArtwork(file: File, token: string): Promise<{ workId: string }> {
  return readFileAsDataUrl(file).then((data) =>
    apiRequest(
      '/work/publish',
      {
        method: 'POST',
        body: JSON.stringify({
          images: [{ name: file.name, type: file.type, data }],
          status: 'published',
        }),
      },
      token
    )
  );
}

export function beginAnalysis(workId: string, token: string): Promise<{ workId: string }> {
  return apiRequest(
    '/healing/analyze',
    {
      method: 'POST',
      body: JSON.stringify({ workId }),
    },
    token
  );
}

export function listReports(token: string): Promise<ReportItem[]> {
  return apiRequest('/healing/list', {}, token);
}

export type ReportDetail = ReportItem & {
  title?: string;
  colorAnalysis?: string;
  compositionReport?: string;
  lineAnalysis?: string;
  suggestion?: string;
};

export function getReport(workId: string, token: string): Promise<ReportDetail> {
  return apiRequest(`/healing/report?workId=${encodeURIComponent(workId)}`, {}, token);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}
