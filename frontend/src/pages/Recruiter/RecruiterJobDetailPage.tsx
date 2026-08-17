import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Modal, Progress, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import {
  recruiterKeys,
  useConfirmRubric,
  useRecruiterJob,
  useStartMatch,
  useTask,
  useUploadCandidate,
} from '@/features/recruiter/recruiter.hooks';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

const recLabel: Record<string, string> = {
  strong_interview: '强烈建议面试',
  interview: '建议面试',
  manual_review: '人工复核',
  hold: '暂缓',
};

export const RecruiterJobDetailPage = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useRecruiterJob(jobId || '');
  const confirm = useConfirmRubric();
  const upload = useUploadCandidate();
  const match = useStartMatch();
  const [open, setOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [taskId, setTaskId] = useState('');
  const { data: taskPayload } = useTask(taskId);
  const task = taskPayload?.task;

  useEffect(() => {
    if (task?.status === 'completed' && jobId) {
      queryClient.invalidateQueries({ queryKey: recruiterKeys.jobs.detail(jobId) });
    }
  }, [jobId, queryClient, task?.status]);

  if (isLoading) return <Loading fullScreen text="加载岗位..." />;
  if (error) return <ErrorDisplay variant="result" severity="error" message="加载失败" description={error.message} onRetry={refetch} />;
  if (!data?.job) return <Empty description="岗位不存在" />;

  const { job, candidates = [], results = [] } = data;
  const ranked = [...results].sort((a, b) => (a.rank || 99) - (b.rank || 99));

  const submitUpload = () => {
    const file = fileList[0]?.originFileObj;
    if (!file || !jobId) return;
    upload.mutate({ jobId, file }, {
      onSuccess: () => {
        setOpen(false);
        setFileList([]);
      },
    });
  };

  return (
    <div>
      <Button onClick={() => navigate('/recruiter')} style={{ marginBottom: 16 }}>返回列表</Button>
      <div className="op-hero">
        <div className="op-kicker">岗位 Rubric</div>
        <h1 className="op-title">{job.title}</h1>
        <p className="op-sub">{job.agentInsights?.summary || job.jdRaw?.slice(0, 180)}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <span className={`op-chip ${job.rubricStatus === 'confirmed' ? 'safe' : 'warn'}`}>
            {job.rubricStatus === 'confirmed' ? '已确认' : '草稿'}
          </span>
          {job.level && <span className="op-chip">{job.level}</span>}
          {job.team && <span className="op-chip">{job.team}</span>}
          {job.city && <span className="op-chip">{job.city}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {job.rubricStatus !== 'confirmed' && (
            <Button type="primary" loading={confirm.isPending} onClick={() => jobId && confirm.mutate(jobId)}>确认评分尺</Button>
          )}
          <Button onClick={() => setOpen(true)}>上传候选人</Button>
          <Button
            type="primary"
            disabled={job.rubricStatus !== 'confirmed' || !candidates.length}
            loading={match.isPending}
            onClick={() => jobId && match.mutate(jobId, { onSuccess: (res) => setTaskId(res.taskId) })}
          >
            开始匹配
          </Button>
        </div>
      </div>

      {task && task.status !== 'completed' && (
        <div className="op-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{task.stage || '匹配进行中'}</strong>
            <span className="op-chip stable">{task.status}</span>
          </div>
          <Progress percent={task.total ? Math.round((task.progress / task.total) * 100) : 0} style={{ marginTop: 12 }} />
        </div>
      )}

      <div className="op-grid op-grid-2" style={{ marginBottom: 16 }}>
        <div className="op-card">
          <span className="op-chip reach">硬性要求</span>
          <ul style={{ marginTop: 12, paddingLeft: 18 }}>
            {(job.mustHave || []).map((item) => (
              <li key={item.label} style={{ marginBottom: 8 }}>
                <strong>{item.label}</strong>
                {item.evidenceExpectation && <div className="op-sub">{item.evidenceExpectation}</div>}
              </li>
            ))}
            {!job.mustHave?.length && <li className="op-sub">尚未抽出硬性要求</li>}
          </ul>
        </div>
        <div className="op-card">
          <span className="op-chip stable">加分项 / 职责</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {(job.niceToHave || []).map((item) => <span key={item.label} className="op-chip">{item.label}</span>)}
            {(job.responsibilities || []).slice(0, 6).map((item) => <span key={item} className="op-chip stable">{item}</span>)}
          </div>
        </div>
      </div>

      <div className="op-card" style={{ marginBottom: 16 }}>
        <h3>候选人 {candidates.length}</h3>
        {!candidates.length ? (
          <Empty description="还没有候选人简历" actionText="上传一份" onAction={() => setOpen(true)} />
        ) : (
          <div style={{ marginTop: 12 }}>
            {candidates.map((item) => (
              <div key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{item.candidateName || item.fileName}</div>
                  <div className="op-sub">{item.fileName}</div>
                </div>
                <span className={`op-chip ${item.analysisStatus === 'completed' ? 'safe' : 'stable'}`}>{item.analysisStatus || 'queued'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="op-card">
        <h3>匹配结果</h3>
        {!ranked.length ? (
          <p className="op-sub" style={{ marginTop: 12 }}>确认 Rubric 并上传候选人后，点击「开始匹配」。</p>
        ) : (
          ranked.map((item) => (
            <div key={item.id} className="op-card" style={{ marginTop: 12, boxShadow: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <span className="op-chip reach">#{item.rank}</span>
                  <h3 style={{ margin: '8px 0 4px' }}>{item.candidateName || item.fileName}</h3>
                  <div className="op-sub">{recLabel[item.analysis?.recommendation] || item.analysis?.recommendation}</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{Math.round(item.analysis?.overallScore || 0)}</div>
              </div>
              <div className="op-grid op-grid-2" style={{ marginTop: 12 }}>
                <div>
                  <span className="op-chip safe">优势</span>
                  <ul style={{ paddingLeft: 18, marginTop: 8 }}>
                    {(item.analysis?.strengths || []).slice(0, 4).map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
                <div>
                  <span className="op-chip warn">风险</span>
                  <ul style={{ paddingLeft: 18, marginTop: 8 }}>
                    {(item.analysis?.risks || []).slice(0, 4).map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal title="上传候选人简历" open={open} onCancel={() => setOpen(false)} onOk={submitUpload} confirmLoading={upload.isPending} okText="上传">
        <Upload.Dragger
          maxCount={1}
          fileList={fileList}
          beforeUpload={() => false}
          onChange={({ fileList: next }) => setFileList(next.slice(-1))}
          accept=".pdf,.doc,.docx,.txt,.md"
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p>拖拽候选人简历到这里</p>
        </Upload.Dragger>
      </Modal>
    </div>
  );
};
