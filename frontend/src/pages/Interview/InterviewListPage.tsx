import { Link, useNavigate } from 'react-router-dom';
import { Button, Modal } from 'antd';
import { useAbandonInterview, useInterviewHistory } from '@/features/interview/interview.hooks';
import { INTERVIEW_TYPES, PRESSURE_LEVELS } from '@/lib/interview-options';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

export const InterviewListPage = () => {
  const navigate = useNavigate();
  const { data: interviews, isLoading, error, refetch } = useInterviewHistory();
  const abandon = useAbandonInterview();

  if (isLoading) return <Loading fullScreen text="加载面试..." />;
  if (error) return <ErrorDisplay variant="result" severity="error" message="加载失败" description={error.message} onRetry={refetch} />;

  return (
    <div>
      <div className="op-hero" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end' }}>
        <div>
          <div className="op-kicker">压力面试</div>
          <h1 className="op-title">按岗位和证据密度追问</h1>
          <p className="op-sub">先选简历和目标岗位，再选面试类型与压力等级。每一轮都会更新能力信念和缺失证据。</p>
        </div>
        <Button type="primary" size="large" onClick={() => navigate('/interview/new')}>开始新面试</Button>
      </div>

      {!interviews?.length ? (
        <div className="op-card">
          <Empty description="还没有面试记录" actionText="开始第一场" onAction={() => navigate('/interview/new')} />
        </div>
      ) : (
        <div className="op-grid" style={{ gridTemplateColumns: '1fr' }}>
          {interviews.map((item) => {
            const type = INTERVIEW_TYPES.find((x) => x.id === item.interviewType)?.label || item.interviewType;
            const pressure = PRESSURE_LEVELS.find((x) => x.level === item.pressure);
            const done = item.status === 'finished' || Boolean(item.result);
            return (
              <div key={item.sessionId} className="op-card" style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{item.targetRole || '未指定岗位'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
                    <span className={`op-chip ${done ? 'safe' : 'stable'}`}>{done ? item.result || '已完成' : item.phase || '进行中'}</span>
                    <span className="op-chip">{type}</span>
                    <span className={`op-chip ${pressure?.tag.includes('冲') ? 'reach' : 'stable'}`}>压力 {item.pressure} · {pressure?.label}</span>
                    <span className="op-chip">第 {item.progress || 0} 轮</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {done ? (
                    <Link to={`/interview/${item.sessionId}/report`}><Button type="primary">查看报告</Button></Link>
                  ) : (
                    <>
                      <Link to={`/interview/${item.sessionId}`}><Button type="primary">继续</Button></Link>
                      <Button danger onClick={() => Modal.confirm({ title: '结束本场？', onOk: () => abandon.mutate(item.sessionId) })}>放弃</Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
