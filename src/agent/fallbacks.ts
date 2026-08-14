/**
 * Fallback Strategies
 *
 * Implements graceful degradation per architecture §8.2:
 *
 * 1. Composer timeout → QuestionArchetype template
 * 2. Judge timeout → single judge + low_confidence, no strong conclusions
 * 3. Retrieval unavailable → cached verified knowledge only
 * 4. OmniMemory unavailable → local verified knowledge (already handled)
 * 5. Local vector unavailable → lexical + graph neighbors (already handled)
 * 6. STT error → request text confirmation (out of scope)
 * 7. Graph interrupted → checkpoint recovery (already handled)
 * 8. Report model failure → deterministic report (already handled)
 *
 * Aligned with PRD §8 and architecture §8.2.
 */

import type { InterviewGraphState } from "./graph-state.js";

// ---- Degradation tracking ----

export type DegradationEvent = {
  nodeId: string;
  reason: string;
  fallbackUsed: string;
  timestamp: string;
  recoveredFrom?: string;
};

/**
 * Record a degradation event in the trace for observability.
 */
export function recordDegradation(
  state: InterviewGraphState,
  event: Omit<DegradationEvent, "timestamp">
): void {
  (state.trace as any).degradations ||= [];
  (state.trace as any).degradations.push({
    ...event,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get all degradation events from the trace.
 */
export function getDegradations(state: InterviewGraphState): DegradationEvent[] {
  return (state.trace as any).degradations || [];
}

// ---- 1. Composer fallback: QuestionArchetype templates ----

/**
 * Safe question templates per strategy.
 * Used when the composer model times out or fails.
 */
const questionTemplates: Record<string, string[]> = {
  ownership: [
    "请围绕「{project}」说明你独立完成的一项关键决策，以及你如何证明这部分由你完成。",
    "针对「{project}」，请只讲清楚你亲自负责的模块和一个关键改动。",
  ],
  specificity: [
    "请以「{project}」为背景，描述一个真实请求从输入到输出的完整链路。",
    "请沿着「{project}」描述一次请求的关键数据流：入口、处理、存储。",
  ],
  mechanism: [
    "请说明「{project}」中 {skill} 的底层工作原理和最容易出错的边界。",
    "针对「{project}」中的 {skill}，请解释核心调用经过哪些组件。",
  ],
  tradeoff: [
    "针对「{project}」中的 {skill}，当时比较过哪些替代方案？最终取舍依据是什么？",
    "请具体说明「{project}」中 {skill} 的一次技术取舍：约束、代价和收益。",
  ],
  metric: [
    "请给出「{project}」中 {skill} 的一个可复现指标：口径、基线和最终变化。",
    "你如何定义「{project}」中 {skill} 的指标？如何排除其他因素？",
  ],
  failure: [
    "如果「{project}」的核心依赖超时或数据规模扩大十倍，{skill} 最先在哪里失效？",
    "请针对「{project}」设计一个故障演练：核心依赖不可用时的降级和恢复步骤。",
  ],
};

/**
 * Generate a fallback question from templates.
 * Used when the composer model is unavailable.
 */
export function generateFallbackQuestion(
  state: InterviewGraphState,
  strategy?: string
): string {
  const s = strategy || state.pressureState.strategy || "specificity";
  const templates = questionTemplates[s] || questionTemplates.specificity;
  const variantIndex = state.questionGuardAttempts || 0;
  const template = templates[variantIndex % templates.length];

  const project =
    state.currentThread.focusExperienceTitle ||
    state.candidate.experiences[0]?.title ||
    "你简历中的这个项目";
  const skill = state.currentThread.focusSkill || "核心技能";

  return template.replace("{project}", project).replace("{skill}", skill);
}

// ---- 2. Judge fallback: single judge + low_confidence ----

/**
 * Build a low-confidence judge result when the model is unavailable.
 * Used when judge model times out or fails.
 */
export function buildLowConfidenceJudge(
  reason: string
): {
  score: number;
  relevance: number;
  confidence: number;
  verdict: "insufficient";
  evidenceCovered: string[];
  missingEvidence: string[];
  feedback: string;
} {
  return {
    score: 4,
    relevance: 0.5,
    confidence: 0.3,
    verdict: "insufficient" as const,
    evidenceCovered: [],
    missingEvidence: ["职责边界", "实现机制", "指标与口径", "验证与对照"],
    feedback: `[降级模式] ${reason}。本轮评价置信度较低，建议人工复核或重新评价。`,
  };
}

/**
 * Check if judge results should be marked as low confidence.
 * Returns true if any judge has confidence below threshold.
 */
export function shouldFlagLowConfidence(
  judges: Array<{ confidence: number }>,
  threshold = 0.55
): boolean {
  return judges.some((j) => j.confidence < threshold);
}

// ---- 3. Retrieval fallback: cached verified knowledge ----

/**
 * In-memory cache for verified knowledge facts.
 * Keyed by roleId + skill for fast lookup.
 */
const verifiedFactsCache = new Map<
  string,
  Array<{ entityId: string; statement: string; sourceIds: string[]; confidence: number }>
>();

/**
 * Cache verified facts for fallback retrieval.
 */
export function cacheVerifiedFacts(
  roleId: string,
  skill: string,
  facts: Array<{ entityId: string; statement: string; sourceIds: string[]; confidence: number }>
): void {
  const key = `${roleId}:${skill}`;
  verifiedFactsCache.set(key, facts.slice(0, 20));
}

/**
 * Get cached verified facts for fallback.
 */
export function getCachedVerifiedFacts(
  roleId: string,
  skill: string
): Array<{ entityId: string; statement: string; sourceIds: string[]; confidence: number }> {
  const key = `${roleId}:${skill}`;
  return verifiedFactsCache.get(key) || [];
}

/**
 * Check if cached facts are available.
 */
export function hasCachedFacts(roleId: string, skill: string): boolean {
  const key = `${roleId}:${skill}`;
  return verifiedFactsCache.has(key);
}

// ---- 8. Report fallback: deterministic report ----

/**
 * Build a deterministic fallback report when the model is unavailable.
 * This is already implemented in createGrowthReport (coachMode: "evidence_based"),
 * but we expose a flag for explicit fallback mode.
 */
export function isReportFallbackMode(
  state: InterviewGraphState
): boolean {
  const degradations = getDegradations(state);
  return degradations.some(
    (d) => d.nodeId === "report" || d.nodeId === "create_growth_report"
  );
}

// ---- Degradation summary for observability ----

/**
 * Build a summary of all degradations for the trace.
 */
export function degradationSummary(
  state: InterviewGraphState
): {
  totalDegradations: number;
  byNode: Record<string, number>;
  byReason: Record<string, number>;
} {
  const degradations = getDegradations(state);
  const byNode: Record<string, number> = {};
  const byReason: Record<string, number> = {};

  for (const d of degradations) {
    byNode[d.nodeId] = (byNode[d.nodeId] || 0) + 1;
    byReason[d.reason] = (byReason[d.reason] || 0) + 1;
  }

  return {
    totalDegradations: degradations.length,
    byNode,
    byReason,
  };
}
