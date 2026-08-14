/**
 * Agent Graph State Types
 *
 * Defines the complete state model for the Interview Graph Runtime.
 * Aligned with OFFERPILOT_TECHNICAL_ARCHITECTURE.md §2.1 and PRD §14.3.
 */

import type { InterviewSession, InterviewTurnOutcome, RoleRubric } from "../types.js";
import type { EvidencePack } from "../knowledge-service.js";

// ---- Sub-types ----

export type SkillBelief = {
  skillId: string;
  meanLevel: number;       // 1..5
  uncertainty: number;     // 0..1
  evidenceCount: number;
  maxDifficultyPassed: number;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  misconceptions: string[];
  lastTestedAt?: string;
};

export type EvidenceLedgerItem = {
  id: string;
  turnId: string;
  skillId: string;
  claim: string;
  evidenceSpan?: string;
  evidenceType: "responsibility" | "mechanism" | "tradeoff" | "metric" | "validation" | "failure" | string;
  polarity: "supports" | "contradicts" | "unknown";
  source: "resume" | "answer" | "judge";
  confidence: number;
  citations: string[];
};

export type JudgeResult = {
  judge: "technical" | "evidence" | "consistency" | "communication" | "base";
  score: number;              // 0..10
  relevance: number;          // 0..1
  confidence: number;         // 0..1
  verdict: "supported" | "partial" | "incorrect" | "insufficient";
  evidenceCovered: string[];
  missingEvidence: string[];
  feedback: string;
  evidenceQuote?: string;
  weakPoint?: string;
  strongPoint?: string;
};

export type QuestionPlan = {
  targetSkillId: string;
  objective:
    | "establish_baseline"
    | "verify_ownership"
    | "verify_mechanism"
    | "test_tradeoff"
    | "test_metric"
    | "test_failure"
    | "resolve_contradiction";
  difficulty: 1 | 2 | 3 | 4 | 5;
  pressureStrategy: string;
  requiredEvidence: string[];
  retrievalQuery: string;
  reason: string;
};

export type InterviewQuestion = {
  text: string;
  topic: string;
  mappedSkill: string;
  questionType: "project_followup" | "knowledge" | "scenario" | "behavioral";
  depth: number;
  strategy: string;
  valid?: boolean;
  invalidReason?: string;
};

export type CandidateClaim = {
  claimId: string;
  skillIds: string[];
  claim: string;
  evidenceSpan?: string;
  status: "supported" | "partial" | "incorrect" | "unverified";
  confidence: number;
};

export type Contradiction = {
  id: string;
  claim: string;
  severity: "low" | "medium" | "high";
  reason: string;
  turnId?: string;
  conflictingTurnId?: string;
};

export type PressureState = {
  level: number;           // 1..5
  strategy: string;        // specificity | ownership | mechanism | tradeoff | metric | failure
  escalationCount: number;
};

export type FatigueState = {
  roundsCompleted: number;
  fatigueScore: number;    // 0..10
  lastBreakAt?: string;
};

export type InterviewBudget = {
  questionBudget: number;
  questionsUsed: number;
  timeBudgetSec?: number;
  timeUsedSec?: number;
};

export type InterviewThread = {
  focusSkill: string;
  focusExperienceId?: string;
  focusExperienceTitle?: string;
  requiredEvidence: string[];
  coveredEvidence: string[];
  depthLevel: number;
  turnCount: number;
};

export type CandidateEvidenceGraph = {
  profileSummary: string;
  targetRole: string;
  skills: string[];
  experiences: Array<{
    id?: string;
    title: string;
    technologies: string[];
    claims: string[];
  }>;
};

export type TraceContext = {
  traceId: string;
  graphVersion: string;
  kbVersion: string;
  currentNode: string;
  nodeHistory: Array<{
    node: string;
    enteredAt: string;
    exitedAt?: string;
    durationMs?: number;
  }>;
  retrievalTrace: any[];
  modelCalls: number;
  tokensUsed: number;
  latencyMs: number;
  nodeMetrics: Record<string, { calls: number; totalMs: number; lastMs: number }>;
  modelRuns?: Array<{ task: string; model: string; latencyMs: number; inputTokens: number; outputTokens: number; requestId?: string }>;
};

export type JudgeKind = "base" | "technical" | "evidence" | "consistency" | "communication";

