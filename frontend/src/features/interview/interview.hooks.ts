import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { interviewApi, type InterviewStartRequest } from './interview.api';
import { toast } from '@/components/ui';

export const interviewKeys = {
  all: ['interviews'] as const,
  history: () => [...interviewKeys.all, 'history'] as const,
  detail: (id: string) => [...interviewKeys.all, 'detail', id] as const,
  report: (id: string) => [...interviewKeys.all, 'report', id] as const,
};

export const useInterviewHistory = () =>
  useQuery({
    queryKey: interviewKeys.history(),
    queryFn: async () => {
      const { interviews } = await interviewApi.getHistory();
      return interviews;
    },
    staleTime: 15_000,
  });

export const useInterview = (id: string) =>
  useQuery({
    queryKey: interviewKeys.detail(id),
    queryFn: () => interviewApi.get(id),
    enabled: !!id,
  });

export const useInterviewReport = (id: string) =>
  useQuery({
    queryKey: interviewKeys.report(id),
    queryFn: async () => {
      const { report } = await interviewApi.getReport(id);
      return report;
    },
    enabled: !!id,
  });

export const useStartInterview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InterviewStartRequest) => interviewApi.start(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.history() });
      toast.success({ content: '面试已开始', duration: 'medium' });
    },
    onError: (error: any) => {
      toast.error({ content: `开始面试失败：${error.message}`, duration: 'long' });
    },
  });
};

export const useSubmitAnswer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: string }) =>
      interviewApi.submitAnswer(id, answer),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.detail(variables.id) });
    },
    onError: (error: any) => {
      toast.error({ content: `提交失败：${error.message}`, duration: 'long' });
    },
  });
};

export const useFinishInterview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => interviewApi.finish(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: interviewKeys.history() });
      toast.success({ content: '面试已完成，正在生成报告', duration: 'medium' });
    },
    onError: (error: any) => {
      toast.error({ content: `完成失败：${error.message}`, duration: 'long' });
    },
  });
};

export const useAbandonInterview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => interviewApi.abandon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.history() });
      toast.info({ content: '已结束本场面试', duration: 'medium' });
    },
    onError: (error: any) => {
      toast.error({ content: `操作失败：${error.message}`, duration: 'long' });
    },
  });
};
