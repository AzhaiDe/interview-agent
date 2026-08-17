import axios from 'axios';
import { useAuthStore } from '@/features/auth/auth.store';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 30_000,
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

// Request interceptor: inject auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: unified error handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // A failed login/register request must not clear the existing client state.
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
      useAuthStore.getState().logout();
    }
    error.message = describeApiError(error);
    return Promise.reject(error);
  }
);
