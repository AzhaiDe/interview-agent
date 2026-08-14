/**
 * Graph Edge Routing Logic
 *
 * Centralized conditional routing for the Interview Graph.
 * Aligned with OFFERPILOT_TECHNICAL_ARCHITECTURE.md §2.3.
 */

import type { InterviewGraphState, NextAction } from "./graph-state.js";

/**
 * Route the next action based on current graph state.
 * Priority order (highest to lowest):
 * 1. Human review required
 * 2. Budget exhausted
 * 3. Low confidence → rejudge
 * 4. Technical incorrect → clarify boundary
 * 5. High contradiction → resolve
 * 6. Missing evidence → followup
 * 7. Default → select next skill
 */
export function routeNextAction(state: InterviewGraphState): NextAction {
  // 1. Human review required
  if (state.session.state === "human_review" || state.aggregateResult?.needsHumanReview) {
    return "human_review";
  }

  // 2. Budget exhausted
  if (state.budget.questionsUsed >= state.budget.questionBudget) {
    return "finish";
  }

  // 3. Low confidence judges → rejudge with stronger model
  if (state.latestJudges?.some((j) => j.confidence < 0.55)) {
    return "rejudge";
  }

  // 4. Technical incorrect → clarify boundary
  if (state.latestJudges?.some((j) => j.judge === "technical" && j.verdict === "incorrect")) {
    return "clarify_boundary";
  }

  // 5. High severity contradiction → resolve
  if (state.contradictions.some((c) => c.severity === "high")) {
    return "resolve_contradiction";
  }

  // 6. Missing evidence in current thread → followup
  if (
    state.currentThread.requiredEvidence.length > 0 &&
    state.currentThread.coveredEvidence.length < state.currentThread.requiredEvidence.length
  ) {
    return "followup";
  }

  // 7. Default → select next skill
  return "select_next_skill";
}

/**
 * Map NextAction to the appropriate graph node.
 */
export function actionToNode(action: NextAction): string {
  switch (action) {
    case "human_review":
      return "human_review";
    case "finish":
      return "finish";
    case "rejudge":
      return "parallel_judge"; // Re-run judges with stronger model
    case "clarify_boundary":
    case "resolve_contradiction":
    case "followup":
      return "retrieve_evidence_pack"; // Retrieve specific evidence for follow-up
    case "select_next_skill":
    case "retrieve":
    case "ask":
    case "clarify":
    case "challenge":
    case "change_skill":
    default:
      return "select_target_skill";
  }
}

/**
 * Determine if the graph should continue or terminate.
 */
export function shouldTerminate(state: InterviewGraphState): boolean {
  return (
    state.budget.questionsUsed >= state.budget.questionBudget ||
    state.session.state === "completed" ||
    state.session.state === "abandoned"
  );
}
