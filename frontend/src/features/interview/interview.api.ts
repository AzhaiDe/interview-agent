import { apiClient } from '@/services/api.client';
import type { ResumeProfile } from '@/features/resume/resume.api';

export type InterviewType = 'comprehensive' | 'project_deep_dive' | 'technical_fundamentals' | 'system_design';
export type InterviewResult = 'PASS' | 'BORDERLINE' | 'FAIL';

export interface TranscriptTurn {
  role: 'interviewer' | 'candidate';
  text: string;
  score?: number;
}

export interface Diagnosis {
  round: number;
  question: string;
  answerSummary: string;
  score: number;
  topic: string;
  mappedSkill: string;
  questionType: string;
  action: string;
  missingEvidence: string[];
  weakPoint?: string;
  strongPoint?: string;
  evidenceQuote?: string;
  relevance: number;
  reason?: string;
}

export interface InterviewSession {
  sessionId: string;
  status: 'active' | 'finished' | 'paused' | string;
  targetRole: string;
  pressure: number;
  interviewType: InterviewType;
  phase: string;
  question?: string;
  topic?: string;
  questionType?: string;
  mappedSkill?: string;
  progress: number;
  mode?: string;
  result?: InterviewResult;
  transcript: TranscriptTurn[];
  diagnoses: Diagnosis[];
  roleRubric?: { mustHave: Array<{ skill: string }>; targetRole: string };
  skillRoundCounts?: Record<string, number>;
  graph?: Record<string, unknown>;
  state?: string;
}

export interface InterviewStartRequest {
  profile: ResumeProfile;
  pressure: number;
  interviewType: InterviewType;
  targetRole: string;
}

export interface AnswerResponse extends InterviewSession {
  score: number;
  feedback: string;
  shouldFinish: boolean;
  needsHumanReview?: boolean;
  evaluation?: {
    answeredSkill: string;
    score: number;
    feedback: string;
    evidenceCovered: string[];
    missingEvidence: string[];
    weakPoint?: string;
    strongPoint?: string;
  };
  action?: string;
  sessionCritic?: { shouldFinish: boolean; reason: string; coverageRate: number };
}

export interface GrowthReport {
  average: number;
  result: InterviewResult;
  strengths: number;
  weaknesses: number;
  roleFitSummary: string;
  dimensionScores: Record<string, number>;
  strengthItems: Array<{ title: string; evidenceQuote: string; skill: string }>;
  weakPoints: Array<{
    title: string;
    skill: string;
    severity: string;
    evidenceQuote: string;
    whyItMatters: string;
    howToFix: string;
    drillQuestion: string;
  }>;
  next7DaysPlan: Array<{ dayRange: string; task: string; linkedWeakPoint: string; successCriteria: string }>;
  coveredSkills: string[];
  uncoveredMustHave: string[];
  skillScores?: Record<string, number>;
  coverageRate?: number;
  scoreTrend?: number[];
  recommendedPressure?: number;
}

export const interviewApi = {
  start: (data: InterviewStartRequest): Promise<InterviewSession> =>
    apiClient.post('/interviews', data),

  getHistory: (): Promise<{ interviews: InterviewSession[] }> =>
    apiClient.get('/interviews/history'),

  get: (id: string): Promise<InterviewSession> =>
    apiClient.get(`/interviews/${id}`),

  submitAnswer: (id: string, answer: string): Promise<AnswerResponse> =>
    apiClient.post(`/interviews/${id}/answers`, { answer }, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),

  finish: (id: string): Promise<{ report: GrowthReport; transcript: TranscriptTurn[]; diagnoses: Diagnosis[] }> =>
    apiClient.post(`/interviews/${id}/finish`),

  abandon: (id: string): Promise<void> =>
    apiClient.post(`/interviews/${id}/abandon`),

  getReport: (id: string): Promise<{ report: GrowthReport }> =>
    apiClient.get(`/interviews/${id}/report`),

  pause: (id: string): Promise<void> =>
    apiClient.post(`/interviews/${id}/pause`),

  resume: (id: string): Promise<void> =>
    apiClient.post(`/interviews/${id}/resume`),
};
