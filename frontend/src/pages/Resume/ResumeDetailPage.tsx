import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Tag, Descriptions, Button, Space, Divider } from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  BookOutlined,
  TrophyOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useResume } from '@/features/resume/resume.hooks';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

const { Title, Text, Paragraph } = Typography;

export const ResumeDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: resume, isLoading, error, refetch } = useResume(id || '');

  if (isLoading) {
    return <Loading fullScreen text="加载简历详情..." />;
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

  if (!resume) {
    return <Empty description="简历不存在" />;
  }

  const profile = resume.profile;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 返回按钮 */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/resume')}
        className="mb-4"
      >
        返回列表
      </Button>

      {/* 基本信息 */}
      <Card className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <Title level={2} className="mb-2">
              {profile?.name || resume.fileName}
            </Title>
            <Space>
              <Tag color="blue">{profile?.targetRole || '未分析'}</Tag>
              <Tag color={
                resume.analysisStatus === 'completed' ? 'green' :
                resume.analysisStatus === 'analyzing' ? 'blue' :
                resume.analysisStatus === 'failed' ? 'red' : 'default'
              }>
                {resume.analysisStatus === 'completed' ? '已分析' :
                 resume.analysisStatus === 'analyzing' ? '分析中' :
                 resume.analysisStatus === 'failed' ? '分析失败' : '待分析'}
              </Tag>
            </Space>
          </div>
        </div>

        {profile && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label={<><UserOutlined /> 姓名</>}>
              {profile.name}
            </Descriptions.Item>
            <Descriptions.Item label={<><MailOutlined /> 邮箱</>}>
              {profile.email || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={<><PhoneOutlined /> 电话</>}>
              {profile.phone || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={<><BookOutlined /> 目标岗位</>}>
              {profile.targetRole}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* 技能标签 */}
      {profile && profile.skills.length > 0 && (
        <Card title="技能" className="mb-6">
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <Tag key={skill} color="blue" className="text-sm px-3 py-1">
                {skill}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 工作经验 */}
      {profile && profile.experience.length > 0 && (
        <Card title="工作经验" className="mb-6">
          {profile.experience.map((exp, index) => (
            <div key={index} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Text strong className="text-base">
                    {exp.role}
                  </Text>
                  <Text type="secondary" className="ml-2">
                    @ {exp.company}
                  </Text>
                </div>
                <Tag>{exp.duration}</Tag>
              </div>
              <Paragraph type="secondary" className="mb-2">
                {exp.description}
              </Paragraph>
              {exp.achievements && exp.achievements.length > 0 && (
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {exp.achievements.map((achievement, i) => (
                    <li key={i}>{achievement}</li>
                  ))}
                </ul>
              )}
              {index < profile.experience.length - 1 && <Divider />}
            </div>
          ))}
        </Card>
      )}

      {/* 教育背景 */}
      {profile && profile.education.length > 0 && (
        <Card title="教育背景" className="mb-6">
          {profile.education.map((edu, index) => (
            <div key={index} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Text strong className="text-base">
                    {edu.school}
                  </Text>
                </div>
                <Tag>{edu.year}</Tag>
              </div>
              <Text>
                {edu.degree} - {edu.major}
              </Text>
            </div>
          ))}
        </Card>
      )}

      {/* 优势 */}
      {profile && profile.strengths.length > 0 && (
        <Card
          title={
            <span>
              <TrophyOutlined className="text-green-500 mr-2" />
              优势
            </span>
          }
          className="mb-6"
        >
          <div className="flex flex-wrap gap-2">
            {profile.strengths.map((strength) => (
              <Tag key={strength} color="green" className="text-sm px-3 py-1">
                {strength}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 风险 */}
      {profile && profile.risks.length > 0 && (
        <Card
          title={
            <span>
              <WarningOutlined className="text-orange-500 mr-2" />
              风险
            </span>
          }
          className="mb-6"
        >
          <div className="flex flex-wrap gap-2">
            {profile.risks.map((risk) => (
              <Tag key={risk} color="orange" className="text-sm px-3 py-1">
                {risk}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 推荐岗位 */}
      {profile && profile.recommendedRoles.length > 0 && (
        <Card title="推荐岗位">
          <div className="space-y-3">
            {profile.recommendedRoles.map((rec, index) => (
              <div
                key={index}
                className="p-4 border border-gray-200 rounded-lg hover:border-primary-500 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <Text strong className="text-base">
                    {rec.role}
                  </Text>
                  <Tag color="blue">
                    匹配度：{((rec.confidence ?? (rec as any).score ?? 0) * 100).toFixed(0)}%
                  </Tag>
                </div>
                <Text type="secondary">{rec.reason}</Text>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 未分析提示 */}
      {!profile && (
        <Card className="text-center py-12">
          <Empty
            description="简历尚未分析"
            actionText="开始分析"
            onAction={() => {
              // TODO: 实现分析功能
            }}
          />
        </Card>
      )}
    </div>
  );
};
