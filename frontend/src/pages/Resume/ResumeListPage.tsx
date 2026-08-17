import { useState } from 'react';
import { Card, Typography, Upload, Button, Table, Tag, Space, Modal, Progress } from 'antd';
import {
  UploadOutlined,
  FileTextOutlined,
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import { useResumes, useUploadResume, useDeleteResume } from '@/features/resume/resume.hooks';
import type { Resume } from '@/features/resume/resume.api';
import { useNavigate } from 'react-router-dom';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

const { Title, Text } = Typography;
const { Dragger } = Upload;

export const ResumeListPage = () => {
  const navigate = useNavigate();
  const { data: resumes, isLoading, error, refetch } = useResumes();
  const uploadMutation = useUploadResume();
  const deleteMutation = useDeleteResume();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);

  const handleUpload = () => {
    if (fileList.length === 0) return;

    const file = fileList[0];
    if (file.originFileObj) {
      uploadMutation.mutate(file.originFileObj, {
        onSuccess: () => {
          setFileList([]);
          setUploadModalVisible(false);
        },
      });
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这份简历吗？此操作不可撤销。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const handleView = (id: string) => {
    navigate(`/resume/${id}`);
  };

  const uploadProps: UploadProps = {
    name: 'resume',
    multiple: false,
    maxCount: 1,
    fileList,
    beforeUpload: () => false, // 阻止自动上传
    onChange: ({ fileList: newFileList }) => {
      setFileList(newFileList.slice(-1)); // 只保留最后一个文件
    },
    onRemove: () => {
      setFileList([]);
    },
    accept: '.pdf,.doc,.docx,.txt',
  };

  const columns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      render: (text: string, record: Resume) => (
        <div className="flex items-center gap-2">
          <FileTextOutlined className="text-primary-500 text-lg" />
          <div>
            <div className="font-medium">{text}</div>
            <Text type="secondary" className="text-xs">
              {new Date(record.uploadedAt).toLocaleDateString('zh-CN')}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: '分析状态',
      dataIndex: 'analysisStatus',
      key: 'analysisStatus',
      render: (status: Resume['analysisStatus']) => {
        const statusConfig = {
          pending: { color: 'default', text: '待分析' },
          analyzing: { color: 'processing', text: '分析中' },
          completed: { color: 'success', text: '已完成' },
          failed: { color: 'error', text: '失败' },
        };
        const config = statusConfig[status];
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '目标岗位',
      key: 'targetRole',
      render: (_: any, record: Resume) => (
        <Text>{record.profile?.targetRole || '-'}</Text>
      ),
    },
    {
      title: '技能',
      key: 'skills',
      render: (_: any, record: Resume) => {
        const skills = record.profile?.skills || [];
        return (
          <div className="flex flex-wrap gap-1">
            {skills.slice(0, 3).map((skill) => (
              <Tag key={skill} color="blue">
                {skill}
              </Tag>
            ))}
            {skills.length > 3 && (
              <Tag>+{skills.length - 3}</Tag>
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: Resume) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleView(record.id)}
          >
            查看
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  if (isLoading) {
    return <Loading fullScreen text="加载简历列表..." />;
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
        <Title level={2}>简历管理</Title>
        <Text type="secondary">上传和管理候选人简历</Text>
      </div>

      <Card className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <Title level={4} className="mb-0">
              简历列表
            </Title>
            <Text type="secondary">共 {resumes?.length || 0} 份简历</Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => setUploadModalVisible(true)}
            >
              上传简历
            </Button>
          </Space>
        </div>

        {resumes && resumes.length > 0 ? (
          <Table
            columns={columns}
            dataSource={resumes}
            rowKey="id"
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        ) : (
          <Empty
            description="暂无简历"
            actionText="上传第一份简历"
            onAction={() => setUploadModalVisible(true)}
          />
        )}
      </Card>

      {/* 上传简历弹窗 */}
      <Modal
        title="上传简历"
        open={uploadModalVisible}
        onCancel={() => {
          setUploadModalVisible(false);
          setFileList([]);
        }}
        onOk={handleUpload}
        confirmLoading={uploadMutation.isPending}
        okText="上传"
        cancelText="取消"
        width={600}
      >
        {uploadMutation.isPending ? (
          <div className="py-8">
            <Progress percent={100} status="active" />
            <Text className="mt-4 block text-center">正在上传，请稍候...</Text>
          </div>
        ) : (
          <Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">
              支持 PDF、Word、文本文件，文件大小不超过 10MB
            </p>
          </Dragger>
        )}
      </Modal>
    </div>
  );
};