export type NextAction =
  | "retrieve"
  | "ask"
  | "clarify"
  | "challenge"
  | "change_skill"
  | "finish"
  | "human_review"
  | "rejudge"
  | "clarify_boundary"
  | "resolve_contradiction"
  | "followup"
  | "select_next_skill";

// ---- Main Graph State ----

export type InterviewGraphState = {
  session: InterviewSession;
  ownerId: string;

  // Candidate model
  candidate: CandidateEvidenceGraph;
  rubric: RoleRubric;
  transcript: Array<{ role: "interviewer" | "candidate"; text: string; score?: number }>;

  // Assessment model
  abilityBeliefs: Record<string, SkillBelief>;
  evidenceLedger: EvidenceLedgerItem[];
  contradictions: Contradiction[];

  // Current thread
  currentThread: InterviewThread;
  /** Active interview subgraph and step selected by the runtime. */
  subgraphName: string;
  subgraphStep: number;

  // Per-turn working data
  retrieval?: EvidencePack;
  questionPlan?: QuestionPlan;
  pendingQuestion?: InterviewQuestion;
  latestAnswer?: string;
  latestClaims?: CandidateClaim[];
  latestJudges?: JudgeResult[];
  aggregateResult?: {
    score: number;
    confidence: number;
    spread: number;
    needsHumanReview: boolean;
  };

  // Pressure & fatigue
  pressureState: PressureState;
  fatigueState: FatigueState;
  budget: InterviewBudget;

  // Routing
  nextAction: NextAction;
  rejudgeAttempts: number;

  /** Number of repair attempts for the current pending question. */
  questionGuardAttempts: number;
  /** Hard cap prevents a malformed/duplicate question from looping forever. */
  maxQuestionGuardAttempts: number;

  // Trace
  trace: TraceContext;
};

// ---- Node Result ----

export type GraphNodeResult<S = InterviewGraphState> = {
  state: S;
  next?: string;
  interrupt?: { reason: string; payload?: unknown };
};

export type GraphNode<S = InterviewGraphState> = (state: S) => Promise<GraphNodeResult<S>> | GraphNodeResult<S>;

// ---- Initialization Helper ----

export function buildInitialGraphState(
  session: InterviewSession,
  ownerId: string,
): InterviewGraphState {
  const profile = session.profile;
  const focus = profile.experiences.find((x) => x.highlights?.length) || profile.experiences[0];

  return {
    session,
    ownerId,
    candidate: {
      profileSummary: profile.summary || "",
      targetRole: profile.targetRole,
      skills: profile.skills || [],
      experiences: profile.experiences.map((e) => ({
        id: e.id,
        title: e.title,
        technologies: e.technologies || [],
        claims: (e.claims || []) as string[],
      })),
    },
    rubric: session.roleRubric || {
      targetRole: profile.targetRole,
      version: "initial",
      mustHave: [],
      niceToHave: [],
      allowedTopics: [],
      outOfScope: [],
      coveragePlan: [],
    },
    transcript: session.transcript || [],
    abilityBeliefs: {},
    evidenceLedger: [],
    contradictions: [],
    currentThread: {
      focusSkill: "",
      focusExperienceId: focus?.id,
      focusExperienceTitle: focus?.title,
      requiredEvidence: [],
      coveredEvidence: [],
      depthLevel: 0,
      turnCount: 0,
    },
    subgraphName: session.interviewType === "system_design" ? "system_design" : session.interviewType === "technical_fundamentals" ? "technical_fundamentals" : session.interviewType === "project_deep_dive" ? "project_deep_dive" : "project_deep_dive",
    subgraphStep: 0,
    pressureState: {
      level: session.pressure || 3,
      strategy: "specificity",
      escalationCount: 0,
    },
    fatigueState: {
      roundsCompleted: session.questionIndex || 0,
      fatigueScore: 0,
    },
    budget: {
      questionBudget: session.questionBudget || 10,
      questionsUsed: session.questionIndex || 0,
    },
    nextAction: "retrieve",
    rejudgeAttempts: 0,
    questionGuardAttempts: 0,
    maxQuestionGuardAttempts: 3,
    trace: {
      traceId: crypto.randomUUID(),
      graphVersion: "offerpilot-interview-graph-v1",
      kbVersion: "local-kb-2026-08-12",
      currentNode: "load_context",
      nodeHistory: [],
      retrievalTrace: [],
      modelCalls: 0,
      tokensUsed: 0,
      latencyMs: 0,
      nodeMetrics: {},
    },
  };
}
