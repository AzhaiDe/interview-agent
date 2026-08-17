import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, Modal } from 'antd';
import { useCreateJob, useRecruiterJobs } from '@/features/recruiter/recruiter.hooks';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

export const RecruiterJobsPage = () => {
  const navigate = useNavigate();
  const { data: jobs, isLoading, error, refetch } = useRecruiterJobs();
  const createJob = useCreateJob();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async () => {
    const values = await form.validateFields();
    createJob.mutate(
      { title: values.title, jd: values.jd },
      {
        onSuccess: (result) => {
          setOpen(false);
          form.resetFields();
          navigate(`/recruiter/${result.job.id}`);
        },
      },
    );
  };

  if (isLoading) return <Loading fullScreen text="加载岗位..." />;
  if (error) return <ErrorDisplay variant="result" severity="error" message="加载失败" description={error.message} onRetry={refetch} />;

  return (
    <div>
      <div className="op-hero" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end' }}>
        <div>
          <div className="op-kicker">招聘评估</div>
          <h1 className="op-title">用 JD 生成可确认的评分尺</h1>
          <p className="op-sub">先贴岗位描述，系统抽出 must-have 和证据期望。确认 Rubric 后再批量匹配候选人。</p>
        </div>
        <Button type="primary" size="large" onClick={() => setOpen(true)}>创建岗位</Button>
      </div>

      {!jobs?.length ? (
        <div className="op-card">
          <Empty description="还没有招聘岗位" actionText="创建第一个" onAction={() => setOpen(true)} />
        </div>
      ) : (
        <div className="op-grid" style={{ gridTemplateColumns: '1fr' }}>
          {jobs.map((job) => (
            <div key={job.id} className="op-card" style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{job.title}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
                  <span className={`op-chip ${job.rubricStatus === 'confirmed' ? 'safe' : 'warn'}`}>
                    {job.rubricStatus === 'confirmed' ? 'Rubric 已确认' : '待确认 Rubric'}
                  </span>
                  {job.level && <span className="op-chip">{job.level}</span>}
                  {job.city && <span className="op-chip">{job.city}</span>}
                  <span className="op-chip">{(job.mustHave || []).length} 项硬性要求</span>
                </div>
                <div className="op-sub">{(job.jdRaw || '').slice(0, 120)}{(job.jdRaw || '').length > 120 ? '…' : ''}</div>
              </div>
              <Button type="primary" onClick={() => navigate(`/recruiter/${job.id}`)}>打开</Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="创建岗位并生成 Rubric"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        confirmLoading={createJob.isPending}
        okText="生成评分尺"
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="岗位名称" rules={[{ required: true, message: '请填写岗位名称' }]}>
            <Input placeholder="例如：Java 后端工程师" />
          </Form.Item>
          <Form.Item
            name="jd"
            label="岗位描述 JD"
            rules={[{ required: true, min: 20, message: 'JD 至少 20 个字符，便于抽出能力要求' }]}
          >
            <Input.TextArea rows={10} placeholder="粘贴完整 JD：职责、必须技能、加分项、团队背景…" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
