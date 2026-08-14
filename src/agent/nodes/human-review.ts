/**
 * Node: human_review (terminal/interrupt)
 * Pauses the graph for human review when judge confidence is low or disagreement is high.
 */

import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";

export function humanReviewNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "human_review");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "human_review", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "human_review";

  state.session.state = "human_review";

  return {
    state,
    interrupt: {
      reason: "low_confidence_or_large_disagreement",
      payload: {
        score: state.aggregateResult?.score,
        confidence: state.aggregateResult?.confidence,
        spread: state.aggregateResult?.spread,
        judges: state.latestJudges?.map((j) => ({
          judge: j.judge,
          score: j.score,
          confidence: j.confidence,
          verdict: j.verdict,
        })),
      },
    },
  };
}
