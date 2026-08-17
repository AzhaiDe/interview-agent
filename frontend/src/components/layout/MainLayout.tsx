import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';

const { Content } = Layout;

export const MainLayout = () => {
  return (
    <Layout className="min-h-screen">
      <Header />
      <Content
        className="bg-gray-50"
        role="main"
        aria-label="主要内容区域"
      >
        <Outlet />
      </Content>
    </Layout>
  );
};
