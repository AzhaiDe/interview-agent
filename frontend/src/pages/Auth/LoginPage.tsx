import { Card, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useLogin } from '@/features/auth/auth.hooks';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Input as AntInput, Form } from 'antd';
import { Button, Input, Error as ErrorDisplay, Loading } from '@/components/ui';
import { useAuth } from '@/features/auth/auth.hooks';
import { useEffect } from 'react';

const { Title, Text } = Typography;

export const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const { isAuthenticated } = useAuth();

  // 如果已登录，跳转到 dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const onFinish = (values: { username: string; password: string }) => {
    loginMutation.mutate(values);
  };

  const handleRetry = () => {
    // 重置 mutation 状态
    loginMutation.reset();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-gray-50 px-4 py-8">
      {/* 全屏加载 */}
      {loginMutation.isPending && (
        <Loading fullScreen text="正在登录..." size="large" />
      )}

      <Card className="w-full max-w-md shadow-xl border-0">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 mb-4">
            <UserOutlined className="text-3xl text-primary-600" />
          </div>
          <Title level={2} className="mb-2">
            {t('auth.login')}
          </Title>
          <Text type="secondary">欢迎使用 OfferPilot AI 面试官</Text>
        </div>

        {/* 错误提示 */}
        {loginMutation.isError && (
          <div className="mb-6">
            <ErrorDisplay
              variant="alert"
              severity="error"
              message="登录失败"
              description={loginMutation.error?.message || '请检查用户名和密码'}
              onRetry={handleRetry}
              retryText="重试"
            />
          </div>
        )}

        <Form
          name="login"
          onFinish={onFinish}
          layout="vertical"
          size="large"
          autoComplete="off"
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少 3 个字符' },
              { max: 30, message: '用户名最多 30 个字符' },
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="请输入用户名"
              disabled={loginMutation.isPending}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <AntInput.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              disabled={loginMutation.isPending}
            />
          </Form.Item>

          <Form.Item>
            <Button
              variant="primary"
              htmlType="submit"
              block
              loading={loginMutation.isPending}
              disabled={loginMutation.isPending}
              size="large"
            >
              {loginMutation.isPending ? '登录中...' : t('auth.login')}
            </Button>
          </Form.Item>

          <div className="text-center pt-4 border-t border-gray-200">
            <Text type="secondary">
              还没有账号？{' '}
              <Link
                to="/register"
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                {t('auth.register')}
              </Link>
            </Text>
          </div>
        </Form>
      </Card>
    </div>
  );
};
