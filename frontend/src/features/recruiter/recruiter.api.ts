import { apiClient } from '@/services/api.client';

export interface JobRequirement {
  label: string;
  category?: string;
  evidenceExpectation?: string;
  weight?: number;
}

export interface RecruiterJob {
  id: string;
  title: string;
  jdRaw: string;
  level?: string;
  rubricStatus?: 'draft' | 'confirmed';
  createdAt: string;
  updatedAt: string;
  mustHave?: JobRequirement[];
  niceToHave?: JobRequirement[];
  responsibilities?: string[];
  competencies?: string[];
  interviewQuestions?: string[];
  city?: string;
  team?: string;
  agentInsights?: { summary?: string; hiddenSignals?: string[] };
}

export interface RecruiterCandidate {
  id: string;
  jobId: string;
  fileName: string;
  candidateName?: string;
  analysisStatus?: 'queued' | 'analyzing' | 'completed' | 'fallback' | 'failed';
  createdAt: string;
  analysis?: {
    overallScore: number;
    recommendation: string;
    strengths: string[];
    risks: string[];
    interviewFocus: string[];
    missingRequirements?: string[];
  };
}

export interface MatchResult extends RecruiterCandidate {
  rank: number;
  analysis: NonNullable<RecruiterCandidate['analysis']> & { overallScore: number };
}

export interface JobTask {
  id: string;
  status: string;
  progress: number;
  total: number;
  stage?: string;
  completed?: number;
}

export const recruiterApi = {
  createJob: (data: { title: string; jd: string }): Promise<{ job: RecruiterJob }> =>
    apiClient.post('/recruiter/jobs', data),

  listJobs: (): Promise<{ jobs: RecruiterJob[] }> =>
    apiClient.get('/recruiter/jobs'),

  getJob: (jobId: string): Promise<{ job: RecruiterJob; candidates: RecruiterCandidate[]; results: MatchResult[] }> =>
    apiClient.get(`/recruiter/jobs/${jobId}`),

  confirmRubric: (jobId: string): Promise<{ job: RecruiterJob }> =>
    apiClient.post(`/recruiter/jobs/${jobId}/confirm-rubric`),

  uploadCandidate: async (jobId: string, file: File) => {
    const formData = new FormData();
    formData.append('resume', file);
    return apiClient.post(`/recruiter/jobs/${jobId}/candidates`, formData);
  },

  startMatch: (jobId: string): Promise<{ taskId: string; status: string; task: JobTask }> =>
    apiClient.post(`/recruiter/jobs/${jobId}/match`),

  getTask: (taskId: string): Promise<{ task: JobTask; results?: MatchResult[] }> =>
    apiClient.get(`/recruiter/tasks/${taskId}`),

  getResults: (jobId: string): Promise<{ results: MatchResult[] }> =>
    apiClient.get(`/recruiter/jobs/${jobId}/results`),
};
