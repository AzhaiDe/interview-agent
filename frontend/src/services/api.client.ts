import axios from 'axios';
import { useAuthStore } from '@/features/auth/auth.store';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 120_000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Convert an Axios error into a useful, user-facing diagnostic. */
export const describeApiError = (error: unknown): string => {
  const candidate = error as any;
  const status = candidate?.response?.status;
  const payload = candidate?.response?.data;
  const detail = payload?.error || payload?.message || candidate?.message || '未知错误';
  const type = status ? `HTTP ${status}${candidate?.response?.statusText ? ` ${candidate.response.statusText}` : ''}` : '网络错误';
  return `${type}：${detail}`;
};

apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  // Feature APIs return the JSON payload directly. Keeping this contract
  // consistent is important for auth: useLogin expects `data.token` here.
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
      useAuthStore.getState().logout();
    }
    error.message = describeApiError(error);
    return Promise.reject(error);
  },
);
