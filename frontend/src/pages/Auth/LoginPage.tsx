import { Card, Form, Input as AntInput, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useLogin } from '@/features/auth/auth.hooks';
import { Button } from '@/components/ui';

export const LoginPage = () => {
  const loginMutation = useLogin();

  return (
    <div className="auth-screen">
      <Card className="op-card" style={{ width: '100%', maxWidth: 420, padding: 8 }}>
        <div className="op-kicker">OfferPilot</div>
        <h1 className="op-title" style={{ fontSize: 26 }}>登录面试工作台</h1>
        <p className="op-sub">用岗位知识和证据账本训练，而不是背题。</p>
        <Form layout="vertical" size="large" onFinish={(values) => loginMutation.mutate(values)} style={{ marginTop: 24 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <AntInput placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <AntInput.Password placeholder="密码" />
          </Form.Item>
          <Button variant="primary" htmlType="submit" block loading={loginMutation.isPending} size="large">
            {loginMutation.isPending ? '登录中...' : '进入工作台'}
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, textAlign: 'center' }}>
          还没有账号？<Link to="/register">创建账号</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
};
