import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Suspense, lazy } from 'react';
import '@/i18n/config';
import '@/styles/globals.css';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute, PublicRoute } from '@/features/auth/protected.route';
import { SessionGuard, AutoLogoutTimer } from '@/features/auth/session.guard';
import { Loading } from '@/components/ui';

const LoginPage = lazy(() => import('@/pages/Auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('@/pages/Auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import('@/pages/Dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ResumeListPage = lazy(() => import('@/pages/Resume/ResumeListPage').then((m) => ({ default: m.ResumeListPage })));
const ResumeDetailPage = lazy(() => import('@/pages/Resume/ResumeDetailPage').then((m) => ({ default: m.ResumeDetailPage })));
const InterviewListPage = lazy(() => import('@/pages/Interview/InterviewListPage').then((m) => ({ default: m.InterviewListPage })));
const InterviewSetupPage = lazy(() => import('@/pages/Interview/InterviewSetupPage').then((m) => ({ default: m.InterviewSetupPage })));
const InterviewChatPage = lazy(() => import('@/pages/Interview/InterviewChatPage').then((m) => ({ default: m.InterviewChatPage })));
const InterviewReportPage = lazy(() => import('@/pages/Interview/InterviewReportPage').then((m) => ({ default: m.InterviewReportPage })));
const GrowthPage = lazy(() => import('@/pages/Growth/GrowthPage').then((m) => ({ default: m.GrowthPage })));
const RecruiterJobsPage = lazy(() => import('@/pages/Recruiter/RecruiterJobsPage').then((m) => ({ default: m.RecruiterJobsPage })));
const RecruiterJobDetailPage = lazy(() => import('@/pages/Recruiter/RecruiterJobDetailPage').then((m) => ({ default: m.RecruiterJobDetailPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const theme = {
  token: {
    colorPrimary: '#2563eb',
    colorText: '#1e293b',
    colorBgLayout: '#f8fafc',
    borderRadius: 12,
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
};

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loading fullScreen text="加载中..." />
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN} theme={theme}>
        <BrowserRouter>
          <SessionGuard />
          <AutoLogoutTimer timeoutMinutes={30} />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
              <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
              <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/resume" element={<ResumeListPage />} />
                <Route path="/resume/:id" element={<ResumeDetailPage />} />
                <Route path="/interview" element={<InterviewListPage />} />
                <Route path="/interview/new" element={<InterviewSetupPage />} />
                <Route path="/interview/:id" element={<InterviewChatPage />} />
                <Route path="/interview/:id/report" element={<InterviewReportPage />} />
                <Route path="/growth" element={<GrowthPage />} />
                <Route path="/recruiter" element={<RecruiterJobsPage />} />
                <Route path="/recruiter/:jobId" element={<RecruiterJobDetailPage />} />
              </Route>
              <Route path="/" element={<Navigate to="/dashboard" />} />
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
