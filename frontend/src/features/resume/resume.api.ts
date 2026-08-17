import { apiClient } from '@/services/api.client';

export interface Experience {
  id?: string;
  title: string;
  organization?: string;
  role?: string;
  period?: string;
  type: string;
  summary: string;
  bullets: string[];
  technologies: string[];
  claims: string[];
  highlights: string[];
  risks: string[];
  contributionLevel?: string;
  evidenceQuality?: number;
}

export interface RecommendedRole {
  role: string;
  score: number;
  reasons: string[];
}

export interface ResumeProfile {
  rawText?: string;
  name?: string;
  contact?: { email?: string; phone?: string; links?: string[] };
  targetRole: string;
  summary: string;
  education: string[];
  recommendedRoles: RecommendedRole[];
  skills: string[];
  experiences: Experience[];
  strengths: string[];
  risks: string[];
  questions?: string[];
  analysisMode?: 'model' | 'fallback';
  analysisVersion?: string;
}

export interface Resume {
  id: string;
  fileName: string;
  createdAt: string;
  profile?: ResumeProfile;
  rawText?: string;
}

export interface AnalysisTask {
  taskId: string;
  status: string;
}

export interface JobTask {
  id: string;
  status: string;
  progress: number;
  total: number;
  stage?: string;
  mode?: string;
  completed?: number;
}

export const resumeApi = {
  upload: async (file: File): Promise<{ resumeId: string; fileName: string; profile: ResumeProfile }> => {
    const formData = new FormData();
    formData.append('resume', file);
    return apiClient.post('/resumes', formData);
  },

  list: async (): Promise<{ resumes: Resume[] }> => apiClient.get('/resumes'),

  get: async (id: string): Promise<Resume> => apiClient.get(`/resumes/${id}`),

  getAnalysis: async (id: string): Promise<{ resumeId: string; profile: ResumeProfile }> =>
    apiClient.get(`/resumes/${id}/analysis`),

  analyze: async (id: string): Promise<AnalysisTask> => apiClient.post(`/resumes/${id}/analyze`),

  getTask: async (taskId: string): Promise<{ task: JobTask }> => apiClient.get(`/tasks/${taskId}`),

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/resumes/${id}`);
  },
};
