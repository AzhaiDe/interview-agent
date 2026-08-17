import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Modal, Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { useDeleteResume, useResumes, useUploadResume } from '@/features/resume/resume.hooks';
import { Loading, Empty, Error as ErrorDisplay } from '@/components/ui';

export const ResumeListPage = () => {
  const navigate = useNavigate();
  const { data: resumes, isLoading, error, refetch } = useResumes();
  const uploadMutation = useUploadResume();
  const deleteMutation = useDeleteResume();
  const [open, setOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const handleUpload = () => {
    const file = fileList[0]?.originFileObj;
    if (!file) return message.warning('请先选择文件');
    uploadMutation.mutate(file, {
      onSuccess: (result) => {
        setOpen(false);
        setFileList([]);
        navigate(`/resume/${result.resumeId}`);
      },
    });
  };

  if (isLoading) return <Loading fullScreen text="加载简历..." />;
  if (error) return <ErrorDisplay variant="result" severity="error" message="加载失败" description={error.message} onRetry={refetch} />;

  return (
    <div>
      <div className="op-hero" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end' }}>
        <div>
          <div className="op-kicker">简历分析</div>
          <h1 className="op-title">把简历变成可核验的证据图</h1>
          <p className="op-sub">上传后先做本地解析，再可启动模型增强。分析完成即可选择目标岗位开始面试。</p>
        </div>
        <Button type="primary" size="large" onClick={() => setOpen(true)}>上传简历</Button>
      </div>

      {!resumes?.length ? (
        <div className="op-card">
          <Empty description="还没有简历" actionText="上传第一份" onAction={() => setOpen(true)} />
        </div>
      ) : (
        <div className="op-grid" style={{ gridTemplateColumns: '1fr' }}>
          {resumes.map((resume) => (
            <div key={resume.id} className="op-card" style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{resume.fileName}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span className="op-chip stable">{resume.profile?.targetRole || '待选择岗位'}</span>
                  <span className="op-chip">{resume.profile?.analysisMode === 'model' ? '模型分析' : '本地解析'}</span>
                  <span className="op-chip">{new Date(resume.createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  {(resume.profile?.skills || []).slice(0, 6).join(' · ') || '尚未抽出技能'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link to={`/resume/${resume.id}`}><Button type="primary">查看分析</Button></Link>
                <Button danger onClick={() => deleteMutation.mutate(resume.id)}>删除</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal title="上传简历" open={open} onCancel={() => setOpen(false)} onOk={handleUpload} confirmLoading={uploadMutation.isPending} okText="上传并解析">
        <Upload.Dragger
          maxCount={1}
          fileList={fileList}
          beforeUpload={() => false}
          onChange={({ fileList: next }) => setFileList(next.slice(-1))}
          accept=".pdf,.doc,.docx,.txt,.md"
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p>拖拽 PDF / Word / Markdown 到这里</p>
        </Upload.Dragger>
      </Modal>
    </div>
  );
};
