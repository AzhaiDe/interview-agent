import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Table, Tag, Space, Modal, Select, Form } from 'antd';
import {
  PlayCircleOutlined,
  EyeOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useInterviewHistory, useStartInterview, useAbandonInterview } from '@/features/interview/interview.hooks';
import { useResumes } from '@/features/resume/resume.hooks';
import type { InterviewSession } from '@/features/interview/interview.api';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

const { Title, Text } = Typography;

export const InterviewListPage = () => {
  const navigate = useNavigate();
  const { data: interviews, isLoading, error, refetch } = useInterviewHistory();
  const { data: resumes } = useResumes();
  const startMutation = useStartInterview();
  const abandonMutation = useAbandonInterview();
  const [startModalVisible, setStartModalVisible] = useState(false);
  const [form] = Form.useForm();

  const handleStart = () => {
    form.validateFields().then((values) => {
      startMutation.mutate(values, {
        onSuccess: (session) => {
          setStartModalVisible(false);
          form.resetFields();
          navigate(`/interview/${session.id}`);
        },
      });
    });
  };

  const handleAbandon = (id: string) => {
    Modal.confirm({
      title: '确认放弃',
      content: '确定要放弃这场面试吗？此操作不可撤销。',
      okText: '放弃',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => abandonMutation.mutate(id),
    });
  };

  const handleView = (id: string) => {
    navigate(`/interview/${id}`);
  };

  const columns = [
    {
      title: '简历',
      key: 'resume',
      render: (_: any, record: InterviewSession) => {
        const resume = resumes?.find((r) => r.id === record.resumeId);
        return (
          <div>
            <Text strong>{resume?.fileName || '未知简历'}</Text>
            <br />
            <Text type="secondary" className="text-xs">
              {resume?.profile?.targetRole || '-'}
            </Text>
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: InterviewSession['status']) => {
        const statusConfig = {
          active: { color: 'processing', text: '进行中', icon: <ClockCircleOutlined /> },
          paused: { color: 'warning', text: '已暂停', icon: <PauseCircleOutlined /> },
          completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
          abandoned: { color: 'default', text: '已放弃', icon: <CloseCircleOutlined /> },
        };
        const config = statusConfig[status] || statusConfig.active;
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        );
      },
    },
    {
      title: '进度',
      key: 'progress',
      render: (_: any, record: InterviewSession) => {
        if (record.currentQuestionIndex && record.totalQuestions) {
          return (
            <Text>
              {record.currentQuestionIndex} / {record.totalQuestions}
            </Text>
          );
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: '开始时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => (
        <Text>{new Date(date).toLocaleString('zh-CN')}</Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: InterviewSession) => (
        <Space size="small">
          {record.status === 'active' && (
            <Button
              type="link"
              icon={<PlayCircleOutlined />}
              onClick={() => handleView(record.id)}
            >
              继续
            </Button>
          )}
          {record.status === 'completed' && (
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => handleView(record.id)}
            >
              查看报告
            </Button>
          )}
          {record.status === 'active' && (
            <Button
              type="link"
              danger
              onClick={() => handleAbandon(record.id)}
            >
              放弃
            </Button>
          )}
        </Space>
      ),
    },
  ];

  if (isLoading) {
    return <Loading fullScreen text="加载面试列表..." />;
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <Title level={2}>面试管理</Title>
        <Text type="secondary">开始和管理 AI 面试</Text>
      </div>

      <Card className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <Title level={4} className="mb-0">
              面试历史
            </Title>
            <Text type="secondary">共 {interviews?.length || 0} 场面试</Text>
          </div>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => setStartModalVisible(true)}
          >
            开始新面试
          </Button>
        </div>

        {interviews && interviews.length > 0 ? (
          <Table
            columns={columns}
            dataSource={interviews}
            rowKey="id"
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        ) : (
          <Empty
            description="暂无面试记录"
            actionText="开始第一场面试"
            onAction={() => setStartModalVisible(true)}
          />
        )}
      </Card>

      {/* 开始面试弹窗 */}
      <Modal
        title="开始新面试"
        open={startModalVisible}
        onCancel={() => {
          setStartModalVisible(false);
          form.resetFields();
        }}
        onOk={handleStart}
        confirmLoading={startMutation.isPending}
        okText="开始面试"
        cancelText="取消"
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="resumeId"
            label="选择简历"
            rules={[{ required: true, message: '请选择简历' }]}
          >
            <Select placeholder="请选择要面试的简历">
              {resumes?.map((resume) => (
                <Select.Option key={resume.id} value={resume.id}>
                  {resume.fileName} - {resume.profile?.targetRole || '未分析'}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="difficulty"
            label="难度"
            initialValue="medium"
          >
            <Select>
              <Select.Option value="easy">简单</Select.Option>
              <Select.Option value="medium">中等</Select.Option>
              <Select.Option value="hard">困难</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="interviewType"
            label="面试类型"
            initialValue="technical"
          >
            <Select>
              <Select.Option value="technical">技术面试</Select.Option>
              <Select.Option value="behavioral">行为面试</Select.Option>
              <Select.Option value="system_design">系统设计</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
