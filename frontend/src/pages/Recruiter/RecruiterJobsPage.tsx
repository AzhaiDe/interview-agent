import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Table, Tag, Space, Modal, Form, Input } from 'antd';
import {
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useRecruiterJobs, useCreateJob } from '@/features/recruiter/recruiter.hooks';
import type { RecruiterJob } from '@/features/recruiter/recruiter.api';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

const { Title, Text } = Typography;
const { TextArea } = Input;

export const RecruiterJobsPage = () => {
  const navigate = useNavigate();
  const { data: jobs, isLoading, error, refetch } = useRecruiterJobs();
  const createMutation = useCreateJob();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();

  const handleCreate = () => {
    form.validateFields().then((values) => {
      const requirements = values.requirements
        .split('\n')
        .map((r: string) => r.trim())
        .filter((r: string) => r.length > 0);

      createMutation.mutate(
        {
          title: values.title,
          description: values.description,
          requirements,
        },
        {
          onSuccess: () => {
            setCreateModalVisible(false);
            form.resetFields();
          },
        }
      );
    });
  };

  const handleView = (jobId: string) => {
    navigate(`/recruiter/${jobId}`);
  };

  const columns = [
    {
      title: '职位名称',
      dataIndex: 'title',
      key: 'title',
      render: (text: string) => (
        <div>
          <Text strong>{text}</Text>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: RecruiterJob['status']) => {
        const statusConfig = {
          draft: { color: 'default', text: '草稿', icon: <EditOutlined /> },
          active: { color: 'processing', text: '招聘中', icon: <CheckCircleOutlined /> },
          closed: { color: 'default', text: '已关闭', icon: <CloseCircleOutlined /> },
        };
        const config = statusConfig[status] || statusConfig.draft;
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        );
      },
    },
    {
      title: '候选人数',
      dataIndex: 'candidateCount',
      key: 'candidateCount',
      render: (count: number) => (
        <Text>{count || 0}</Text>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => (
        <Text>{new Date(date).toLocaleDateString('zh-CN')}</Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: RecruiterJob) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleView(record.id)}
          >
            查看
          </Button>
        </Space>
      ),
    },
  ];

  if (isLoading) {
    return <Loading fullScreen text="加载职位列表..." />;
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
        <Title level={2}>招聘管理</Title>
        <Text type="secondary">管理招聘职位和候选人</Text>
      </div>

      <Card className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <Title level={4} className="mb-0">
              职位列表
            </Title>
            <Text type="secondary">共 {jobs?.length || 0} 个职位</Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            创建职位
          </Button>
        </div>

        {jobs && jobs.length > 0 ? (
          <Table
            columns={columns}
            dataSource={jobs}
            rowKey="id"
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        ) : (
          <Empty
            description="暂无职位"
            actionText="创建第一个职位"
            onAction={() => setCreateModalVisible(true)}
          />
        )}
      </Card>

      {/* 创建职位弹窗 */}
      <Modal
        title="创建新职位"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="职位名称"
            rules={[{ required: true, message: '请输入职位名称' }]}
          >
            <Input placeholder="例如：高级前端工程师" />
          </Form.Item>

          <Form.Item
            name="description"
            label="职位描述"
            rules={[{ required: true, message: '请输入职位描述' }]}
          >
            <TextArea rows={4} placeholder="请详细描述职位职责和要求..." />
          </Form.Item>

          <Form.Item
            name="requirements"
            label="岗位要求"
            rules={[{ required: true, message: '请输入岗位要求' }]}
            extra="每行一个要求"
          >
            <TextArea
              rows={6}
              placeholder={"5年以上前端开发经验\n熟悉 React 和 TypeScript\n有大型项目经验"}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
