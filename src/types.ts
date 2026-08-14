export type Experience = {
  id?: string;
  title: string;
  organization?: string;
  role?: string;
  period?: string;
  location?: string;
  section?: string;
  type: "project" | "internship" | "research" | "education" | "other";
  summary: string;
  bullets: string[];
  technologies: string[];
  claims: string[];
  highlights: string[];
  risks: string[];
  contributionLevel?: "mentioned" | "used" | "independently_owned" | "designed_and_delivered" | "production_owner";
  evidenceQuality?: number;
};

export type EvidenceClaim = {
  id: string;
  experienceId?: string;
  claim: string;
  evidence: { text: string; section?: string; start: number; end: number }[];
  confidence: number;
  status: "proven" | "unknown" | "not_proven" | "needs_verification";
};

export type ResumeProfile = {
  rawText: string;
  normalizedText?: string;
  name?: string;
  contact?: { email?: string; phone?: string; links: string[] };
  targetRole: string;
  summary: string;
  education: string[];
  recommendedRoles: { role: string; score: number; reasons: string[] }[];
  skills: string[];
  experiences: Experience[];
  strengths: string[];
  risks: string[];
  questions: string[];
  analysisMode?: "model" | "fallback";
  analysisVersion?: string;
  evidenceCitations?: { claim: string; quote: string; section?: string; experienceId?: string; start?: number; end?: number; confidence?: number; status?: EvidenceClaim["status"] }[];
  evidenceClaims?: EvidenceClaim[];
};

export type RoleSkill = {
  skill: string;
  why: string;
  askAngles: string[];
  weight?: number;
  evidenceExpectations?: string[];
};

export type RoleRubric = {
  targetRole: string;
  mustHave: RoleSkill[];
  niceToHave: string[];
  allowedTopics: string[];
  outOfScope: string[];
  coveragePlan: { skill: string; minRounds: number; maxRounds: number }[];
  version?: string;
};

export type RoundDiagnosis = {
  round: number;
  question: string;
  answerSummary: string;
  score: number;
  topic: string;
  mappedSkill: string;
  questionType: "project_followup" | "knowledge" | "scenario" | "behavioral";
  action: "clarify" | "advance" | "pivot";
  missingEvidence: string[];
  weakPoint?: string;
  strongPoint?: string;
  evidenceQuote?: string;
  relevance: number;
  reason?: string;
};

export type GrowthDimensionScores = {
  projectOwnership: number;
  technicalDepth: number;
  metricsLiteracy: number;
  tradeoffJudgment: number;
  systemThinking: number;
  communication: number;
};

export type GrowthWeakPoint = {
  title: string;
  skill: string;
  severity: "high" | "medium" | "low";
  evidenceQuote: string;
  whyItMatters: string;
  howToFix: string;
  drillQuestion: string;
  /** Evidence ledger items supporting this weak point diagnosis. */
  ledgerCitations?: Array<{
    evidenceId: string;
    turnId: string;
    claim: string;
    polarity: string;
    confidence: number;
  }>;
  /** Contradictions detected for this skill. */
  contradictions?: Array<{
    claim: string;
    severity: string;
    reason: string;
  }>;
  /** Skill belief snapshot at report time. */
  belief?: {
    meanLevel: number;
    uncertainty: number;
    evidenceCount: number;
    misconceptions: string[];
  };
};

export type GrowthStrength = {
  title: string;
  evidenceQuote: string;
  skill: string;
  /** Evidence ledger items supporting this strength. */
  ledgerCitations?: Array<{
    evidenceId: string;
    turnId: string;
    claim: string;
    polarity: string;
    confidence: number;
  }>;
  /** Skill belief snapshot at report time. */
  belief?: {
    meanLevel: number;
    uncertainty: number;
    evidenceCount: number;
    maxDifficultyPassed: number;
  };
};

export type GrowthPlanItem = {
  dayRange: string;
  task: string;
  linkedWeakPoint: string;
  successCriteria: string;
};

export type GrowthReport = {
  average: number;
  result: "PASS" | "BORDERLINE" | "FAIL";
  strengths: number;
  weaknesses: number;
  roleFitSummary: string;
  dimensionScores: GrowthDimensionScores;
  strengthItems: GrowthStrength[];
  weakPoints: GrowthWeakPoint[];
  next7DaysPlan: GrowthPlanItem[];
  coveredSkills: string[];
  uncoveredMustHave: string[];
  coachMode: "model" | "fallback" | "evidence_based";
  coverageRate?: number;
  skillScores?: Record<string, number>;
  scoreTrend?: number[];
  resumeClaimedButWeak?: string[];
  roleRequiredButMissing?: string[];
  pressureBreakpoints?: string[];
  projectPitchTemplate?: string;
  recommendedPressure?: number;
};

