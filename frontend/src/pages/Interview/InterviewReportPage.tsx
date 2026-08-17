import { useNavigate, useParams } from 'react-router-dom';
import { Button, Progress } from 'antd';
import { useInterviewReport } from '@/features/interview/interview.hooks';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

const dimensionLabel: Record<string, string> = {
  projectOwnership: '项目所有权',
  technicalDepth: '技术深度',
  metricsLiteracy: '指标素养',
  tradeoffJudgment: '权衡判断',
  systemThinking: '系统思维',
  communication: '表达结构',
};

export const InterviewReportPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: report, isLoading, error, refetch } = useInterviewReport(id || '');

  if (isLoading) return <Loading fullScreen text="加载报告..." />;
  if (error) return <ErrorDisplay variant="result" severity="error" message="报告尚未生成或加载失败" description={error.message} onRetry={refetch} />;
  if (!report) return <Empty description="报告尚未生成" />;

  const resultTone = report.result === 'PASS' ? 'safe' : report.result === 'BORDERLINE' ? 'warn' : 'reach';

  return (
    <div>
      <Button onClick={() => navigate('/interview')} style={{ marginBottom: 16 }}>返回列表</Button>
      <div className="op-hero">
        <div className="op-kicker">面试分析报告</div>
        <h1 className="op-title">本场结果 {report.result}</h1>
        <p className="op-sub">{report.roleFitSummary}</p>
        <span className={`op-chip ${resultTone}`}>{report.result}</span>
      </div>

      <div className="op-grid op-grid-3" style={{ marginBottom: 16 }}>
        <div className="op-card op-stat">
          <span className="op-chip stable">平均分</span>
          <b>{Number(report.average || 0).toFixed(1)}</b>
        </div>
        <div className="op-card op-stat">
          <span className="op-chip safe">已覆盖能力</span>
          <b>{report.coveredSkills?.length || 0}</b>
        </div>
        <div className="op-card op-stat">
          <span className="op-chip reach">待补能力</span>
          <b>{report.uncoveredMustHave?.length || 0}</b>
        </div>
      </div>

      <div className="op-card" style={{ marginBottom: 16 }}>
        <h3>能力维度</h3>
        {Object.entries(report.dimensionScores || {}).map(([key, value]) => (
          <div key={key} style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>{dimensionLabel[key] || key}</span>
              <span>{value}</span>
            </div>
            <Progress percent={Math.min(100, Number(value))} showInfo={false} strokeColor="#2563eb" />
          </div>
        ))}
      </div>

      <div className="op-grid op-grid-2" style={{ marginBottom: 16 }}>
        <div className="op-card">
          <span className="op-chip safe">稳妥证据</span>
          <div style={{ marginTop: 12 }}>
            {(report.strengthItems || []).map((item) => (
              <div key={item.title} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div className="op-sub">{item.skill} · {item.evidenceQuote}</div>
              </div>
            ))}
            {!report.strengthItems?.length && <p className="op-sub">本场还没有足够的正向证据。</p>}
          </div>
        </div>
        <div className="op-card">
          <span className="op-chip reach">冲刺缺口</span>
          <div style={{ marginTop: 12 }}>
            {(report.weakPoints || []).map((item) => (
              <div key={item.title} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div className="op-sub">{item.whyItMatters}</div>
                <div className="op-sub">{item.howToFix}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {report.skillScores && Object.keys(report.skillScores).length > 0 && (
        <div className="op-card" style={{ marginBottom: 16 }}>
          <h3>技能信念</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {Object.entries(report.skillScores).map(([skill, score]) => (
              <span key={skill} className={`op-chip ${score >= 70 ? 'safe' : score >= 50 ? 'stable' : 'reach'}`}>
                {skill} {Math.round(score)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="op-card">
        <h3>7 天训练计划</h3>
        {(report.next7DaysPlan || []).map((item) => (
          <div key={item.dayRange} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 700 }}>{item.dayRange} · {item.task}</div>
            <div className="op-sub">成功标准：{item.successCriteria}</div>
          </div>
        ))}
        {report.recommendedPressure && (
          <div style={{ marginTop: 12 }} className="op-chip reach">建议下一场压力：L{report.recommendedPressure}</div>
        )}
      </div>
    </div>
  );
};
