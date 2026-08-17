import { useSession } from '@/features/auth/auth.hooks';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * 会话守卫：定期检查 token 有效性
 * 如果 token 无效或过期，自动登出
 */
export const SessionGuard = () => {
  const { isAuthenticated, isValid } = useSession();

  useEffect(() => {
    if (isAuthenticated && !isValid) {
      // Token 已过期，清除认证状态并跳转到登录页
      const logout = () => {
        localStorage.removeItem('offerpilot-auth');
        window.location.href = '/login';
      };
      logout();
    }
  }, [isAuthenticated, isValid]);

  return null; // 不渲染任何 UI
};

/**
 * 自动登出计时器
 * 在用户无操作一定时间后自动登出
 */
export const AutoLogoutTimer = ({ timeoutMinutes = 30 }: { timeoutMinutes?: number }) => {
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        // 超时，自动登出
        localStorage.removeItem('offerpilot-auth');
        navigate('/login');
      }, timeoutMinutes * 60 * 1000);
    };

    // 监听用户活动
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // 初始化计时器
    resetTimer();

    // 清理
    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isAuthenticated, navigate, timeoutMinutes]);

  return null;
};
