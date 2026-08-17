import { apiClient } from '@/services/api.client';

export interface InterviewSession {
  id: string;
  ownerId: string;
  resumeId: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  createdAt: string;
  updatedAt: string;
  currentQuestion?: string;
  currentQuestionIndex?: number;
  totalQuestions?: number;
  transcript?: InterviewTurn[];
  abilityBeliefs?: Record<string, any>;
  growthReport?: GrowthReport;
}

export interface InterviewTurn {
  question: string;
  answer?: string;
  judges?: JudgeResult[];
  evidenceLedger?: any[];
  timestamp: string;
}

export interface JudgeResult {
  technicalVerdict: 'strong' | 'medium' | 'weak' | 'incorrect';
  evidenceQuality: 'strong' | 'medium' | 'weak' | 'absent';
  consistency: 'consistent' | 'inconsistent' | 'contradictory';
  confidence: number;
}

export interface GrowthReport {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  skillScores: Record<string, number>;
}

export interface InterviewStartRequest {
  resumeId: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  interviewType?: 'technical' | 'behavioral' | 'system_design';
}

export interface InterviewAnswerRequest {
  answer: string;
}

// 面试 API
export const interviewApi = {
  start: async (data: InterviewStartRequest): Promise<InterviewSession> => {
    const response = await apiClient.post('/interviews', data);
    return response.data;
  },

  getHistory: async (): Promise<{ interviews: InterviewSession[] }> => {
    const response = await apiClient.get('/interviews/history');
    return response.data;
  },

  get: async (id: string): Promise<InterviewSession> => {
    const response = await apiClient.get(`/interviews/${id}`);
    return response.data;
  },

  submitAnswer: async (id: string, data: InterviewAnswerRequest): Promise<InterviewSession> => {
    const response = await apiClient.post(`/interviews/${id}/answers`, data);
    return response.data;
  },

  finish: async (id: string): Promise<InterviewSession> => {
    const response = await apiClient.post(`/interviews/${id}/finish`);
    return response.data;
  },

  abandon: async (id: string): Promise<void> => {
    await apiClient.post(`/interviews/${id}/abandon`);
  },

  getReport: async (id: string): Promise<{ report: GrowthReport }> => {
    const response = await apiClient.get(`/interviews/${id}/report`);
    return response.data;
  },

  pause: async (id: string): Promise<void> => {
    await apiClient.post(`/interviews/${id}/pause`);
  },

  resume: async (id: string): Promise<void> => {
    await apiClient.post(`/interviews/${id}/resume`);
  },

  getCheckpoints: async (id: string): Promise<{ checkpoints: any[] }> => {
    const response = await apiClient.get(`/interviews/${id}/checkpoints`);
    return response.data;
  },

  getLatestCheckpoint: async (id: string): Promise<{ checkpoint: any }> => {
    const response = await apiClient.get(`/interviews/${id}/checkpoints/latest`);
    return response.data;
  },
};
