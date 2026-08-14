/**
 * Node: route_next_action
 * Centralized routing based on current state.
 * Delegates to the routeNextAction function in edges.ts.
 */

import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";
import { routeNextAction, actionToNode } from "../edges.js";

export function routeNextActionNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "route_next_action");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "route_next_action", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "route_next_action";

  // If session_critic already set nextAction, use it
  let action = state.nextAction;

  // Otherwise, use the centralized routing logic
  if (!action || action === "retrieve") {
    action = routeNextAction(state);
    state.nextAction = action;
  }

  // Map action to target node
  const nextNode = actionToNode(action);

  // Special handling for terminal nodes
  if (nextNode === "finish") {
    state.session.state = "completed";
    return { state, next: "finish" };
  }

  if (nextNode === "human_review") {
    state.session.state = "human_review";
    return { state, next: "human_review" };
  }

  // For follow-up: update thread depth
  if (action === "followup") {
    state.currentThread.depthLevel++;
  }

  // For skill change: reset thread
  if (action === "select_next_skill") {
    state.currentThread.depthLevel = 0;
    state.currentThread.coveredEvidence = [];
  }

  return { state, next: nextNode };
}
