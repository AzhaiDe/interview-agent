import { Card, Form, Input as AntInput, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useRegister } from '@/features/auth/auth.hooks';
import { Button } from '@/components/ui';

export const RegisterPage = () => {
  const registerMutation = useRegister();

  return (
    <div className="auth-screen">
      <Card className="op-card" style={{ width: '100%', maxWidth: 420, padding: 8 }}>
        <div className="op-kicker">OfferPilot</div>
        <h1 className="op-title" style={{ fontSize: 26 }}>创建训练账号</h1>
        <p className="op-sub">注册后即可上传简历、选择岗位并开始压力面试。</p>
        <Form
          layout="vertical"
          size="large"
          onFinish={(values) => registerMutation.mutate({ username: values.username, password: values.password, displayName: values.username })}
          style={{ marginTop: 24 }}
        >
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3, message: '至少 3 个字符' }]}>
            <AntInput placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '至少 6 位密码' }]}>
            <AntInput.Password placeholder="密码" />
          </Form.Item>
          <Button variant="primary" htmlType="submit" block loading={registerMutation.isPending} size="large">
            {registerMutation.isPending ? '创建中...' : '注册并进入'}
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, textAlign: 'center' }}>
          已有账号？<Link to="/login">去登录</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
};
