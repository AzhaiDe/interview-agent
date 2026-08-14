/**
 * Interview Graph Definition
 *
 * Assembles the complete Interview Graph with all nodes, edges, and subgraphs.
 * Aligned with OFFERPILOT_TECHNICAL_ARCHITECTURE.md §2.2.
 */

import type { InterviewGraphState } from "./graph-state.js";
import type { GraphDefinition } from "../graph-runtime.js";

// Import all nodes
import { loadContextNode } from "./nodes/load-context.js";
import { loadOrCreateRubricNode } from "./nodes/load-or-create-rubric.js";
import { selectTargetSkillNode } from "./nodes/select-target-skill.js";
import { retrieveEvidencePackNode } from "./nodes/retrieve-evidence-pack.js";
import { planQuestionNode } from "./nodes/plan-question.js";
import { composeQuestionNode } from "./nodes/compose-question.js";
import { questionGuardNode } from "./nodes/question-guard.js";
import { waitForAnswerNode } from "./nodes/wait-for-answer.js";
import { extractClaimsNodeAsync as extractClaimsNode } from "./nodes/extract-claims.js";
import { parallelJudgeNode } from "./nodes/parallel-judge.js";
import { aggregateJudgesNode } from "./nodes/aggregate-judges.js";
import { updateEvidenceLedgerNode } from "./nodes/update-evidence-ledger.js";
import { updateAbilityBeliefsNode } from "./nodes/update-ability-beliefs.js";
import { updatePressureStateNode } from "./nodes/update-pressure-state.js";
import { sessionCriticNode } from "./nodes/session-critic.js";
import { routeNextActionNode } from "./nodes/route-next-action.js";
import { finishNode } from "./nodes/finish.js";
import { humanReviewNode } from "./nodes/human-review.js";

// Import subgraphs
import { projectDeepDiveSubGraph } from "./subgraphs/project-deep-dive.js";
import { technicalFundamentalsSubGraph } from "./subgraphs/technical-fundamentals.js";
import { systemDesignSubGraph } from "./subgraphs/system-design.js";
import { behavioralSubGraph } from "./subgraphs/behavioral.js";

/**
 * The main Interview Graph definition (v2).
 *
 * 18 nodes total:
 * - 16 main processing nodes
 * - 2 terminal nodes (finish, human_review)
 *
 * Flow:
 * load_context → load_or_create_rubric → select_target_skill → retrieve_evidence_pack
 * → plan_question → compose_question → question_guard → wait_for_answer
 * → extract_claims → parallel_judge → aggregate_judges
 * → update_evidence_ledger → update_ability_beliefs → update_pressure_state
 * → session_critic → route_next_action → (loop back or finish)
 */
export const interviewGraph: GraphDefinition<InterviewGraphState> = {
  version: "offerpilot-interview-graph-v1",
  start: "load_context",
  nodes: {
    load_context: loadContextNode,
    load_or_create_rubric: loadOrCreateRubricNode,
    select_target_skill: selectTargetSkillNode,
    retrieve_evidence_pack: retrieveEvidencePackNode,
    plan_question: planQuestionNode,
    compose_question: composeQuestionNode,
    question_guard: questionGuardNode,
    wait_for_answer: waitForAnswerNode,
    extract_claims: extractClaimsNode,
    parallel_judge: parallelJudgeNode,
    aggregate_judges: aggregateJudgesNode,
    update_evidence_ledger: updateEvidenceLedgerNode,
    update_ability_beliefs: updateAbilityBeliefsNode,
    update_pressure_state: updatePressureStateNode,
    session_critic: sessionCriticNode,
    route_next_action: routeNextActionNode,
    finish: finishNode,
    human_review: humanReviewNode,
  },
  edges: {
    // Main flow
    load_context: "load_or_create_rubric",
    load_or_create_rubric: "select_target_skill",
    select_target_skill: "plan_question",
    // The plan is deliberately created before retrieval so its query and
    // evidence requirements are the inputs to RAG, rather than dead metadata.
    plan_question: "retrieve_evidence_pack",
    retrieve_evidence_pack: "compose_question",
    compose_question: "question_guard",

    // Question guard conditional
    question_guard: (state) => {
      return state.pendingQuestion?.valid !== false ? "wait_for_answer" : "compose_question";
    },

    // Wait for answer → extract (after interrupt resume)
    wait_for_answer: "extract_claims",

    // Judge pipeline
    extract_claims: "parallel_judge",
    parallel_judge: "aggregate_judges",

    // Aggregate conditional
    aggregate_judges: (state) => {
      if (state.aggregateResult?.needsHumanReview && state.rejudgeAttempts < 1) {
        state.rejudgeAttempts += 1;
        return "parallel_judge";
      }
      if (state.aggregateResult?.needsHumanReview) return "human_review";
      return "update_evidence_ledger";
    },

    // Belief & pressure update
    update_evidence_ledger: "update_ability_beliefs",
    update_ability_beliefs: "update_pressure_state",
    update_pressure_state: "session_critic",

    // Critic → routing
    session_critic: "route_next_action",

    // Routing: dynamic based on state
    route_next_action: (state) => {
      // Terminal states
      if (state.session.state === "completed" || state.nextAction === "finish") return "finish";
      if (state.session.state === "human_review" || state.nextAction === "human_review") return "human_review";

      // Followup: stay in same skill, retrieve evidence again
      if (state.nextAction === "followup" || state.nextAction === "clarify_boundary" || state.nextAction === "resolve_contradiction") {
        return "retrieve_evidence_pack";
      }

      // Rejudge: run judges again
      if (state.nextAction === "rejudge") return "parallel_judge";

      // Default: select next skill
      return "select_target_skill";
    },

    // Terminal nodes: no outgoing edges
    finish: "",
    human_review: "",
  },
  interrupts: new Set(["wait_for_answer", "human_review"]),
};

/**
 * Subgraph registry: maps interview type to subgraph definition.
 */
export const subGraphs = {
  project_deep_dive: projectDeepDiveSubGraph,
  technical_fundamentals: technicalFundamentalsSubGraph,
  system_design: systemDesignSubGraph,
  behavioral: behavioralSubGraph,
};

/**
 * Get subgraph for a given interview type.
 */
export function getSubGraph(interviewType: string) {
  return subGraphs[interviewType as keyof typeof subGraphs] || projectDeepDiveSubGraph;
}

/**
 * Generate graph manifest for API exposure.
 */
export function interviewGraphManifest() {
  const nodes = Object.keys(interviewGraph.nodes);
  const edges = Object.entries(interviewGraph.edges).map(([from, to]) => ({
    from,
    to: typeof to === "function" ? "<conditional>" : to,
    conditional: typeof to === "function",
  })).filter((e) => e.to);

  return {
    version: interviewGraph.version,
    nodes,
    edges,
    interrupts: [...(interviewGraph.interrupts || [])],
    subgraphs: Object.keys(subGraphs),
  };
}
