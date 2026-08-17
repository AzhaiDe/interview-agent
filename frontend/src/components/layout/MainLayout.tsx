import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth, useLogout } from '@/features/auth/auth.hooks';

const nav = [
  { to: '/dashboard', label: '工作台' },
  { to: '/resume', label: '简历分析' },
  { to: '/interview', label: '压力面试' },
  { to: '/growth', label: '成长报告' },
  { to: '/recruiter', label: '招聘评估' },
];

export const MainLayout = () => {
  const { user } = useAuth();
  const logout = useLogout();

  return (
    <div className="op-shell">
      <aside className="op-side">
        <Link to="/dashboard" className="op-brand">
          <span className="op-brand-mark">OP</span>
          OfferPilot
        </Link>
        <nav className="op-nav">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="op-side-foot">
          岗位知识 + 证据账本 + 多 Judge
          <div style={{ marginTop: 6 }}>不是聊天机器人，是可回放的面试系统</div>
        </div>
      </aside>
      <div className="op-main">
        <header className="op-top">
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>AI 压力面试训练</div>
            <nav className="op-mobile-nav">
              {nav.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 600 }}>{user.displayName || '候选人'}</span>
            <button
              type="button"
              onClick={logout}
              style={{
                border: '1px solid var(--line)',
                background: '#fff',
                borderRadius: 999,
                padding: '6px 12px',
                cursor: 'pointer',
                color: 'var(--muted)',
              }}
            >
              退出
            </button>
          </div>
        </header>
        <main className="op-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
