/**
 * Time Travel: Checkpoint replay and fork.
 *
 * Supports replaying the graph from any checkpoint and forking
 * a new session from an existing checkpoint.
 */

import crypto from "node:crypto";
import type { InterviewGraphState } from "./graph-state.js";
import type { GraphCheckpoint } from "../graph-runtime.js";
import { ExecutableGraph } from "../graph-runtime.js";
import { interviewGraph } from "./interview-graph.js";

/**
 * Replay from a checkpoint: continue graph execution from a saved state.
 */
export async function replayFromCheckpoint(
  checkpoint: GraphCheckpoint<InterviewGraphState>,
  options?: {
    patch?: (state: InterviewGraphState) => InterviewGraphState;
    saveCheckpoint?: (checkpoint: GraphCheckpoint<InterviewGraphState>) => void;
  }
): Promise<{ state: InterviewGraphState; status: string; node: string }> {
  let state = checkpoint.state;
  if (options?.patch) state = options.patch(state);

  const graph = new ExecutableGraph<InterviewGraphState>(
    interviewGraph,
    options?.saveCheckpoint
  );

  const result = await graph.run(state, {
    node: checkpoint.node,
    traceId: checkpoint.traceId,
  });

  return {
    state: result.state,
    status: result.status,
    node: result.node,
  };
}

/**
 * Fork from a checkpoint: create a new session from an existing checkpoint.
 * Useful for A/B testing different paths or retrying from a saved state.
 */
export function forkFromCheckpoint(
  checkpoint: GraphCheckpoint<InterviewGraphState>,
  newSessionId?: string
): InterviewGraphState {
  const state = JSON.parse(JSON.stringify(checkpoint.state)) as InterviewGraphState;

  // Assign new session ID
  state.session.id = newSessionId || crypto.randomUUID();

  // New trace
  state.trace.traceId = crypto.randomUUID();
  state.trace.nodeHistory = [];

  // Reset transient state
  state.latestAnswer = undefined;
  state.latestJudges = undefined;
  state.latestClaims = undefined;
  state.aggregateResult = undefined;
  state.pendingQuestion = undefined;

  return state;
}

/**
 * Get node history from a checkpoint's state trace.
 */
export function getNodeHistory(state: InterviewGraphState) {
  return state.trace.nodeHistory.map((entry) => ({
    node: entry.node,
    enteredAt: entry.enteredAt,
    exitedAt: entry.exitedAt,
    durationMs: entry.exitedAt && entry.enteredAt
      ? new Date(entry.exitedAt).getTime() - new Date(entry.enteredAt).getTime()
      : undefined,
  }));
}

/**
 * Build a summary of the graph execution for debugging.
 */
export function buildExecutionSummary(state: InterviewGraphState) {
  const history = getNodeHistory(state);
  return {
    traceId: state.trace.traceId,
    graphVersion: state.trace.graphVersion,
    totalNodes: history.length,
    currentNode: state.trace.currentNode,
    modelCalls: state.trace.modelCalls,
    tokensUsed: state.trace.tokensUsed,
    sessionState: state.session.state,
    budgetUsed: `${state.budget.questionsUsed}/${state.budget.questionBudget}`,
    beliefsCount: Object.keys(state.abilityBeliefs).length,
    evidenceLedgerCount: state.evidenceLedger.length,
    contradictionsCount: state.contradictions.length,
    nodeTimeline: history,
  };
}
