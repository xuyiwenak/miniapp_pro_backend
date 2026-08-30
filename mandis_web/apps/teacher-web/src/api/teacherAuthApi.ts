import { http } from './client';

export type TeacherProfile = {
  teacherId: string;
  displayName: string;
  organization?: string;
};

export const teacherAuthApi = {
  profile: () => http.get<TeacherProfile>('/api/teacher/profile'),
  login: (email: string, password: string) =>
    http.post('/api/web-auth/email/password/login', { email, password }),
  sendRegistrationCode: (email: string) =>
    http.post('/api/web-auth/email/register/send', { email, locale: 'zh-CN' }),
  register: (email: string, password: string, emailCode: string) =>
    http.post('/api/web-auth/email/register', { email, password, emailCode }),
  activate: (displayName: string, organization?: string) =>
    http.post<TeacherProfile>('/api/teacher/profile/activate', {
      displayName,
      organization,
    }),
  logout: () => http.post('/api/web-auth/logout'),
};
