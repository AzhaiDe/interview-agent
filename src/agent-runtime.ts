/**
 * Agent Runtime — Backward-compatible public API.
 *
 * The internal implementation now uses the full Interview Graph Runtime
 * (src/agent/) with 18 nodes, conditional edges, subgraphs, checkpoints,
 * and time travel. The public API surface is unchanged.
 *
 * Exported functions:
 *   - createGraphSession
 *   - createInterviewOpening
 *   - evaluateInterviewAnswer
 *   - createGrowthReport
 *   - aggregateJudges
 *   - interviewUtility
 *   - sessionCritic
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { modelGateway } from "./model-gateway.js";
import { retrieveEvidencePack, type EvidencePack } from "./knowledge-service.js";
import { graphManifest } from "./agent-graph.js";
import { omniMemory } from "./omnimemory.js";
import { opaqueDeviceNo } from "./pii.js";
import { verifyClaims } from "./technical-verifier.js";
import { ExecutableGraph, type GraphCheckpoint } from "./graph-runtime.js";
import { interviewGraph, interviewGraphManifest, getSubGraph } from "./agent/interview-graph.js";
import { buildInitialGraphState, type InterviewGraphState, type JudgeResult } from "./agent/graph-state.js";
import { routeNextAction } from "./agent/edges.js";
import { aggregateJudges as graphAggregateJudges } from "./agent/nodes/aggregate-judges.js";
import { interviewUtility as graphInterviewUtility } from "./agent/nodes/select-target-skill.js";
import { extractEvidence } from "./agent/nodes/extract-claims.js";
import type { GrowthReport, InterviewSession, InterviewTurnOutcome, ResumeProfile, RoleRubric } from "./types.js";
import { database } from "./database.js";

// ---- Re-exports for backward compatibility ----

export type JudgeKind = "base" | "technical" | "evidence" | "consistency" | "communication";
export type JudgeAggregate = {
  score: number;
  confidence: number;
  spread: number;
  weights: Record<JudgeKind, number>;
  needsHumanReview: boolean;
};

export { aggregateJudges } from "./agent/nodes/aggregate-judges.js";
export { interviewUtility } from "./agent/nodes/select-target-skill.js";

/** Attach the durable graph state without exposing it in the public session JSON. */
export function attachGraphState(session: InterviewSession, state: InterviewGraphState) {
  Object.defineProperty(session, "_graphState", {
    value: state,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return session;
}

export function graphStateOf(session: InterviewSession): InterviewGraphState | undefined {
  return (session as any)._graphState as InterviewGraphState | undefined;
}

/**
 * Backward-compatible sessionCritic wrapper.
 * Evaluates whether the interview should finish, change skill, or continue.
 */
export function sessionCritic(session: InterviewSession, missingEvidence: string[] = []) {
  const state = runtime(session);
  const covered = Object.values(state.beliefs).filter((b) => b.evidenceCount > 0).length;
  const required = session.roleRubric?.mustHave.length || 1;
  const budgetExhausted = session.questionIndex >= session.questionBudget;
  const fatigue = state.pressure.fatigue >= Math.max(6, session.questionBudget - 2);
  const severeMissing = missingEvidence.includes("职责边界") || missingEvidence.includes("实现机制");
  return {
    budgetExhausted,
    fatigue,
    coverageRate: covered / required,
    severeMissing,
    shouldFinish: budgetExhausted || fatigue,
    reason: budgetExhausted ? "达到题量预算" : fatigue ? "疲劳度达到保护阈值" : severeMissing ? "关键证据仍缺失，继续当前线程" : "继续选择信息增益最高的能力",
  };
}

// ---- Legacy types (kept for external consumers) ----

type KbRow = { id: string; entity_type: string; role_ids: string[]; status?: string; judge_status?: string; source_ids: string[]; content: Record<string, any>; tags?: string[] };
type KbSource = { id: string; platform: string; source_kind: string; status: string; title: string; url: string; role_ids: string[] };
type SkillBelief = { skillId: string; meanLevel: number; uncertainty: number; evidenceCount: number; maxDifficultyPassed: number; supportingEvidenceIds: string[]; contradictingEvidenceIds: string[]; misconceptions: string[]; lastTestedAt?: string };
type EvidenceLedgerItem = { id: string; turnId: string; skillId: string; claim: string; evidenceSpan?: string; evidenceType: string; polarity: "supports" | "contradicts" | "unknown"; source: "resume" | "answer" | "judge"; confidence: number; citations: string[] };
type RuntimeState = { graphVersion: string; kbVersion: string; node: string; traceId: string; beliefs: Record<string, SkillBelief>; evidenceLedger: EvidenceLedgerItem[]; contradictions: { id: string; claim: string; severity: "low" | "medium" | "high"; reason: string }[]; judgeRuns: any[]; retrievalTrace: any[]; pressure: { level: number; strategy: string; fatigue: number }; turnId?: string; lastEvidencePack?: EvidencePack };

// ---- Internal helpers ----

const root = path.resolve(process.cwd(), "knowledge-base");
const readJsonl = (name: string): KbRow[] => {
  const candidates = [path.join(root, "judged", `${name}.jsonl`), path.join(root, "generated", `${name}.jsonl`)];
  const file = candidates.find((item) => fs.existsSync(item));
  if (!file) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
};
const kb: Record<string, KbRow[]> = {
  competencies: readJsonl("competencies"), concepts: readJsonl("concepts"), questions: readJsonl("questions"), followups: readJsonl("followups"), misconceptions: readJsonl("misconceptions"), failure_modes: readJsonl("failure_modes"), scoring_anchors: readJsonl("scoring_anchors"),
};
const roles = [
  { id: "ROLE_BACKEND_JAVA_GO", match: /java|go|后端|服务端|基础架构|backend/i },
  { id: "ROLE_AI_RAG_LLM", match: /ai|rag|llm|agent|大模型|算法|模型/i },
  { id: "ROLE_FRONTEND", match: /前端|frontend|react|vue|web/i },
];
const evidenceTypes = ["职责边界", "实现机制", "选型权衡", "指标与口径", "验证与对照", "异常与边界"] as const;
function roleId(targetRole: string) { return roles.find((item) => item.match.test(targetRole))?.id || "ROLE_BACKEND_JAVA_GO"; }

const judgeSchema = z.object({
  score: z.number().min(0).max(10),
  relevance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidenceCovered: z.array(z.string()).max(6),
  missingEvidence: z.array(z.string()).max(6),
  verdict: z.enum(["supported", "partial", "incorrect", "insufficient"]),
  feedback: z.string().min(1).max(800),
  evidenceQuote: z.string().max(160).optional(),
  weakPoint: z.string().max(500).optional(),
  strongPoint: z.string().max(500).optional(),
});

function runtime(session: InterviewSession): RuntimeState {
  const current = (session as any).agentRuntime as RuntimeState | undefined;
  if (current) return current;
  const state: RuntimeState = {
    graphVersion: graphManifest().version,
    kbVersion: "local-kb-2026-08-12",
    node: "created",
    traceId: crypto.randomUUID(),
    beliefs: {},
    evidenceLedger: [],
    contradictions: [],
    judgeRuns: [],
    retrievalTrace: [],
    pressure: { level: session.pressure, strategy: "specificity", fatigue: 0 },
  };
  (session as any).agentRuntime = state;
  return state;
}

// ---- Public API ----

/**
 * Create a new interview session with initial graph state.
 */
export function createGraphSession(
  profile: ResumeProfile,
  pressure: number,
  interviewType: InterviewSession["interviewType"] = "comprehensive"
): InterviewSession {
  const focus = profile.experiences.find((x) => x.highlights.length) || profile.experiences[0];
  const session: InterviewSession = {
    id: crypto.randomUUID(),
    profile,
    pressure,
    interviewType,
    phase: "岗位建模",
    questionIndex: 0,
    focusExperienceId: focus?.id,
    focusExperienceTitle: focus?.title,
    focusRound: 0,
    focusEvidenceCovered: [],
    topicDepth: 0,
    coveredTopics: [],
    modelMode: "fallback",
    clarifyCount: 0,
    roleRubric: undefined as any,
    skillRoundCounts: {},
    topicRoundCounts: {},
    diagnoses: [],
    maxDepthPerTopic: pressure >= 4 ? 4 : 3,
    maxClarifyPerTopic: 3,
    maxRoundsPerSkill: 4,
    questionBudget: 10,
    transcript: [],
    scores: [],
    state: "created",
  };

  // Initialize the graph state (also sets up agentRuntime for backward compat)
  const graphState = buildInitialGraphState(session, "local-user");
  attachGraphState(session, graphState);
  // Initialize rubric from KB (backward compat)
  const rt = runtime(session);
  const role = roleId(session.profile.targetRole);
  const competencies = kb.competencies
    .filter((row: KbRow) => row.role_ids?.includes(role))
    .slice(0, 30)
    .map((x: KbRow) => x.content.name || x.tags?.[0])
    .filter(Boolean) as string[];
  const skills = [...new Set([...competencies.slice(0, 12), ...session.profile.skills.slice(0, 8)])].slice(0, 18);
  session.roleRubric = {
    targetRole: session.profile.targetRole,
    version: "kb-rubric-v1",
    mustHave: skills.map((skill) => ({
      skill,
      why: "岗位能力图要求",
      askAngles: ["机制", "权衡", "指标", "故障"],
      weight: 1,
      evidenceExpectations: [...evidenceTypes],
    })),
    niceToHave: competencies.slice(12),
    allowedTopics: competencies,
    outOfScope: ["敏感个人属性", "与岗位无关的人格判断"],
    coveragePlan: skills.map((skill) => ({ skill, minRounds: 1, maxRounds: 3 })),
  };
  for (const item of session.roleRubric.mustHave) {
    rt.beliefs[item.skill] ||= {
      skillId: item.skill, meanLevel: 2.5, uncertainty: 1, evidenceCount: 0,
      maxDifficultyPassed: 0, supportingEvidenceIds: [], contradictingEvidenceIds: [], misconceptions: [],
    };
  }

  return session;
}

/**
 * Create the opening question using the full Graph Runtime.
 */
export async function createInterviewOpening(ownerId: string, session: InterviewSession) {
  // Build initial graph state
  const graphState = buildInitialGraphState(session, ownerId);
  attachGraphState(session, graphState);
  const result = await new ExecutableGraph<InterviewGraphState>(interviewGraph, (checkpoint) => {
    // Unit callers may invoke opening before the HTTP handler's initial save;
    // upsert the parent row before the FK-backed node checkpoint.
    database.ensureOwner(ownerId); database.saveInterview(ownerId, checkpoint.state.session);
    database.saveGraphCheckpoint(ownerId, checkpoint.state.session, checkpoint.state);
  }).run(graphState);
  const state = result.state;

  // Sync back to session
  syncGraphStateToSession(state, session);

  const question = state.pendingQuestion!;
  return {
    ...question,
    question: question.text,
    mode: "fallback" as const,
    memoryRetrieved: (state.retrieval?.questions?.length || 0) + (state.retrieval?.facts?.length || 0) + (state.retrieval?.personalMemory?.length || 0),
  };
}

/**
 * Evaluate a candidate's answer using the full Graph Runtime.
 */
export async function evaluateInterviewAnswer(
  ownerId: string,
  session: InterviewSession,
  answer: string
): Promise<InterviewTurnOutcome> {
  // Restore graph state from session
  let graphState = graphStateOf(session);
  if (!graphState) {
    graphState = buildInitialGraphState(session, ownerId);
  }

  // Patch with the answer
  (graphState as any)._answerSkill = graphState.currentThread.focusSkill;
  graphState.latestAnswer = answer;
  graphState.ownerId = ownerId;

  // Resume the same graph definition from the answer-processing node. The
  // graph definition and edge contract are no longer duplicated here.
  const result = await new ExecutableGraph<InterviewGraphState>(interviewGraph, (checkpoint) => {
    database.ensureOwner(ownerId); database.saveInterview(ownerId, checkpoint.state.session);
    database.saveGraphCheckpoint(ownerId, checkpoint.state.session, checkpoint.state);
  }).run(graphState, { node: "extract_claims", maxSteps: 100 });
  const state = result.state;

  // Sync back to session
  syncGraphStateToSession(state, session);
  attachGraphState(session, state);

  // Build the turn outcome
  return buildTurnOutcome(state, session, answer);
}

/**
 * Create a growth report at the end of the interview.
 */
export async function createGrowthReport(session: InterviewSession): Promise<GrowthReport> {
  const state = runtime(session);
  const scores = session.scores;
  const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const weak = session.diagnoses.filter((x) => x.score < 6).slice(0, 6);
  const strengths = session.diagnoses.filter((x) => x.score >= 7).slice(0, 5);
  const beliefs = Object.values(state.beliefs);
  const covered = beliefs.filter((x) => x.evidenceCount > 0).map((x) => x.skillId);
  const ledger = state.evidenceLedger || [];
  const contradictions = state.contradictions || [];

  // Helper: find ledger items for a skill
  const ledgerFor = (skill: string) =>
    ledger.filter((item) => item.skillId === skill);

  // Helper: find contradictions for a skill
  const contradictionsFor = (skill: string) =>
    contradictions.filter((c) => c.claim.includes(skill) || c.reason.includes(skill));

  // Helper: find belief for a skill
  const beliefFor = (skill: string) =>
    state.beliefs[skill];

  // Build strength items with ledger citations
  const strengthItems = strengths.map((x) => {
    const skill = x.mappedSkill;
    const skillLedger = ledgerFor(skill).filter((l) => l.polarity === "supports");
    const belief = beliefFor(skill);
    return {
      title: x.strongPoint || "回答证据较完整",
      evidenceQuote: x.evidenceQuote || x.answerSummary.slice(0, 80),
      skill,
      ledgerCitations: skillLedger.slice(0, 5).map((l) => ({
        evidenceId: l.id,
        turnId: l.turnId,
        claim: l.claim,
        polarity: l.polarity,
        confidence: l.confidence,
      })),
      belief: belief
        ? {
            meanLevel: belief.meanLevel,
            uncertainty: belief.uncertainty,
            evidenceCount: belief.evidenceCount,
            maxDifficultyPassed: belief.maxDifficultyPassed,
          }
        : undefined,
    };
  });

  // Build weak points with ledger citations and contradictions
  const weakPoints = weak.map((x) => {
    const skill = x.mappedSkill;
    const skillLedger = ledgerFor(skill);
    const skillContradictions = contradictionsFor(skill);
    const belief = beliefFor(skill);
    const misconceptions = belief?.misconceptions || [];
    const contradictsEvidence = skillLedger.filter((l) => l.polarity === "contradicts");

    // Generate specific whyItMatters based on evidence
    let whyItMatters = "该能力尚未形成可验证证据";
    if (contradictsEvidence.length > 0) {
      whyItMatters = `存在${contradictsEvidence.length}条反面证据，说明理解可能有误`;
    } else if (skillContradictions.length > 0) {
      whyItMatters = `回答中存在前后矛盾的说法，需要澄清`;
    } else if (misconceptions.length > 0) {
      whyItMatters = `存在技术误区：${misconceptions.slice(0, 2).join("、")}`;
    } else if (skillLedger.length === 0) {
      whyItMatters = "尚未提供任何可验证的证据";
    }

    // Generate specific howToFix based on what's missing
    const missingTypes = ["职责边界", "实现机制", "指标与口径", "验证与对照", "异常与边界"].filter(
      (type) => !skillLedger.some((l) => l.evidenceType === type)
    );
    const howToFix = missingTypes.length > 0
      ? `针对${skill}补充${missingTypes.slice(0, 3).join("、")}的证据`
      : `针对${skill}重新组织回答，确保每个声明都有可验证的证据支持`;

    return {
      title: x.weakPoint || "证据不足",
      skill,
      severity: x.score < 4 ? "high" as const : "medium" as const,
      evidenceQuote: x.evidenceQuote || x.answerSummary.slice(0, 80),
      whyItMatters,
      howToFix,
      drillQuestion: `请重新回答${skill}，并给出一个可验证的验证方案。`,
      ledgerCitations: skillLedger.slice(0, 5).map((l) => ({
        evidenceId: l.id,
        turnId: l.turnId,
        claim: l.claim,
        polarity: l.polarity,
        confidence: l.confidence,
      })),
      contradictions: skillContradictions.slice(0, 3).map((c) => ({
        claim: c.claim,
        severity: c.severity,
        reason: c.reason,
      })),
      belief: belief
        ? {
            meanLevel: belief.meanLevel,
            uncertainty: belief.uncertainty,
            evidenceCount: belief.evidenceCount,
            misconceptions,
          }
        : undefined,
    };
  });

  // Build 7-day plan
  const next7DaysPlan = weak.slice(0, 5).map((x, i) => ({
    dayRange: `第${i + 1}天`,
    task: `复盘${x.mappedSkill}并完成一次故障/指标练习`,
    linkedWeakPoint: x.weakPoint || "证据不足",
    successCriteria: "能在限定时间内给出机制、指标、边界和验证",
  }));

  return {
    average: Number(average.toFixed(1)),
    result: average >= 7 ? "PASS" : average >= 5.5 ? "BORDERLINE" : "FAIL",
    strengths: strengths.length,
    weaknesses: weak.length,
    roleFitSummary: `本场完成${session.questionIndex}轮 Graph 面试，平均分 ${average.toFixed(1)}。报告基于${ledger.length}条证据账本记录和${beliefs.length}项能力信念生成。`,
    dimensionScores: {
      projectOwnership: Math.round(average * 10),
      technicalDepth: Math.round(average * 10),
      metricsLiteracy: Math.round(average * 9),
      tradeoffJudgment: Math.round(average * 9),
      systemThinking: Math.round(average * 9),
      communication: Math.round(average * 10),
    },
    strengthItems,
    weakPoints,
    next7DaysPlan,
    coveredSkills: covered,
    uncoveredMustHave: session.roleRubric!.mustHave.map((x) => x.skill).filter((x) => !covered.includes(x)),
    coachMode: "evidence_based",
    skillScores: Object.fromEntries(beliefs.map((x) => [x.skillId, Number((x.meanLevel * 2).toFixed(1))])),
    coverageRate: session.roleRubric!.mustHave.length ? covered.length / session.roleRubric!.mustHave.length : 0,
    scoreTrend: scores,
    recommendedPressure: Math.min(5, session.pressure + (average >= 7 ? 1 : 0)),
  } as GrowthReport;
}

// ---- Internal sync helpers ----

function syncGraphStateToSession(graphState: InterviewGraphState, session: InterviewSession) {
  const rt = runtime(session);

  // Sync beliefs
  rt.beliefs = { ...graphState.abilityBeliefs };
  rt.evidenceLedger = [...graphState.evidenceLedger];
  rt.contradictions = [...graphState.contradictions];
  rt.pressure = {
    level: graphState.pressureState.level,
    strategy: graphState.pressureState.strategy,
    fatigue: graphState.fatigueState.fatigueScore,
  };
  rt.node = graphState.trace.currentNode;
  rt.traceId = graphState.trace.traceId;
  if (graphState.retrieval) {
    rt.lastEvidencePack = graphState.retrieval;
  }

  // The graph owns the durable transcript during execution. Keep the public
  // session projection in lockstep so a JSON/SQLite round-trip resumes with
  // the same question and conversation history.
  session.transcript = [...graphState.session.transcript];
  session.currentQuestion = graphState.session.currentQuestion || graphState.pendingQuestion?.text || session.currentQuestion;
  session.currentTopic = graphState.session.currentTopic || graphState.pendingQuestion?.topic || session.currentTopic;
  session.currentMappedSkill = graphState.session.currentMappedSkill || graphState.pendingQuestion?.mappedSkill || session.currentMappedSkill;
  session.currentQuestionType = graphState.session.currentQuestionType || graphState.pendingQuestion?.questionType || session.currentQuestionType;
  session.topicDepth = graphState.session.topicDepth || graphState.pendingQuestion?.depth || session.topicDepth;
  session.questionIndex = graphState.session.questionIndex;
  session.scores = [...graphState.session.scores];
  session.diagnoses = [...graphState.session.diagnoses];
  session.skillRoundCounts = { ...graphState.session.skillRoundCounts };
  session.topicRoundCounts = { ...graphState.session.topicRoundCounts };
  session.clarifyCount = graphState.session.clarifyCount;
  session.lastClarifyTopic = graphState.session.lastClarifyTopic;
  session.result = graphState.session.result;
  session.growthReport = graphState.session.growthReport;

  // Sync session fields
  if (graphState.rubric.version !== "initial") {
    session.roleRubric = graphState.rubric;
  }
  session.state = graphState.session.state;
  session.phase = graphState.session.phase;
  attachGraphState(session, graphState);
}

function buildTurnOutcome(
  state: InterviewGraphState,
  session: InterviewSession,
  answer: string
): InterviewTurnOutcome {
  const judges = state.latestJudges || [];
  const aggregate = state.aggregateResult || { score: 0, confidence: 0, spread: 0, needsHumanReview: false };
  const mergedCovered = [...new Set(judges.flatMap((j) => j.evidenceCovered))];
  const evidence = (state as any)._extractedEvidence;
  const mergedMissing = evidence?.missing || [];
  const skill = (state as any)._answerSkill || state.latestClaims?.[0]?.skillIds?.[0] || state.currentThread.focusSkill;

  // Determine action
  const action = session.questionIndex + 1 >= session.questionBudget
    ? "finish"
    : evidence?.injection || evidence?.offTopic
    ? "pivot"
    : aggregate.score >= 6.5 && mergedMissing.length <= 2
    ? "advance"
    : "clarify";

  // Check for next question
  const nextQuestion = state.pendingQuestion && state.session.state === "asking"
    ? {
        text: state.pendingQuestion.text,
        topic: state.pendingQuestion.topic,
        mappedSkill: state.pendingQuestion.mappedSkill,
        questionType: state.pendingQuestion.questionType,
        depth: state.pendingQuestion.depth,
      }
    : undefined;

  // Update session mode
  session.modelMode = judges.some((j) => j.judge !== "base") ? "model" : "fallback";

  const baseJudge = judges.find((j) => j.judge === "base");

  return {
    evaluation: {
      answeredQuestion: session.diagnoses.at(-1)?.question || "",
      answeredTopic: session.diagnoses.at(-1)?.topic || skill,
      answeredSkill: skill,
      score: aggregate.score,
      feedback: baseJudge?.feedback || "",
      relevance: baseJudge?.relevance || 0.9,
      evidenceCovered: mergedCovered,
      missingEvidence: mergedMissing,
      weakPoint: baseJudge?.weakPoint,
      strongPoint: baseJudge?.strongPoint,
      evidenceQuote: baseJudge?.evidenceQuote,
    },
    transition: {
      action: action as any,
      reason: `Graph route=${action}; evidence=${mergedCovered.join(",") || "none"}`,
    },
    nextQuestion,
    mode: session.modelMode,
    memoryRetrieved: state.retrieval?.personalMemory?.length || 0,
    needsHumanReview: aggregate.needsHumanReview,
  };
}
