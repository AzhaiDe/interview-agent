import { Link } from 'react-router-dom';
import { Button } from 'antd';
import { useAuth } from '@/features/auth/auth.hooks';
import { useResumes } from '@/features/resume/resume.hooks';
import { useInterviewHistory } from '@/features/interview/interview.hooks';

export const DashboardPage = () => {
  const { user } = useAuth();
  const { data: resumes = [] } = useResumes();
  const { data: interviews = [] } = useInterviewHistory();
  const finished = interviews.filter((item) => item.status === 'finished' || item.result);
  const avg = finished.length
    ? finished.reduce((sum, item) => sum + (typeof item.progress === 'number' ? item.progress : 0), 0) / finished.length
    : 0;

  return (
    <div>
      <div className="op-hero">
        <div className="op-kicker">工作台</div>
        <h1 className="op-title">你好，{user.displayName || '候选人'}</h1>
        <p className="op-sub">先分析简历证据，再按目标岗位开始压力面试。系统会记录能力信念、缺失证据和下一步训练。</p>
      </div>

      <div className="op-grid op-grid-3" style={{ marginBottom: 20 }}>
        <div className="op-card op-stat">
          <span className="op-chip">简历</span>
          <b>{resumes.length}</b>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>已上传并解析</div>
        </div>
        <div className="op-card op-stat">
          <span className="op-chip stable">面试</span>
          <b>{interviews.length}</b>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>累计场次</div>
        </div>
        <div className="op-card op-stat">
          <span className="op-chip reach">进度</span>
          <b>{finished.length}</b>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>已完成报告 · 平均轮次 {avg.toFixed(1)}</div>
        </div>
      </div>

      <div className="op-grid op-grid-3">
        <div className="op-card">
          <span className="op-chip">01</span>
          <h3 style={{ margin: '12px 0 8px' }}>简历分析</h3>
          <p className="op-sub">抽取项目、技能、量化证据和风险，生成可引用的候选人画像。</p>
          <Link to="/resume"><Button type="primary" style={{ marginTop: 12 }}>去分析</Button></Link>
        </div>
        <div className="op-card">
          <span className="op-chip stable">02</span>
          <h3 style={{ margin: '12px 0 8px' }}>选择岗位开面</h3>
          <p className="op-sub">后端 / AI / 前端，或使用简历推荐岗位。再选面试类型和压力等级。</p>
          <Link to="/interview/new"><Button type="primary" style={{ marginTop: 12 }}>开始面试</Button></Link>
        </div>
        <div className="op-card">
          <span className="op-chip reach">03</span>
          <h3 style={{ margin: '12px 0 8px' }}>查看成长</h3>
          <p className="op-sub">报告引用证据账本，给出 7 天训练计划和建议压力。</p>
          <Link to="/growth"><Button style={{ marginTop: 12 }}>查看报告</Button></Link>
        </div>
      </div>

      {interviews.length > 0 && (
        <div className="op-card" style={{ marginTop: 20 }}>
          <h3>最近面试</h3>
          {interviews.slice(0, 5).map((item) => (
            <div key={item.sessionId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{item.targetRole}</div>
                <div className="op-sub">{item.phase || item.status} · 第 {item.progress || 0} 轮</div>
              </div>
              <Link to={item.result ? `/interview/${item.sessionId}/report` : `/interview/${item.sessionId}`}>
                <Button>{item.result ? '报告' : '继续'}</Button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
