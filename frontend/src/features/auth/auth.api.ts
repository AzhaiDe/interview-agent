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

const authRequest = { baseURL: '/api' };

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>('/auth/login', data, authRequest),

  register: (data: RegisterRequest) =>
    apiClient.post<AuthResponse>('/auth/register', data, authRequest),

  logout: () => apiClient.post('/auth/logout', undefined, authRequest),

  me: () => apiClient.get<AuthResponse>('/auth/me', authRequest),
};
