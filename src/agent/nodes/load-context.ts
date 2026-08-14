/**
 * Node: load_context
 * Loads resume, JD, historical ability state and initializes the graph.
 */

import crypto from "node:crypto";
import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";
import type { InterviewSession } from "../../types.js";

export function loadContextNode(state: InterviewGraphState): GraphNodeResult {
  // Initialize trace
  const traceEntry = {
    node: "load_context",
    enteredAt: new Date().toISOString(),
  };
  state.trace.nodeHistory.push(traceEntry);
  state.trace.currentNode = "load_context";

  // Initialize session state if needed
  if (!state.session.state || state.session.state === "created") {
    state.session.state = "opening";
  }

  // Sync beliefs from session if they exist in agentRuntime
  const runtime = (state.session as any).agentRuntime;
  if (runtime?.beliefs) {
    state.abilityBeliefs = { ...runtime.beliefs };
  }
  if (runtime?.evidenceLedger) {
    state.evidenceLedger = [...runtime.evidenceLedger];
  }
  if (runtime?.contradictions) {
    state.contradictions = [...runtime.contradictions];
  }
  if (runtime?.pressure) {
    state.pressureState.level = runtime.pressure.level;
    state.pressureState.strategy = runtime.pressure.strategy;
    state.fatigueState.fatigueScore = runtime.pressure.fatigue || 0;
  }

  return { state, next: "load_or_create_rubric" };
}
