/**
 * Node: update_pressure_state
 * Updates pressure strategy and fatigue state.
 */

import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";

export function updatePressureStateNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "update_pressure_state");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "update_pressure_state", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "update_pressure_state";

  const evidence = (state as any)._extractedEvidence;
  const missing = evidence?.missing || [];
  const level = state.pressureState.level;

  // Determine next pressure strategy based on missing evidence
  let strategy = state.pressureState.strategy;
  if (missing.includes("异常与边界") || level >= 4) strategy = "failure";
  else if (missing.includes("指标与口径")) strategy = "metric";
  else if (missing.includes("选型权衡")) strategy = "tradeoff";
  else if (missing.includes("职责边界")) strategy = "ownership";
  else strategy = level >= 3 ? "mechanism" : "specificity";

  state.pressureState.strategy = strategy;

  // Update fatigue
  state.fatigueState.roundsCompleted++;
  state.fatigueState.fatigueScore += 1;

  // Sync to session runtime for backward compatibility
  const runtime = (state.session as any).agentRuntime ||= {};
  runtime.pressure = {
    level: state.pressureState.level,
    strategy: state.pressureState.strategy,
    fatigue: state.fatigueState.fatigueScore,
  };

  return { state, next: "session_critic" };
}
