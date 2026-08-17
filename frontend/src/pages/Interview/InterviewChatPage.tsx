import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Input, Modal, message } from 'antd';
import { useFinishInterview, useInterview, useSubmitAnswer } from '@/features/interview/interview.hooks';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';
import { PRESSURE_LEVELS } from '@/lib/interview-options';

export const InterviewChatPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: interview, isLoading, error, refetch } = useInterview(id || '');
  const submit = useSubmitAnswer();
  const finish = useFinishInterview();
  const [answer, setAnswer] = useState('');
  const latest = interview?.diagnoses?.at(-1);

  if (isLoading) return <Loading fullScreen text="加载面试..." />;
  if (error) return <ErrorDisplay variant="result" severity="error" message="加载失败" description={error.message} onRetry={refetch} />;
  if (!interview) return <Empty description="面试不存在" />;

  const done = interview.status === 'finished' || Boolean(interview.result);
  const pressure = PRESSURE_LEVELS.find((item) => item.level === interview.pressure);

  const onSubmit = () => {
    if (!id || !answer.trim()) return;
    submit.mutate({ id, answer: answer.trim() }, {
      onSuccess: (result) => {
        setAnswer('');
        if (result.needsHumanReview) message.info('本轮进入人工复核，可继续作答或结束出报告');
        if (result.shouldFinish) {
          finish.mutate(id, { onSuccess: () => navigate(`/interview/${id}/report`) });
        }
      },
    });
  };

  return (
    <div>
      <div className="op-card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div className="op-kicker">{interview.phase || '面试进行中'}</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{interview.targetRole}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="op-chip stable">第 {interview.progress || 0} 轮</span>
            {interview.mappedSkill && <span className="op-chip">{interview.mappedSkill}</span>}
            <span className={`op-chip ${pressure?.tag.includes('冲') ? 'reach' : 'stable'}`}>L{interview.pressure} {pressure?.label}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => navigate('/interview')}>返回</Button>
          {!done && (
            <Button type="primary" onClick={() => Modal.confirm({
              title: '完成面试并生成报告？',
              onOk: () => finish.mutate(id!, { onSuccess: () => navigate(`/interview/${id}/report`) }),
            })}>结束并出报告</Button>
          )}
        </div>
      </div>

      <div className="op-grid op-grid-2" style={{ marginBottom: 16, alignItems: 'start' }}>
        <div className="op-card" style={{ minHeight: 360 }}>
          {(interview.transcript || []).length === 0 && <p className="op-sub">等待第一题...</p>}
          {(interview.transcript || []).map((turn, index) => (
            <div key={`${turn.role}-${index}`} className={`op-row ${turn.role === 'candidate' ? 'right' : ''}`}>
              <div className={`op-bubble ${turn.role}`}>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>{turn.role === 'interviewer' ? '面试官' : '你'}</div>
                {turn.text}
                {typeof turn.score === 'number' && <div style={{ marginTop: 8, fontSize: 12 }}>本轮 {turn.score} 分</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="op-card">
          <span className="op-chip warn">本轮诊断</span>
          {latest ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{latest.mappedSkill || latest.topic}</div>
              <div className="op-sub">得分 {latest.score} · {latest.action}</div>
              {latest.strongPoint && <p style={{ marginTop: 10 }}><span className="op-chip safe">证据</span> {latest.strongPoint}</p>}
              {latest.weakPoint && <p style={{ marginTop: 10 }}><span className="op-chip reach">缺口</span> {latest.weakPoint}</p>}
              <div style={{ marginTop: 12 }}>
                {(latest.missingEvidence || []).map((item) => <span key={item} className="op-chip" style={{ margin: '0 6px 6px 0' }}>{item}</span>)}
              </div>
            </div>
          ) : (
            <p className="op-sub" style={{ marginTop: 12 }}>提交第一轮回答后，这里会显示缺失证据和能力映射。</p>
          )}
        </div>
      </div>

      {!done && (
        <div className="op-composer">
          {interview.question && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>当前问题：{interview.question}</div>
          )}
          <Input.TextArea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="用具体职责、机制、指标和边界来回答。不要只堆名词。"
            autoSize={{ minRows: 3, maxRows: 8 }}
            onPressEnter={(e) => {
              if (e.shiftKey) return;
              e.preventDefault();
              onSubmit();
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="primary" loading={submit.isPending} disabled={!answer.trim()} onClick={onSubmit}>提交回答</Button>
          </div>
        </div>
      )}
    </div>
  );
};
