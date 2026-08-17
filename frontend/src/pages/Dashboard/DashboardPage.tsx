import { Typography, Card, Row, Col, Statistic, Button, Tag } from 'antd';
import { FileTextOutlined, MessageOutlined, RiseOutlined, ArrowRightOutlined, BulbOutlined } from '@ant-design/icons';
import { useAuth } from '@/features/auth/auth.hooks';
import { useNavigate } from 'react-router-dom';

const { Title } = Typography;

export const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="page-container dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <Tag className="eyebrow-tag" icon={<BulbOutlined />}>AI 面试成长工作台</Tag>
          <Title>你好，{user.displayName || '同学'}</Title>
          <Typography.Paragraph>
            从简历洞察到压力面试，持续训练并沉淀可验证的能力证据。
          </Typography.Paragraph>
          <div className="dashboard-actions">
            <Button type="primary" size="large" icon={<ArrowRightOutlined />} onClick={() => navigate('/resume')}>
              开始分析简历
            </Button>
            <Button size="large" onClick={() => navigate('/interview')}>进入模拟面试</Button>
          </div>
        </div>
        <div className="dashboard-hero-art" aria-hidden="true">
          <div className="hero-orbit hero-orbit-one" />
          <div className="hero-orbit hero-orbit-two" />
          <div className="hero-glass-card">
            <span className="hero-glass-label">本周能力画像</span>
            <strong>准备好迎接下一场面试</strong>
            <div className="hero-progress"><i /></div>
            <small>从一次练习开始，逐步建立优势</small>
          </div>
        </div>
      </section>

      <div className="section-heading">
        <div><Title level={3}>你的训练概览</Title><Typography.Text type="secondary">把每一次准备都变成下一次机会</Typography.Text></div>
        <Button type="link" onClick={() => navigate('/growth')}>查看成长路径 <ArrowRightOutlined /></Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card className="metric-card metric-card-blue">
            <Statistic
              title="简历分析"
              value={0}
              prefix={<FileTextOutlined />}
              suffix="份"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="metric-card metric-card-purple">
            <Statistic
              title="模拟面试"
              value={0}
              prefix={<MessageOutlined />}
              suffix="次"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="metric-card metric-card-green">
            <Statistic
              title="能力成长"
              value={0}
              prefix={<RiseOutlined />}
              suffix="分"
            />
          </Card>
        </Col>
      </Row>

      <section className="dashboard-next-step">
        <div><span className="next-step-kicker">NEXT STEP</span><Title level={4}>让 AI 帮你找到真正的面试突破口</Title><Typography.Text type="secondary">上传一份最新简历，生成岗位匹配度和重点追问。</Typography.Text></div>
        <Button type="primary" ghost onClick={() => navigate('/resume')}>去简历中心 <ArrowRightOutlined /></Button>
      </section>
    </div>
  );
};
