import { Layout, Menu, Dropdown, Avatar, Space } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
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
      className="bg-white shadow-sm px-6 flex items-center justify-between"
      role="banner"
    >
      <div className="flex items-center gap-8">
        <div className="text-xl font-bold text-primary-600">
          <Link to="/dashboard" aria-label="返回首页">
            OfferPilot
          </Link>
        </div>

        <Menu
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems.map((item) => ({
            key: item.key,
            label: <Link to={item.key}>{item.label}</Link>,
          }))}
          className="flex-1 border-b-0"
          role="navigation"
          aria-label="主导航"
        />
      </div>

      <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
        <Space className="cursor-pointer" aria-label="用户菜单">
          <Avatar icon={<UserOutlined />} aria-label="用户头像" />
          <span>{user.displayName || '用户'}</span>
        </Space>
      </Dropdown>
    </AntHeader>
  );
};
