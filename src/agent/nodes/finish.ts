/**
 * Node: finish (terminal)
 * Terminal node that marks the interview as completed.
 */

import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";

export function finishNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "finish");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "finish", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "finish";

  state.session.state = "completed";
  state.session.phase = "总结";

  // No next node — terminal
  return { state };
}
