import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recruiterApi } from './recruiter.api';
import { toast } from '@/components/ui';

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

export const useRecruiterJobs = () =>
  useQuery({
    queryKey: recruiterKeys.jobs.lists(),
    queryFn: async () => {
      const { jobs } = await recruiterApi.listJobs();
      return jobs;
    },
    staleTime: 30_000,
  });

export const useRecruiterJob = (jobId: string) =>
  useQuery({
    queryKey: recruiterKeys.jobs.detail(jobId),
    queryFn: () => recruiterApi.getJob(jobId),
    enabled: !!jobId,
  });

export const useMatchResults = (jobId: string) =>
  useQuery({
    queryKey: recruiterKeys.jobs.results(jobId),
    queryFn: async () => {
      const { results } = await recruiterApi.getResults(jobId);
      return results;
    },
    enabled: !!jobId,
  });

export const useTask = (taskId: string) =>
  useQuery({
    queryKey: recruiterKeys.tasks.detail(taskId),
    queryFn: () => recruiterApi.getTask(taskId),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.task?.status;
      return status && ['queued', 'analyzing', 'matching', 'running'].includes(status) ? 2000 : false;
    },
  });

export const useCreateJob = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; jd: string }) => recruiterApi.createJob(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruiterKeys.jobs.lists() });
      toast.success({ content: '岗位 Rubric 已生成，请确认后开始匹配', duration: 'medium' });
    },
    onError: (error: any) => {
      toast.error({ content: `创建失败：${error.message}`, duration: 'long' });
    },
  });
};

export const useConfirmRubric = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => recruiterApi.confirmRubric(jobId),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: recruiterKeys.jobs.detail(jobId) });
      toast.success({ content: 'Rubric 已确认', duration: 'medium' });
    },
    onError: (error: any) => {
      toast.error({ content: `确认失败：${error.message}`, duration: 'long' });
    },
  });
};

export const useUploadCandidate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, file }: { jobId: string; file: File }) =>
      recruiterApi.uploadCandidate(jobId, file),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: recruiterKeys.jobs.detail(variables.jobId) });
      toast.success({ content: '候选人已上传', duration: 'medium' });
    },
    onError: (error: any) => {
      toast.error({ content: `上传失败：${error.message}`, duration: 'long' });
    },
  });
};

export const useStartMatch = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => recruiterApi.startMatch(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruiterKeys.all });
      toast.success({ content: '匹配任务已启动', duration: 'medium' });
    },
    onError: (error: any) => {
      toast.error({ content: `启动失败：${error.message}`, duration: 'long' });
    },
  });
};
