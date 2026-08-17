import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recruiterApi } from './recruiter.api';
import { toast } from '@/components/ui';

// 招聘查询键
export const recruiterKeys = {
  all: ['recruiter'] as const,
  jobs: {
    lists: () => [...recruiterKeys.all, 'jobs', 'list'] as const,
    detail: (jobId: string) => [...recruiterKeys.all, 'jobs', jobId] as const,
    results: (jobId: string) => [...recruiterKeys.all, 'jobs', jobId, 'results'] as const,
  },
  tasks: {
    detail: (taskId: string) => [...recruiterKeys.all, 'tasks', taskId] as const,
  },
};

// 获取职位列表
export const useRecruiterJobs = () => {
  return useQuery({
    queryKey: recruiterKeys.jobs.lists(),
    queryFn: async () => {
      const { jobs } = await recruiterApi.listJobs();
      return jobs;
    },
    staleTime: 30_000,
  });
};

// 获取单个职位
export const useRecruiterJob = (jobId: string) => {
  return useQuery({
    queryKey: recruiterKeys.jobs.detail(jobId),
    queryFn: () => recruiterApi.getJob(jobId),
    enabled: !!jobId,
  });
};

// 获取匹配结果
export const useMatchResults = (jobId: string) => {
  return useQuery({
    queryKey: recruiterKeys.jobs.results(jobId),
    queryFn: async () => {
      const { results } = await recruiterApi.getResults(jobId);
      return results;
    },
    enabled: !!jobId,
    staleTime: 10_000,
  });
};

// 获取任务状态
export const useTask = (taskId: string) => {
  return useQuery({
    queryKey: recruiterKeys.tasks.detail(taskId),
    queryFn: () => recruiterApi.getTask(taskId),
    enabled: !!taskId,
    refetchInterval: 2000, // 每 2 秒刷新任务状态
  });
};

// 创建职位
export const useCreateJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { title: string; description: string; requirements: string[] }) =>
      recruiterApi.createJob(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruiterKeys.jobs.lists() });
      toast.success({ content: '职位创建成功', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '创建失败';
      toast.error({ content: `创建失败：${message}`, duration: 'long' });
    },
  });
};

// 上传候选人
export const useUploadCandidate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, file }: { jobId: string; file: File }) =>
      recruiterApi.uploadCandidate(jobId, file),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: recruiterKeys.jobs.detail(variables.jobId) });
      toast.success({ content: '候选人上传成功', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '上传失败';
      toast.error({ content: `上传失败：${message}`, duration: 'long' });
    },
  });
};

// 从简历库添加候选人
export const useAddCandidateFromResume = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, resumeId }: { jobId: string; resumeId: string }) =>
      recruiterApi.addCandidateFromResume(jobId, resumeId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: recruiterKeys.jobs.detail(variables.jobId) });
      toast.success({ content: '候选人添加成功', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '添加失败';
      toast.error({ content: `添加失败：${message}`, duration: 'long' });
    },
  });
};

// 开始匹配
export const useStartMatch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => recruiterApi.startMatch(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruiterKeys.all });
      toast.success({ content: '匹配任务已启动', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '启动失败';
      toast.error({ content: `启动失败：${message}`, duration: 'long' });
    },
  });
};
