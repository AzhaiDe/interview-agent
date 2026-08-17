import { Typography, Card, Row, Col, Statistic } from 'antd';
import { FileTextOutlined, MessageOutlined, RiseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/auth.hooks';

const { Title } = Typography;

export const DashboardPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="p-6">
      <Title level={2} className="mb-6">
        {t('nav.dashboard')}
      </Title>

      <div className="mb-6">
        <Typography.Text type="secondary">
          欢迎回来，{user.displayName || '用户'}
        </Typography.Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="简历分析"
              value={0}
              prefix={<FileTextOutlined />}
              suffix="份"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="模拟面试"
              value={0}
              prefix={<MessageOutlined />}
              suffix="次"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="能力成长"
              value={0}
              prefix={<RiseOutlined />}
              suffix="分"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
