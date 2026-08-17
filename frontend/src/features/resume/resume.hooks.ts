import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resumeApi } from './resume.api';
import { toast } from '@/components/ui';

// 简历列表查询键
export const resumeKeys = {
  all: ['resumes'] as const,
  lists: () => [...resumeKeys.all, 'list'] as const,
  list: (filters: string) => [...resumeKeys.lists(), { filters }] as const,
  details: () => [...resumeKeys.all, 'detail'] as const,
  detail: (id: string) => [...resumeKeys.details(), id] as const,
  analysis: (id: string) => [...resumeKeys.all, 'analysis', id] as const,
};

// 获取简历列表
export const useResumes = () => {
  return useQuery({
    queryKey: resumeKeys.lists(),
    queryFn: async () => {
      const { resumes } = await resumeApi.list();
      return resumes;
    },
    staleTime: 30_000, // 30 秒内不重新请求
  });
};

// 获取单个简历
export const useResume = (id: string) => {
  return useQuery({
    queryKey: resumeKeys.detail(id),
    queryFn: () => resumeApi.get(id),
    enabled: !!id,
  });
};

// 获取简历分析
export const useResumeAnalysis = (id: string) => {
  return useQuery({
    queryKey: resumeKeys.analysis(id),
    queryFn: () => resumeApi.getAnalysis(id),
    enabled: !!id,
  });
};

// 上传简历
export const useUploadResume = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => resumeApi.upload(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resumeKeys.lists() });
      toast.success({ content: '简历上传成功', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '上传失败';
      toast.error({ content: `上传失败：${message}`, duration: 'long' });
    },
  });
};

// 分析简历
export const useAnalyzeResume = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resumeApi.analyze(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: resumeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: resumeKeys.analysis(id) });
      toast.success({ content: '分析完成', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '分析失败';
      toast.error({ content: `分析失败：${message}`, duration: 'long' });
    },
  });
};

// 删除简历
export const useDeleteResume = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resumeApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resumeKeys.lists() });
      toast.success({ content: '删除成功', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '删除失败';
      toast.error({ content: `删除失败：${message}`, duration: 'long' });
    },
  });
};
