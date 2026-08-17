import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resumeApi } from './resume.api';
import { toast } from '@/components/ui';

export const resumeKeys = {
  all: ['resumes'] as const,
  lists: () => [...resumeKeys.all, 'list'] as const,
  details: () => [...resumeKeys.all, 'detail'] as const,
  detail: (id: string) => [...resumeKeys.details(), id] as const,
};

export const useResumes = () =>
  useQuery({
    queryKey: resumeKeys.lists(),
    queryFn: async () => {
      const { resumes } = await resumeApi.list();
      return resumes;
    },
    staleTime: 30_000,
  });

export const useResume = (id: string) =>
  useQuery({
    queryKey: resumeKeys.detail(id),
    queryFn: () => resumeApi.get(id),
    enabled: !!id,
  });

export const useUploadResume = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => resumeApi.upload(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resumeKeys.lists() });
      toast.success({ content: '简历已上传，正在生成本地解析结果', duration: 'medium' });
    },
    onError: (error: any) => {
      toast.error({ content: `上传失败：${error.message}`, duration: 'long' });
    },
  });
};

export const useAnalyzeResume = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const started = await resumeApi.analyze(id);
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const { task } = await resumeApi.getTask(started.taskId);
        if (task.status === 'completed' || task.status === 'failed') return task;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      throw new Error('分析超时，请稍后刷新查看');
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: resumeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: resumeKeys.lists() });
      toast.success({ content: '简历分析完成', duration: 'medium' });
    },
    onError: (error: any) => {
      toast.error({ content: `分析失败：${error.message}`, duration: 'long' });
    },
  });
};

export const useDeleteResume = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resumeApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resumeKeys.lists() });
      toast.success({ content: '已删除简历', duration: 'medium' });
    },
    onError: (error: any) => {
      toast.error({ content: `删除失败：${error.message}`, duration: 'long' });
    },
  });
};
