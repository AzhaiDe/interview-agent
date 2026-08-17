import { Layout, Menu, Dropdown, Avatar, Space, Badge } from 'antd';
import { UserOutlined, LogoutOutlined, RocketOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, useLogout } from '@/features/auth/auth.hooks';
import { useTranslation } from 'react-i18next';

const { Header: AntHeader } = Layout;

export const Header = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const logout = useLogout();
  const location = useLocation();

  const menuItems = [
    { key: '/dashboard', label: t('nav.dashboard') },
    { key: '/resume', label: t('nav.resume') },
    { key: '/interview', label: t('nav.interview') },
    { key: '/growth', label: t('nav.growth') },
    { key: '/recruiter', label: t('nav.recruiter') },
  ];

  const userMenuItems = [
    {
      key: 'logout',
      label: t('auth.logout'),
      icon: <LogoutOutlined />,
      onClick: logout,
    },
  ];

  return (
    <AntHeader
      className="app-header"
      role="banner"
    >
      <div className="app-header-inner">
        <div className="app-brand">
          <Link to="/dashboard" aria-label="返回首页">
            <span className="app-brand-mark"><RocketOutlined /></span>
            <span>OfferPilot</span>
          </Link>
        </div>

        <Menu
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems.map((item) => ({
            key: item.key,
            label: <Link to={item.key}>{item.label}</Link>,
          }))}
          className="app-nav"
          role="navigation"
          aria-label="主导航"
        />
      </div>

      <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
        <Space className="app-user" aria-label="用户菜单">
          <Badge dot color="#35b98f" offset={[-3, 30]}>
            <Avatar icon={<UserOutlined />} aria-label="用户头像" />
          </Badge>
          <span className="app-user-name">{user.displayName || '用户'}</span>
        </Space>
      </Dropdown>
    </AntHeader>
  );
};
