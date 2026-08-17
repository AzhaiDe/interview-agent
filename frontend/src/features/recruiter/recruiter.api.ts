import { apiClient } from '@/services/api.client';
import type { ResumeProfile } from '@/features/resume/resume.api';

export interface RecruiterJob {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  requirements: string[];
  status: 'draft' | 'active' | 'closed';
  createdAt: string;
  updatedAt: string;
  rubric?: any;
  candidateCount?: number;
}

export interface RecruiterCandidate {
  id: string;
  jobId: string;
  resumeId: string;
  fileName: string;
  analysisStatus: 'pending' | 'analyzing' | 'completed' | 'failed';
  analysis?: CandidateAnalysis;
  matchScore?: number;
  matchReason?: string;
}

export interface CandidateAnalysis {
  profile: ResumeProfile;
  strengths: string[];
  risks: string[];
  recommendedRoles: string[];
}

export interface MatchResult {
  candidateId: string;
  score: number;
  reasons: string[];
  concerns: string[];
}

export interface Task {
  id: string;
  type: 'analysis' | 'matching';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  stage?: string;
  mode?: 'model' | 'fallback' | 'mixed';
  createdAt: string;
  updatedAt: string;
}

// 招聘 API
export const recruiterApi = {
  // 职位管理
  createJob: async (data: {
    title: string;
    description: string;
    requirements: string[];
  }): Promise<RecruiterJob> => {
    const response = await apiClient.post('/recruiter/jobs', data);
    return response.data;
  },

  listJobs: async (): Promise<{ jobs: RecruiterJob[] }> => {
    const response = await apiClient.get('/recruiter/jobs');
    return response.data;
  },

  getJob: async (jobId: string): Promise<RecruiterJob> => {
    const response = await apiClient.get(`/recruiter/jobs/${jobId}`);
    return response.data;
  },

  confirmRubric: async (jobId: string, rubric: any): Promise<void> => {
    await apiClient.post(`/recruiter/jobs/${jobId}/confirm-rubric`, { rubric });
  },

  // 候选人管理
  uploadCandidate: async (jobId: string, file: File): Promise<RecruiterCandidate> => {
    const formData = new FormData();
    formData.append('resume', file);
    const response = await apiClient.post(`/recruiter/jobs/${jobId}/candidates`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  addCandidateFromResume: async (jobId: string, resumeId: string): Promise<RecruiterCandidate> => {
    const response = await apiClient.post(`/recruiter/jobs/${jobId}/candidates/from-resume`, {
      resumeId,
    });
    return response.data;
  },

  // 匹配
  startMatch: async (jobId: string): Promise<Task> => {
    const response = await apiClient.post(`/recruiter/jobs/${jobId}/match`);
    return response.data;
  },

  // 任务
  getTask: async (taskId: string): Promise<Task> => {
    const response = await apiClient.get(`/recruiter/tasks/${taskId}`);
    return response.data;
  },

  // 结果
  getResults: async (jobId: string): Promise<{ results: MatchResult[] }> => {
    const response = await apiClient.get(`/recruiter/jobs/${jobId}/results`);
    return response.data;
  },
};
