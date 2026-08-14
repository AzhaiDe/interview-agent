/**
 * Agent Graph — Backward-compatible wrapper.
 *
 * Re-exports the new v2 graph definition and manifest while preserving
 * the legacy GraphNodeName and GraphEdge types for consumers.
 */

import { interviewGraphManifest, interviewGraph } from "./agent/interview-graph.js";

// ---- Legacy types (backward compatible) ----

export type GraphNodeName =
  | "load_context" | "load_or_create_rubric" | "select_target_skill"
  | "retrieve_evidence_pack" | "retrieve_evidence"
  | "plan_question" | "compose_question" | "question_guard"
  | "wait_for_answer" | "extract_claims" | "parallel_judge"
  | "aggregate_judges" | "update_evidence_ledger"
  | "update_ability_beliefs" | "update_beliefs"
  | "update_pressure_state" | "session_critic" | "route_next_action"
  | "finish" | "human_review";

export type GraphEdge = { from: GraphNodeName; to: GraphNodeName; when?: string };

// ---- Node and Edge lists ----

export const INTERVIEW_GRAPH_NODES: GraphNodeName[] = [
  "load_context",
  "load_or_create_rubric",
  "select_target_skill",
  "retrieve_evidence_pack",
  "plan_question",
  "compose_question",
  "question_guard",
  "wait_for_answer",
  "extract_claims",
  "parallel_judge",
  "aggregate_judges",
  "update_evidence_ledger",
  "update_ability_beliefs",
  "update_pressure_state",
  "session_critic",
  "route_next_action",
  "finish",
  "human_review",
];

export const INTERVIEW_GRAPH_EDGES: GraphEdge[] = [
  { from: "load_context", to: "load_or_create_rubric" },
  { from: "load_or_create_rubric", to: "select_target_skill" },
  { from: "select_target_skill", to: "retrieve_evidence_pack" },
  { from: "retrieve_evidence_pack", to: "plan_question" },
  { from: "plan_question", to: "compose_question" },
  { from: "compose_question", to: "question_guard" },
  { from: "question_guard", to: "compose_question", when: "invalid" },
  { from: "question_guard", to: "wait_for_answer", when: "valid" },
  { from: "wait_for_answer", to: "extract_claims" },
  { from: "extract_claims", to: "parallel_judge" },
  { from: "parallel_judge", to: "aggregate_judges" },
  { from: "aggregate_judges", to: "human_review", when: "low_confidence_or_large_disagreement" },
  { from: "aggregate_judges", to: "update_evidence_ledger", when: "accepted" },
  { from: "update_evidence_ledger", to: "update_ability_beliefs" },
  { from: "update_ability_beliefs", to: "update_pressure_state" },
  { from: "update_pressure_state", to: "session_critic" },
  { from: "session_critic", to: "route_next_action" },
  { from: "route_next_action", to: "finish", when: "budget_exhausted" },
  { from: "route_next_action", to: "select_target_skill", when: "change_skill" },
  { from: "route_next_action", to: "retrieve_evidence_pack", when: "followup" },
  { from: "route_next_action", to: "human_review", when: "needs_review" },
  { from: "route_next_action", to: "parallel_judge", when: "rejudge" },
];

// ---- Manifest ----

export function graphManifest() {
  return interviewGraphManifest();
}

// Re-export the graph definition for direct use
export { interviewGraph } from "./agent/interview-graph.js";
