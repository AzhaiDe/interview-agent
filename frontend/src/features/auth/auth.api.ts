import { apiClient } from '@/services/api.client';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  displayName?: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  displayName: string;
}

// Authentication routes intentionally live outside the versioned API namespace.
// Override apiClient's default `/api/v1` base URL so these requests do not become
// `/api/v1/api/auth/*`, which the server correctly treats as an unauthenticated
// protected request.
const authRequestConfig = { baseURL: '/' } as const;

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>('/api/auth/login', data, authRequestConfig),

  register: (data: RegisterRequest) =>
    apiClient.post<AuthResponse>('/api/auth/register', data, authRequestConfig),

  logout: () => apiClient.post('/api/auth/logout', undefined, authRequestConfig),

  me: () => apiClient.get<AuthResponse>('/api/auth/me', authRequestConfig),
};
