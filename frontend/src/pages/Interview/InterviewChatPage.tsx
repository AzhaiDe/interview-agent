import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Card, Typography, Input, Button, Space, Tag, Divider, Modal } from 'antd';
import {
  ArrowLeftOutlined,
  SendOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useInterview, useSubmitAnswer, useFinishInterview, usePauseInterview, useResumeInterview } from '@/features/interview/interview.hooks';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export const InterviewChatPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: interview, isLoading, error, refetch } = useInterview(id || '');
  const submitAnswerMutation = useSubmitAnswer();
  const finishMutation = useFinishInterview();
  const pauseMutation = usePauseInterview();
  const resumeMutation = useResumeInterview();
  const [answer, setAnswer] = useState('');
  const [finishModalVisible, setFinishModalVisible] = useState(false);

  const handleSubmitAnswer = () => {
    if (!answer.trim() || !id) return;

    submitAnswerMutation.mutate(
      { id, data: { answer: answer.trim() } },
      {
        onSuccess: () => {
          setAnswer('');
        },
      }
    );
  };

  const handleFinish = () => {
    if (!id) return;
    finishMutation.mutate(id, {
      onSuccess: () => {
        setFinishModalVisible(false);
        navigate('/interview');
      },
    });
  };

  const handlePause = () => {
    if (!id) return;
    pauseMutation.mutate(id);
  };

  const handleResume = () => {
    if (!id) return;
    resumeMutation.mutate(id);
  };

  if (isLoading) {
    return <Loading fullScreen text="加载面试..." />;
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

  if (!interview) {
    return <Empty description="面试不存在" />;
  }

  const transcript = interview.transcript || [];
  const isActive = interview.status === 'active';
  const isPaused = interview.status === 'paused';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 返回按钮 */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/interview')}
        className="mb-4"
      >
        返回列表
      </Button>

      {/* 面试信息 */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Title level={3} className="mb-2">
              面试进行中
            </Title>
            <Space>
              <Tag color={
                interview.status === 'active' ? 'processing' :
                interview.status === 'paused' ? 'warning' :
                interview.status === 'completed' ? 'success' : 'default'
              }>
                {interview.status === 'active' ? '进行中' :
                 interview.status === 'paused' ? '已暂停' :
                 interview.status === 'completed' ? '已完成' : '已放弃'}
              </Tag>
              {interview.currentQuestionIndex && interview.totalQuestions && (
                <Text type="secondary">
                  问题 {interview.currentQuestionIndex} / {interview.totalQuestions}
                </Text>
              )}
            </Space>
          </div>
          <Space>
            {isActive && (
              <>
                <Button icon={<PauseCircleOutlined />} onClick={handlePause}>
                  暂停
                </Button>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => setFinishModalVisible(true)}
                >
                  完成面试
                </Button>
              </>
            )}
            {isPaused && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleResume}
              >
                继续面试
              </Button>
            )}
          </Space>
        </div>
      </Card>

      {/* 对话历史 */}
      <Card className="mb-6" title="对话记录">
        {transcript.length === 0 ? (
          <Empty description="暂无对话记录" />
        ) : (
          <div className="space-y-4">
            {transcript.map((turn, index) => (
              <div key={index}>
                {/* 问题 */}
                <div className="bg-blue-50 p-4 rounded-lg mb-3">
                  <div className="flex items-start gap-2">
                    <Tag color="blue">面试官</Tag>
                    <Paragraph className="mb-0 flex-1">
                      {turn.question}
                    </Paragraph>
                  </div>
                </div>

                {/* 回答 */}
                {turn.answer && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Tag color="green">候选人</Tag>
                      <Paragraph className="mb-0 flex-1">
                        {turn.answer}
                      </Paragraph>
                    </div>
                  </div>
                )}

                {index < transcript.length - 1 && <Divider />}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 输入区域 */}
      {(isActive || isPaused) && (
        <Card>
          <div className="mb-3">
            <Text strong>当前问题：</Text>
            <Paragraph className="mt-2 bg-blue-50 p-3 rounded">
              {interview.currentQuestion || '等待下一个问题...'}
            </Paragraph>
          </div>

          <div className="mb-3">
            <TextArea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="请输入你的回答..."
              autoSize={{ minRows: 4, maxRows: 8 }}
              disabled={!isActive}
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSubmitAnswer}
              loading={submitAnswerMutation.isPending}
              disabled={!isActive || !answer.trim()}
              size="large"
            >
              提交回答
            </Button>
          </div>
        </Card>
      )}

      {/* 完成面试确认弹窗 */}
      <Modal
        title="完成面试"
        open={finishModalVisible}
        onCancel={() => setFinishModalVisible(false)}
        onOk={handleFinish}
        confirmLoading={finishMutation.isPending}
        okText="完成"
        cancelText="取消"
      >
        <p>确定要完成这场面试吗？完成后将生成面试报告。</p>
      </Modal>
    </div>
  );
};
