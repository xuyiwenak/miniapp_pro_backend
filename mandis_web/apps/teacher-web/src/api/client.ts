import axios from 'axios';

export const http = axios.create({ timeout: 20000, withCredentials: true });

http.interceptors.response.use(
  (response) => {
    const body = response.data as { success?: boolean; data?: unknown; message?: string };
    if (!body.success) throw new Error(body.message ?? '请求失败');
    return { ...response, data: body.data };
  },
  (error) => Promise.reject(new Error(error.response?.data?.message ?? error.message ?? '请求失败'))
);
