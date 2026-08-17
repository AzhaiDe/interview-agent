import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { interviewApi, type InterviewStartRequest, type InterviewAnswerRequest } from './interview.api';
import { toast } from '@/components/ui';

// 面试查询键
export const interviewKeys = {
  all: ['interviews'] as const,
  history: () => [...interviewKeys.all, 'history'] as const,
  details: () => [...interviewKeys.all, 'detail'] as const,
  detail: (id: string) => [...interviewKeys.details(), id] as const,
  reports: (id: string) => [...interviewKeys.all, 'report', id] as const,
  checkpoints: (id: string) => [...interviewKeys.all, 'checkpoints', id] as const,
};

// 获取面试历史
export const useInterviewHistory = () => {
  return useQuery({
    queryKey: interviewKeys.history(),
    queryFn: async () => {
      const { interviews } = await interviewApi.getHistory();
      return interviews;
    },
    staleTime: 30_000,
  });
};

// 获取单个面试
export const useInterview = (id: string) => {
  return useQuery({
    queryKey: interviewKeys.detail(id),
    queryFn: () => interviewApi.get(id),
    enabled: !!id,
    refetchInterval: 5000, // 每 5 秒刷新一次（用于实时更新）
  });
};

// 获取面试报告
export const useInterviewReport = (id: string) => {
  return useQuery({
    queryKey: interviewKeys.reports(id),
    queryFn: async () => {
      const { report } = await interviewApi.getReport(id);
      return report;
    },
    enabled: !!id,
  });
};

// 开始面试
export const useStartInterview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InterviewStartRequest) => interviewApi.start(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.history() });
      toast.success({ content: '面试已开始', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '开始面试失败';
      toast.error({ content: `开始面试失败：${message}`, duration: 'long' });
    },
  });
};

// 提交答案
export const useSubmitAnswer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: InterviewAnswerRequest }) =>
      interviewApi.submitAnswer(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.detail(variables.id) });
      toast.success({ content: '答案已提交', duration: 'short' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '提交答案失败';
      toast.error({ content: `提交答案失败：${message}`, duration: 'long' });
    },
  });
};

// 完成面试
export const useFinishInterview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => interviewApi.finish(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: interviewKeys.history() });
      toast.success({ content: '面试已完成', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '完成面试失败';
      toast.error({ content: `完成面试失败：${message}`, duration: 'long' });
    },
  });
};

// 放弃面试
export const useAbandonInterview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => interviewApi.abandon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.history() });
      toast.info({ content: '面试已放弃', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '放弃面试失败';
      toast.error({ content: `放弃面试失败：${message}`, duration: 'long' });
    },
  });
};

// 暂停面试
export const usePauseInterview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => interviewApi.pause(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.detail(id) });
      toast.info({ content: '面试已暂停', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '暂停面试失败';
      toast.error({ content: `暂停面试失败：${message}`, duration: 'long' });
    },
  });
};

// 恢复面试
export const useResumeInterview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => interviewApi.resume(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.detail(id) });
      toast.success({ content: '面试已恢复', duration: 'medium' });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || '恢复面试失败';
      toast.error({ content: `恢复面试失败：${message}`, duration: 'long' });
    },
  });
};