export type InterviewSession = {
  id: string;
  profile: ResumeProfile;
  pressure: number;
  interviewType?: "comprehensive" | "project_deep_dive" | "technical_fundamentals" | "system_design";
  phase: string;
  questionIndex: number;
  currentQuestion?: string;
  currentTopic?: string;
  currentQuestionType?: "project_followup" | "knowledge" | "scenario" | "behavioral";
  currentMappedSkill?: string;
  focusExperienceId?: string;
  focusExperienceTitle?: string;
  focusSkill?: string;
  focusRound?: number;
  focusEvidenceCovered?: string[];
  topicDepth: number;
  coveredTopics: string[];
  modelMode: "model" | "fallback";
  clarifyCount: number;
  lastClarifyTopic?: string;
  roleRubric?: RoleRubric;
  skillRoundCounts: Record<string, number>;
  topicRoundCounts: Record<string, number>;
  diagnoses: RoundDiagnosis[];
  maxDepthPerTopic: number;
  maxClarifyPerTopic: number;
  maxRoundsPerSkill: number;
  questionBudget: number;
  transcript: { role: "interviewer" | "candidate"; text: string; score?: number }[];
  scores: number[];
  result?: "PASS" | "BORDERLINE" | "FAIL";
  growthReport?: GrowthReport;
  state?: "created" | "opening" | "asking" | "evaluating" | "generating_next" | "paused" | "finishing" | "completed" | "failed" | "abandoned" | "human_review";
};

export type AnswerEvaluation = {
  answeredQuestion: string;
  answeredTopic: string;
  answeredSkill: string;
  score: number;
  feedback: string;
  relevance: number;
  evidenceCovered: string[];
  missingEvidence: string[];
  weakPoint?: string;
  strongPoint?: string;
  evidenceQuote?: string;
};

export type NextInterviewQuestion = {
  text: string;
  topic: string;
  mappedSkill: string;
  questionType: "project_followup" | "knowledge" | "scenario" | "behavioral";
  depth: number;
};

export type InterviewTurnOutcome = {
  evaluation: AnswerEvaluation;
  transition: { action: "clarify" | "advance" | "pivot" | "finish"; reason: string };
  nextQuestion?: NextInterviewQuestion;
  mode: "model" | "fallback";
  memoryRetrieved: number;
  needsHumanReview?: boolean;
};

export type JobRequirement = {
  label: string;
  category: "mustHave" | "niceToHave" | "responsibility" | "competency";
  evidenceExpectation: string;
  weight: number;
};

export type JobProfile = {
  id: string;
  title: string;
  jdRaw: string;
  level: string;
  mustHave: JobRequirement[];
  niceToHave: JobRequirement[];
  responsibilities: string[];
  competencies: string[];
  rubric: { technicalMatch: number; experienceRelevance: number; technicalDepth: number; evidenceQuality: number; engineeringMaturity: number; communicationClarity: number };
  createdAt: string;
  updatedAt: string;
  agentMode?: "model" | "fallback";
  agentInsights?: { summary?: string; hiddenSignals?: string[] };
  rubricStatus?: "draft" | "confirmed";
  rubricVersion?: number;
  depthExpectations?: { skill: string; expectedLevel: string; evidenceExpectation: string }[];
  interviewQuestions?: string[];
  publicId?: number;
  team?: string;
  city?: string;
  recruitmentType?: string;
  category?: string;
  tags?: string[];
  intro?: string;
  createdByRecruiter?: boolean;
};

export type ExperienceForensics = {
  title: string;
  background: string;
  responsibilities: string[];
  technicalActions: string[];
  outputs: string[];
  evidence: string[];
  technicalDepth: "L1" | "L2" | "L3" | "L4" | "L5";
  evidenceStrength: "strong" | "medium" | "weak";
  highlights: string[];
  risks: string[];
  verificationQuestions: string[];
};

export type RecruiterResume = {
  id: string;
  jobId: string;
  fileName: string;
  profile: ResumeProfile;
  analysis?: ResumeForensics;
  analysisStatus?: "queued" | "analyzing" | "completed" | "fallback" | "failed";
  analysisError?: string;
  createdAt: string;
  sourceResumeId?: string;
  candidateUserId?: string;
  candidateName?: string;
};

export type ResumeForensics = {
  overallScore: number;
  dimensionScores: { technicalMatch: number; experienceRelevance: number; technicalDepth: number; evidenceQuality: number; engineeringMaturity: number; communicationClarity: number };
  experienceAnalyses: ExperienceForensics[];
  matchedRequirements: { requirement: string; evidence: string[]; strength: "strong" | "medium" | "weak" }[];
  missingRequirements: string[];
  risks: string[];
  strengths: string[];
  interviewFocus: string[];
  recommendation: "strong_interview" | "interview" | "manual_review" | "hold";
  confidence: number;
  agentMode?: "model" | "fallback";
  evidenceCitations?: { claim?: string; quote?: string; section?: string; start?: number; end?: number; status?: "proven" | "unknown" | "not_proven" | "needs_verification" }[];
};

export type MatchResult = RecruiterResume & {
  analysis: ResumeForensics;
  rank: number;
};
