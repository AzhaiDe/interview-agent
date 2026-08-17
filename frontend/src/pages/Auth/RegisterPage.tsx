import { Card, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useRegister } from '@/features/auth/auth.hooks';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Input as AntInput, Form } from 'antd';
import { Button, Input, Error as ErrorDisplay, Loading } from '@/components/ui';
import { useAuth } from '@/features/auth/auth.hooks';
import { useEffect } from 'react';

const { Title, Text } = Typography;

export const RegisterPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const { isAuthenticated } = useAuth();

  // 如果已登录，跳转到 dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const onFinish = (values: {
    username: string;
    password: string;
    confirmPassword: string;
  }) => {
    const { confirmPassword, ...registerData } = values;
    // The public form uses username as the initial display name.  The API
    // still accepts an explicit displayName for future profile editing.
    registerMutation.mutate({ ...registerData, displayName: values.username });
  };

  const handleRetry = () => {
    registerMutation.reset();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-gray-50 px-4 py-8">
      {/* 全屏加载 */}
      {registerMutation.isPending && (
        <Loading fullScreen text="正在注册..." size="large" />
      )}

      <Card className="w-full max-w-md shadow-xl border-0">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 mb-4">
            <UserOutlined className="text-3xl text-primary-600" />
          </div>
          <Title level={2} className="mb-2">
            {t('auth.register')}
          </Title>
          <Text type="secondary">创建你的 OfferPilot AI 面试官账号</Text>
        </div>

        {/* 错误提示 */}
        {registerMutation.isError && (
          <div className="mb-6">
            <ErrorDisplay
              variant="alert"
              severity="error"
              message="注册失败"
              description={registerMutation.error?.message || '请稍后重试'}
              onRetry={handleRetry}
              retryText="重试"
            />
          </div>
        )}

        <Form
          name="register"
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
              disabled={registerMutation.isPending}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, message: '密码至少 8 个字符' },
              {
                pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                message: '密码需包含大小写字母和数字',
              },
            ]}
            extra="密码需至少 8 个字符，包含大小写字母和数字"
          >
            <AntInput.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              disabled={registerMutation.isPending}
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <AntInput.Password
              prefix={<LockOutlined />}
              placeholder="请再次输入密码"
              disabled={registerMutation.isPending}
            />
          </Form.Item>

          <Form.Item>
            <Button
              variant="primary"
              htmlType="submit"
              block
              loading={registerMutation.isPending}
              disabled={registerMutation.isPending}
              size="large"
            >
              {registerMutation.isPending ? '注册中...' : t('auth.register')}
            </Button>
          </Form.Item>

          <div className="text-center pt-4 border-t border-gray-200">
            <Text type="secondary">
              已有账号？{' '}
              <Link
                to="/login"
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                {t('auth.login')}
              </Link>
            </Text>
          </div>
        </Form>
      </Card>
    </div>
  );
};
