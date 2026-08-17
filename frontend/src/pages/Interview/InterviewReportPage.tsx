import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Tag, Descriptions, Progress } from 'antd';
import {
  ArrowLeftOutlined,
  TrophyOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useInterviewReport } from '@/features/interview/interview.hooks';
import { Loading, Empty, Error as ErrorDisplay, Button } from '@/components/ui';

const { Title, Text } = Typography;

export const InterviewReportPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: report, isLoading, error, refetch } = useInterviewReport(id || '');

  if (isLoading) {
    return <Loading fullScreen text="加载面试报告..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorDisplay
          variant="result"
          severity="error"
          message="加载失败"
          description={error.message}
          onRetry={refetch}
        />
      </div>
    );
  }

  if (!report) {
    return <Empty description="报告尚未生成" />;
  }

  const skillEntries = Object.entries(report.skillScores || {});

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 返回按钮 */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/interview')}
        className="mb-4"
      >
        返回列表
      </Button>

      {/* 总览 */}
      <Card className="mb-6">
        <div className="text-center mb-6">
          <Title level={2} className="mb-4">
            面试报告
          </Title>
          <div className="inline-block">
            <Progress
              type="circle"
              percent={Math.round(report.overallScore * 100)}
              size={120}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
            <div className="mt-2">
              <Text strong className="text-xl">
                总分：{(report.overallScore * 100).toFixed(1)}
              </Text>
            </div>
          </div>
        </div>

        <Descriptions bordered column={2}>
          <Descriptions.Item label="优势数量">
            <Tag color="green">{report.strengths?.length || 0}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="待改进数量">
            <Tag color="orange">{report.weaknesses?.length || 0}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="建议数量">
            <Tag color="blue">{report.recommendations?.length || 0}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="评估技能数量">
            <Tag color="purple">{skillEntries.length}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 优势 */}
      {report.strengths && report.strengths.length > 0 && (
        <Card
          title={
            <span>
              <TrophyOutlined className="text-green-500 mr-2" />
              优势
            </span>
          }
          className="mb-6"
        >
          <div className="space-y-3">
            {report.strengths.map((strength, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-3 bg-green-50 rounded-lg"
              >
                <CheckCircleOutlined className="text-green-500 mt-1" />
                <Text>{strength}</Text>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 待改进 */}
      {report.weaknesses && report.weaknesses.length > 0 && (
        <Card
          title={
            <span>
              <WarningOutlined className="text-orange-500 mr-2" />
              待改进
            </span>
          }
          className="mb-6"
        >
          <div className="space-y-3">
            {report.weaknesses.map((weakness, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg"
              >
                <WarningOutlined className="text-orange-500 mt-1" />
                <Text>{weakness}</Text>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 建议 */}
      {report.recommendations && report.recommendations.length > 0 && (
        <Card title="建议" className="mb-6">
          <div className="space-y-3">
            {report.recommendations.map((recommendation, index) => (
              <div
                key={index}
                className="p-4 border border-gray-200 rounded-lg"
              >
                <Text>{recommendation}</Text>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 技能评分 */}
      {skillEntries.length > 0 && (
        <Card title="技能评分">
          <div className="space-y-4">
            {skillEntries.map(([skill, score]) => (
              <div key={skill}>
                <div className="flex items-center justify-between mb-2">
                  <Text strong>{skill}</Text>
                  <Text type="secondary">{(score * 100).toFixed(0)}%</Text>
                </div>
                <Progress
                  percent={Math.round(score * 100)}
                  strokeColor={
                    score >= 0.8 ? '#52c41a' :
                    score >= 0.6 ? '#1890ff' :
                    score >= 0.4 ? '#faad14' : '#f5222d'
                  }
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
