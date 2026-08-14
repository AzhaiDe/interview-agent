/**
 * Node: aggregate_judges
 * Aggregates multi-judge results using weighted scoring.
 */

import type { InterviewGraphState, GraphNodeResult, JudgeKind } from "../graph-state.js";

export type JudgeAggregate = {
  score: number;
  confidence: number;
  spread: number;
  weights: Record<string, number>;
  needsHumanReview: boolean;
};

export function aggregateJudges(
  entries: Array<{ kind: string; result: { score: number; confidence: number; evidenceCovered: string[]; missingEvidence: string[] } }>
): JudgeAggregate {
  const configured: Record<string, number> = {
    base: 0.2, technical: 0.35, evidence: 0.2, consistency: 0.1, communication: 0.15,
  };
  const denominator = entries.reduce((sum, e) => sum + (configured[e.kind] || 0), 0) || 1;
  const weights = Object.fromEntries(
    Object.entries(configured).map(([kind, weight]) => [
      kind,
      entries.some((e) => e.kind === kind) ? Number((weight / denominator).toFixed(4)) : 0,
    ])
  );
  const score = Number(
    entries.reduce((sum, e) => sum + e.result.score * (weights[e.kind] || 0), 0).toFixed(1)
  );
  const confidence = Number(
    entries.reduce((sum, e) => sum + e.result.confidence * (weights[e.kind] || 0), 0).toFixed(2)
  );
  const scores = entries.map((e) => e.result.score);
  const spread = scores.length ? Math.max(...scores) - Math.min(...scores) : 10;
  return { score, confidence, spread, weights, needsHumanReview: spread >= 3 || confidence < 0.55 };
}

export function aggregateJudgesNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "aggregate_judges");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "aggregate_judges", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "aggregate_judges";

  const judges = state.latestJudges || [];
  const entries = judges.map((j) => ({
    kind: j.judge,
    result: {
      score: j.score,
      confidence: j.confidence,
      evidenceCovered: j.evidenceCovered,
      missingEvidence: j.missingEvidence,
    },
  }));

  const aggregate = aggregateJudges(entries);

  state.aggregateResult = {
    score: aggregate.score,
    confidence: aggregate.confidence,
    spread: aggregate.spread,
    needsHumanReview: aggregate.needsHumanReview,
  };

  // If needs human review, route to human_review node
  if (aggregate.needsHumanReview) {
    return { state, next: "human_review" };
  }

  return { state, next: "update_evidence_ledger" };
}
