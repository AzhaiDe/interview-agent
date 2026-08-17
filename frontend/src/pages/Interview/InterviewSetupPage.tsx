import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Input, message } from 'antd';
import { useResumes } from '@/features/resume/resume.hooks';
import type { RecommendedRole } from '@/features/resume/resume.api';
import { useStartInterview } from '@/features/interview/interview.hooks';
import { INTERVIEW_TYPES, PRESSURE_LEVELS, ROLE_PRESETS, roleBand } from '@/lib/interview-options';
import type { InterviewType } from '@/features/interview/interview.api';
import { Loading } from '@/components/ui';

const EMPTY_RECOMMENDED: RecommendedRole[] = [];

export const InterviewSetupPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: resumes, isLoading } = useResumes();
  const start = useStartInterview();
  const [resumeId, setResumeId] = useState(params.get('resumeId') || '');
  const [targetRole, setTargetRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [interviewType, setInterviewType] = useState<InterviewType>('project_deep_dive');
  const [pressure, setPressure] = useState(3);

  const resume = resumes?.find((item) => item.id === resumeId);
  const recommended = resume?.profile?.recommendedRoles || EMPTY_RECOMMENDED;

  useEffect(() => {
    if (resume?.profile?.targetRole && !targetRole && !customRole) {
      setTargetRole(resume.profile.targetRole);
    }
  }, [resume, targetRole, customRole]);

  const roleOptions = useMemo(() => {
    const fromResume = recommended.map((item) => item.role);
    const presets = ROLE_PRESETS.map((item) => item.label);
    return [...new Set([resume?.profile?.targetRole, ...fromResume, ...presets].filter(Boolean))] as string[];
  }, [recommended, resume]);

  const submit = () => {
    if (!resume?.profile) return message.warning('请先选择一份已解析的简历');
    const role = customRole.trim() || targetRole || resume.profile.targetRole;
    if (!role) return message.warning('请选择或填写目标岗位');
    start.mutate(
      {
        profile: { ...resume.profile, targetRole: role },
        targetRole: role,
        interviewType,
        pressure,
      },
      {
        onSuccess: (session) => navigate(`/interview/${session.sessionId}`),
      },
    );
  };

  if (isLoading) return <Loading fullScreen text="加载简历..." />;

  return (
    <div>
      <div className="op-hero">
        <div className="op-kicker">面试设置</div>
        <h1 className="op-title">像填报志愿一样，先把约束选清楚</h1>
        <p className="op-sub">简历决定证据，岗位决定知识图，类型决定追问路径，压力决定验证密度。</p>
      </div>

      <div className="op-card" style={{ marginBottom: 16 }}>
        <h3>1. 选择简历</h3>
        {!resumes?.length ? (
          <p className="op-sub">还没有简历，请先去上传。<Button type="link" onClick={() => navigate('/resume')}>去上传</Button></p>
        ) : (
          <div className="op-grid op-grid-2" style={{ marginTop: 12 }}>
            {resumes.map((item) => (
              <button key={item.id} type="button" className={`op-choice ${resumeId === item.id ? 'active' : ''}`} onClick={() => { setResumeId(item.id); setTargetRole(item.profile?.targetRole || ''); }}>
                <strong>{item.fileName}</strong>
                <span>{item.profile?.targetRole || '未指定岗位'} · {(item.profile?.skills || []).slice(0, 4).join(' / ')}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="op-card" style={{ marginBottom: 16 }}>
        <h3>2. 目标岗位</h3>
        <div className="op-grid op-grid-2" style={{ marginTop: 12 }}>
          {roleOptions.map((role) => {
            const rec = recommended.find((item) => item.role === role);
            const band = rec ? roleBand(rec.score) : null;
            return (
              <button key={role} type="button" className={`op-choice ${targetRole === role && !customRole ? 'active' : ''}`} onClick={() => { setTargetRole(role); setCustomRole(''); }}>
                <strong>{role}</strong>
                <span>
                  {band ? `${band.label} · ${Math.round(rec!.score)} 分` : ROLE_PRESETS.find((item) => item.label === role)?.hint || '将按该岗位能力图选题和评分'}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 12 }}>
          <Input placeholder="或输入自定义岗位，例如：基础架构工程师" value={customRole} onChange={(e) => setCustomRole(e.target.value)} />
        </div>
      </div>

      <div className="op-card" style={{ marginBottom: 16 }}>
        <h3>3. 面试类型</h3>
        <div className="op-grid op-grid-2" style={{ marginTop: 12 }}>
          {INTERVIEW_TYPES.map((item) => (
            <button key={item.id} type="button" className={`op-choice ${interviewType === item.id ? 'active' : ''}`} onClick={() => setInterviewType(item.id)}>
              <strong>{item.label}</strong>
              <span>{item.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="op-card" style={{ marginBottom: 16 }}>
        <h3>4. 压力等级</h3>
        <div className="op-grid op-grid-3" style={{ marginTop: 12 }}>
          {PRESSURE_LEVELS.map((item) => (
            <button key={item.level} type="button" className={`op-choice ${pressure === item.level ? 'active' : ''}`} onClick={() => setPressure(item.level)}>
              <span className={`op-chip ${item.tag.includes('冲') ? 'reach' : item.tag === '保底' ? 'safe' : 'stable'}`}>{item.tag}</span>
              <strong style={{ marginTop: 8 }}>L{item.level} {item.label}</strong>
              <span>{item.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <Button type="primary" size="large" loading={start.isPending} onClick={submit}>生成第一题并开始</Button>
    </div>
  );
};
