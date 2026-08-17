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

export const authApi = {
  login: (data: LoginRequest) =>
    // Auth routes are mounted outside the versioned API namespace.
    apiClient.post<AuthResponse>('/api/auth/login', data),

  register: (data: RegisterRequest) =>
    apiClient.post<AuthResponse>('/api/auth/register', data),

  logout: () => apiClient.post('/api/auth/logout'),

  me: () => apiClient.get<AuthResponse>('/api/auth/me'),
};
