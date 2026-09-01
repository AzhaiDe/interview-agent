import type { InterviewSession, ResumeProfile, GrowthReport } from "./types.js";

export type InterviewEngineStartInput = {
  ownerId: string;
  profile: ResumeProfile;
  pressure: number;
  interviewType: NonNullable<InterviewSession["interviewType"]>;
  targetRole: string;
};
export type InterviewEngineAnswerInput = { ownerId: string; sessionId: string; answer: string; idempotencyKey?: string };
export type InterviewEngineReviewInput = { ownerId: string; sessionId: string; decision: "approve" | "reject"; note?: string };
export type InterviewEngineResult = {
  session: InterviewSession;
  question?: string;
  score?: number;
  feedback?: string;
  needsHumanReview?: boolean;
  interrupt?: { kind: "candidate_answer" | "human_review"; payload: unknown };
  report?: GrowthReport;
  graph: Record<string, unknown>;
  [key: string]: unknown;
};
export interface InterviewEngine {
  start(input: InterviewEngineStartInput): Promise<InterviewEngineResult>;
  answer(input: InterviewEngineAnswerInput): Promise<InterviewEngineResult>;
  review(input: InterviewEngineReviewInput): Promise<InterviewEngineResult>;
  finish(ownerId: string, sessionId: string): Promise<InterviewEngineResult>;
}
