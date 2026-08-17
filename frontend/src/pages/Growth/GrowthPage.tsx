import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { useInterviewHistory } from '@/features/interview/interview.hooks';
import { Loading, Empty } from '@/components/ui';

export const GrowthPage = () => {
  const navigate = useNavigate();
  const { data: interviews, isLoading } = useInterviewHistory();
  const reports = (interviews || []).filter((item) => item.status === 'finished' || item.result);

  if (isLoading) return <Loading fullScreen text="加载成长记录..." />;

  return (
    <div>
      <div className="op-hero">
        <div className="op-kicker">成长报告</div>
        <h1 className="op-title">跨场训练轨迹</h1>
        <p className="op-sub">每场完成后都会留下证据账本、能力覆盖和 7 天计划。从这里复盘，而不是重新刷一套题。</p>
      </div>
      {!reports.length ? (
        <div className="op-card">
          <Empty description="还没有完成的面试报告" actionText="去开一场" onAction={() => navigate('/interview/new')} />
        </div>
      ) : (
        <div className="op-grid" style={{ gridTemplateColumns: '1fr' }}>
          {reports.map((item) => (
            <div key={item.sessionId} className="op-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{item.targetRole}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <span className={`op-chip ${item.result === 'PASS' ? 'safe' : item.result === 'FAIL' ? 'reach' : 'warn'}`}>{item.result || '已完成'}</span>
                  <span className="op-chip">{item.progress} 轮</span>
                </div>
              </div>
              <Link to={`/interview/${item.sessionId}/report`}><Button type="primary">打开报告</Button></Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
