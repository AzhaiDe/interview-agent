import { useMutation } from '@tanstack/react-query';
import { authApi, type LoginRequest, type RegisterRequest } from './auth.api';
import { useAuthStore } from './auth.store';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui';
import { describeApiError } from '@/services/api.client';

export const useLogin = () => {
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: LoginRequest) => authApi.login(data),
    onSuccess: (data: any) => {
      setAuth(data.token, data.userId, data.displayName);
      toast.success({ content: '登录成功', duration: 'medium' });
      navigate('/dashboard');
    },
    onError: (error: any) => {
      toast.error({ content: `登录失败：${describeApiError(error)}`, duration: 'long' });
    },
  });
};

export const useRegister = () => {
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: RegisterRequest) => authApi.register(data),
    onSuccess: (data: any) => {
      setAuth(data.token, data.userId, data.displayName);
      toast.success({ content: '注册成功', duration: 'medium' });
      navigate('/dashboard');
    },
    onError: (error: any) => {
      toast.error({ content: `注册失败：${describeApiError(error)}`, duration: 'long' });
    },
  });
};

export const useLogout = () => {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  return () => {
    void authApi.logout().catch(() => undefined);
    logout();
    toast.info({ content: '已退出登录', duration: 'medium' });
    navigate('/login');
  };
};

export const useAuth = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // Select primitive values separately. Returning a fresh object from a
  // Zustand selector on every render causes an infinite update loop in v5.
  const userId = useAuthStore((state) => state.userId);
  const displayName = useAuthStore((state) => state.displayName);

  return { isAuthenticated, user: { userId, displayName } };
};

// 检查 token 是否有效（简单检查过期时间）
export const useTokenValid = () => {
  const token = useAuthStore((state) => state.token);

  if (!token) return false;

  try {
    // 简单解码 JWT payload（不验证签名，只检查过期时间）
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Date.now() / 1000;
    return payload.exp > now;
  } catch {
    return false;
  }
};

// 获取会话信息
export const useSession = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.userId);
  const displayName = useAuthStore((state) => state.displayName);

  return {
    isAuthenticated,
    token,
    user: { userId, displayName },
    isValid: useTokenValid(),
  };
};
