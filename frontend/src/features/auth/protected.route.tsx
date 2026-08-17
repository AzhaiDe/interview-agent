import { useSession } from './auth.hooks';
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Loading } from '@/components/ui';

interface ProtectedRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

/**
 * 受保护路由：检查用户是否已认证
 * 未认证则重定向到登录页
 */
export const ProtectedRoute = ({ children, redirectTo = '/login' }: ProtectedRouteProps) => {
  const { isAuthenticated } = useSession();
  const location = useLocation();

  if (!isAuthenticated) {
    // 保存当前路径，登录后可以跳转回来
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

/**
 * 公共路由：已登录用户不能访问
 * 例如：登录页、注册页
 */
export const PublicRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useSession();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

/**
 * 加载路由：检查认证状态时显示加载
 */
export const LoadingRoute = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loading fullScreen text="加载中..." size="large" />
    </div>
  );
};
