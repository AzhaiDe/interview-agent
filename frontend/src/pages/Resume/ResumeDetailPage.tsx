import { useNavigate, useParams } from 'react-router-dom';
import { Button } from 'antd';
import { useAnalyzeResume, useResume } from '@/features/resume/resume.hooks';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';
import { roleBand } from '@/lib/interview-options';

export const ResumeDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: resume, isLoading, error, refetch } = useResume(id || '');
  const analyze = useAnalyzeResume();
  const profile = resume?.profile;

  if (isLoading) return <Loading fullScreen text="加载分析报告..." />;
  if (error) return <ErrorDisplay variant="result" severity="error" message="加载失败" description={error.message} onRetry={refetch} />;
  if (!resume) return <Empty description="简历不存在" />;

  const roles = [...(profile?.recommendedRoles || [])].sort((a, b) => b.score - a.score);

  return (
    <div>
      <Button onClick={() => navigate('/resume')} style={{ marginBottom: 16 }}>返回列表</Button>
      <div className="op-hero">
        <div className="op-kicker">分析完成</div>
        <h1 className="op-title">{profile?.name || resume.fileName}</h1>
        <p className="op-sub">{profile?.summary || '已完成结构化解析。建议再跑一次模型分析，以补全贡献度和引文。'}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <span className="op-chip stable">{profile?.targetRole || '待选择岗位'}</span>
          <span className="op-chip">{profile?.analysisMode === 'model' ? '模型增强' : '本地解析'}</span>
          {profile?.contact?.email && <span className="op-chip">{profile.contact.email}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button type="primary" loading={analyze.isPending} onClick={() => id && analyze.mutate(id)}>启动模型分析</Button>
          <Button onClick={() => navigate(`/interview/new?resumeId=${resume.id}`)}>用这份简历开面</Button>
        </div>
      </div>

      <div className="op-grid op-grid-3" style={{ marginBottom: 16 }}>
        {(roles.slice(0, 3).length ? roles.slice(0, 3) : [{ role: profile?.targetRole || '待定', score: 60, reasons: ['尚未生成推荐岗位'] }]).map((item) => {
          const band = roleBand(item.score);
          return (
            <div key={item.role} className="op-card">
              <span className={`op-chip ${band.tone}`}>{band.label}</span>
              <h3 style={{ margin: '10px 0 6px' }}>{item.role}</h3>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em' }}>{Math.round(item.score)}</div>
              <p className="op-sub">{item.reasons?.join('；') || '可结合项目证据继续核验'}</p>
            </div>
          );
        })}
      </div>

      <div className="op-card" style={{ marginBottom: 16 }}>
        <h3>技能标签</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {(profile?.skills || []).map((skill) => <span key={skill} className="op-chip stable">{skill}</span>)}
          {!profile?.skills?.length && <span className="op-chip">暂无技能</span>}
        </div>
      </div>

      <div className="op-grid op-grid-2" style={{ marginBottom: 16 }}>
        <div className="op-card">
          <span className="op-chip safe">优势</span>
          <ul style={{ marginTop: 12, paddingLeft: 18, color: 'var(--ink)' }}>
            {(profile?.strengths || ['尚未识别优势']).map((item) => <li key={item} style={{ marginBottom: 8 }}>{item}</li>)}
          </ul>
        </div>
        <div className="op-card">
          <span className="op-chip warn">风险提示</span>
          <ul style={{ marginTop: 12, paddingLeft: 18 }}>
            {(profile?.risks || ['尚未识别风险']).map((item) => <li key={item} style={{ marginBottom: 8 }}>{item}</li>)}
          </ul>
        </div>
      </div>

      {(profile?.education || []).length > 0 && (
        <div className="op-card" style={{ marginBottom: 16 }}>
          <h3>教育经历</h3>
          <ul style={{ marginTop: 10, paddingLeft: 18 }}>
            {profile!.education.map((item) => <li key={item} style={{ marginBottom: 6 }}>{item}</li>)}
          </ul>
        </div>
      )}

      <div className="op-card">
        <h3>项目与经历</h3>
        {(profile?.experiences || []).map((exp) => (
          <div key={exp.id || exp.title} style={{ padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 700 }}>{exp.title} {exp.role ? `· ${exp.role}` : ''}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 8px' }}>{exp.summary}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(exp.technologies || []).map((tech) => <span key={tech} className="op-chip">{tech}</span>)}
            </div>
          </div>
        ))}
        {!profile?.experiences?.length && <p className="op-sub">没有解析到项目经历。</p>}
      </div>
    </div>
  );
};
