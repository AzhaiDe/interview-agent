import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Card, Typography, Button, Table, Tag, Space, Modal, Upload, Progress } from 'antd';
import {
  ArrowLeftOutlined,
  UploadOutlined,
  PlayCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import {
  useRecruiterJob,
  useUploadCandidate,
  useStartMatch,
  useMatchResults,
  useTask,
} from '@/features/recruiter/recruiter.hooks';
import type { RecruiterCandidate } from '@/features/recruiter/recruiter.api';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

export const RecruiterJobDetailPage = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading, error, refetch } = useRecruiterJob(jobId || '');
  const uploadMutation = useUploadCandidate();
  const matchMutation = useStartMatch();
  const { data: results } = useMatchResults(jobId || '');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [matchTaskId, setMatchTaskId] = useState<string | null>(null);
  const { data: task } = useTask(matchTaskId || '');

  const handleUpload = () => {
    if (fileList.length === 0 || !jobId) return;

    const file = fileList[0];
    if (file.originFileObj) {
      uploadMutation.mutate(
        { jobId, file: file.originFileObj },
        {
          onSuccess: () => {
            setFileList([]);
            setUploadModalVisible(false);
          },
        }
      );
    }
  };

  const handleStartMatch = () => {
    if (!jobId) return;
    matchMutation.mutate(jobId, {
      onSuccess: (task) => {
        setMatchTaskId(task.id);
      },
    });
  };

  const uploadProps: UploadProps = {
    name: 'resume',
    multiple: false,
    maxCount: 1,
    fileList,
    beforeUpload: () => false,
    onChange: ({ fileList: newFileList }) => {
      setFileList(newFileList.slice(-1));
    },
    onRemove: () => {
      setFileList([]);
    },
    accept: '.pdf,.doc,.docx,.txt',
  };

  const candidateColumns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
    },
    {
      title: '分析状态',
      dataIndex: 'analysisStatus',
      key: 'analysisStatus',
      render: (status: RecruiterCandidate['analysisStatus']) => {
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
      title: '匹配分数',
      dataIndex: 'matchScore',
      key: 'matchScore',
      render: (score: number) => {
        if (!score) return <Text type="secondary">-</Text>;
        return (
          <Tag color={score >= 0.8 ? 'green' : score >= 0.6 ? 'blue' : 'orange'}>
            {(score * 100).toFixed(0)}%
          </Tag>
        );
      },
    },
  ];

  const resultColumns = [
    {
      title: '候选人',
      key: 'candidate',
      render: (_: any, record: any) => (
        <Text strong>{record.candidateId}</Text>
      ),
    },
    {
      title: '匹配分数',
      dataIndex: 'score',
      key: 'score',
      render: (score: number) => (
        <Tag color={score >= 0.8 ? 'green' : score >= 0.6 ? 'blue' : 'orange'}>
          {(score * 100).toFixed(0)}%
        </Tag>
      ),
      sorter: (a: any, b: any) => a.score - b.score,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: '匹配原因',
      key: 'reasons',
      render: (_: any, record: any) => (
        <div className="flex flex-wrap gap-1">
          {record.reasons?.slice(0, 2).map((reason: string, i: number) => (
            <Tag key={i} color="green">
              {reason}
            </Tag>
          ))}
          {record.reasons?.length > 2 && <Tag>+{record.reasons.length - 2}</Tag>}
        </div>
      ),
    },
    {
      title: '关注点',
      key: 'concerns',
      render: (_: any, record: any) => (
        <div className="flex flex-wrap gap-1">
          {record.concerns?.slice(0, 2).map((concern: string, i: number) => (
            <Tag key={i} color="orange">
              {concern}
            </Tag>
          ))}
          {record.concerns?.length > 2 && <Tag>+{record.concerns.length - 2}</Tag>}
        </div>
      ),
    },
  ];

  if (isLoading) {
    return <Loading fullScreen text="加载职位详情..." />;
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

  if (!job) {
    return <Empty description="职位不存在" />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 返回按钮 */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/recruiter')}
        className="mb-4"
      >
        返回列表
      </Button>

      {/* 职位信息 */}
      <Card className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <Title level={2} className="mb-2">
              {job.title}
            </Title>
            <Space>
              <Tag color={
                job.status === 'active' ? 'processing' :
                job.status === 'closed' ? 'default' : 'warning'
              }>
                {job.status === 'active' ? '招聘中' :
                 job.status === 'closed' ? '已关闭' : '草稿'}
              </Tag>
              <Text type="secondary">
                {job.candidateCount || 0} 位候选人
              </Text>
            </Space>
          </div>
          <Space>
            <Button
              icon={<UploadOutlined />}
              onClick={() => setUploadModalVisible(true)}
            >
              上传候选人
            </Button>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStartMatch}
              loading={matchMutation.isPending}
            >
              开始匹配
            </Button>
          </Space>
        </div>

        <div className="mb-4">
          <Text strong>职位描述：</Text>
          <Paragraph className="mt-2">{job.description}</Paragraph>
        </div>

        <div>
          <Text strong>岗位要求：</Text>
          <ul className="mt-2 list-disc list-inside">
            {job.requirements?.map((req, i) => (
              <li key={i}>{req}</li>
            ))}
          </ul>
        </div>
      </Card>

      {/* 匹配任务进度 */}
      {task && task.status !== 'completed' && (
        <Card className="mb-6" title="匹配进度">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <Text>{task.stage || '处理中...'}</Text>
              <Tag color={
                task.status === 'running' ? 'processing' :
                task.status === 'failed' ? 'error' : 'default'
              }>
                {task.status === 'running' ? '进行中' :
                 task.status === 'failed' ? '失败' : '等待中'}
              </Tag>
            </div>
            <Progress percent={Math.round((task.progress / task.total) * 100)} />
            <Text type="secondary" className="text-sm mt-2 block">
              {task.progress} / {task.total}
            </Text>
          </div>
        </Card>
      )}

      {/* 候选人列表 */}
      <Card title="候选人" className="mb-6">
        {job.candidateCount && job.candidateCount > 0 ? (
          <Table
            columns={candidateColumns}
            dataSource={[]}
            rowKey="id"
            pagination={false}
          />
        ) : (
          <Empty description="暂无候选人" />
        )}
      </Card>

      {/* 匹配结果 */}
      {results && results.length > 0 && (
        <Card title="匹配结果">
          <Table
            columns={resultColumns}
            dataSource={results}
            rowKey="candidateId"
            pagination={false}
          />
        </Card>
      )}

      {/* 上传候选人弹窗 */}
      <Modal
        title="上传候选人简历"
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
              支持 PDF、Word、文本文件
            </p>
          </Dragger>
        )}
      </Modal>
    </div>
  );
};
