import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Suspense, lazy } from 'react';
import '@/i18n/config';
import '@/styles/globals.css';

import { MainLayout } from '@/components/layout/MainLayout';
import {
  ProtectedRoute,
  PublicRoute,
} from '@/features/auth/protected.route';
import { SessionGuard, AutoLogoutTimer } from '@/features/auth/session.guard';
import { Loading } from '@/components/ui';

// 懒加载页面组件
const LoginPage = lazy(() => import('@/pages/Auth/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('@/pages/Auth/RegisterPage').then(m => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import('@/pages/Dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ResumeListPage = lazy(() => import('@/pages/Resume/ResumeListPage').then(m => ({ default: m.ResumeListPage })));
const ResumeDetailPage = lazy(() => import('@/pages/Resume/ResumeDetailPage').then(m => ({ default: m.ResumeDetailPage })));
const InterviewListPage = lazy(() => import('@/pages/Interview/InterviewListPage').then(m => ({ default: m.InterviewListPage })));
const InterviewChatPage = lazy(() => import('@/pages/Interview/InterviewChatPage').then(m => ({ default: m.InterviewChatPage })));
const InterviewReportPage = lazy(() => import('@/pages/Interview/InterviewReportPage').then(m => ({ default: m.InterviewReportPage })));
const RecruiterJobsPage = lazy(() => import('@/pages/Recruiter/RecruiterJobsPage').then(m => ({ default: m.RecruiterJobsPage })));
const RecruiterJobDetailPage = lazy(() => import('@/pages/Recruiter/RecruiterJobDetailPage').then(m => ({ default: m.RecruiterJobDetailPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000,
    },
  },
});

// 加载回退组件
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <Loading fullScreen text="加载中..." />
  </div>
);

const AppRoutes = () => {
  return (
    <>
      {/* 全局会话守卫 */}
      <SessionGuard />
      <AutoLogoutTimer timeoutMinutes={30} />

      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public routes（已登录用户不能访问） */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />

          {/* Protected routes（需要登录） */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/resume" element={<ResumeListPage />} />
            <Route path="/resume/:id" element={<ResumeDetailPage />} />
            <Route path="/interview" element={<InterviewListPage />} />
            <Route path="/interview/:id" element={<InterviewChatPage />} />
            <Route path="/interview/:id/report" element={<InterviewReportPage />} />
            <Route path="/recruiter" element={<RecruiterJobsPage />} />
            <Route path="/recruiter/:jobId" element={<RecruiterJobDetailPage />} />
            <Route path="/growth" element={<div>成长页面（待实现）</div>} />
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </Suspense>
    </>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
