/**
 * Node: select_target_skill
 * Selects the next skill to test using utility scoring.
 */

import type { InterviewGraphState, GraphNodeResult, SkillBelief } from "../graph-state.js";
import type { InterviewSession } from "../../types.js";
import { getSubGraph } from "../interview-graph.js";

/**
 * Backward-compatible utility function.
 * Accepts either InterviewSession (legacy API) or InterviewGraphState (new API).
 */
function interviewUtility(stateOrSession: InterviewGraphState | InterviewSession, skill: string): number {
  // Detect whether we have a session or a graph state
  const isSession = !("abilityBeliefs" in stateOrSession) || !("rubric" in stateOrSession);

  let abilityBeliefs: Record<string, SkillBelief>;
  let mustHave: any[];
  let experiences: Array<{ technologies: string[] }>;
  let skillRoundCounts: Record<string, number>;
  let topicRoundCounts: Record<string, number>;
  let fatigueScore: number;

  if (isSession) {
    const session = stateOrSession as InterviewSession;
    abilityBeliefs = (session as any).beliefs || {};
    mustHave = session.roleRubric?.mustHave || [];
    experiences = session.profile.experiences;
    skillRoundCounts = (session as any).skillRoundCounts || {};
    topicRoundCounts = (session as any).topicRoundCounts || {};
    fatigueScore = (session as any).pressure?.fatigue || 0;
  } else {
    const state = stateOrSession as InterviewGraphState;
    abilityBeliefs = state.abilityBeliefs;
    mustHave = state.rubric.mustHave;
    experiences = state.candidate.experiences;
    skillRoundCounts = (state.session as any).skillRoundCounts || {};
    topicRoundCounts = (state.session as any).topicRoundCounts || {};
    fatigueScore = state.fatigueState.fatigueScore;
  }

  const belief = abilityBeliefs[skill] || { meanLevel: 2.5, uncertainty: 1, evidenceCount: 0 };
  const roleWeight = mustHave.find((x) => x.skill === skill)?.weight || 1;
  const uncertainty = Math.max(0, Math.min(1, belief.uncertainty));
  const relevance = experiences.some((exp) =>
    exp.technologies.some((t) => t.toLowerCase() === skill.toLowerCase())
  ) ? 1 : 0.65;
  const verifiability = mustHave.find((x) => x.skill === skill)?.evidenceExpectations?.length ? 1 : 0.7;
  const difficultyFit = Math.max(0.35, 1 - Math.abs((belief.meanLevel || 2.5) - 2.5) / 5);
  const fatiguePenalty = Math.min(0.45, (skillRoundCounts[skill] || 0) * 0.1 + fatigueScore * 0.02);
  const repetitionPenalty = Math.min(0.35, (topicRoundCounts[skill] || 0) * 0.08);
  return Number((roleWeight * (0.28 * uncertainty + 0.24 * relevance + 0.2 * verifiability + 0.18 * difficultyFit) - fatiguePenalty - repetitionPenalty).toFixed(4));
}

export function selectTargetSkillNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "select_target_skill");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "select_target_skill", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "select_target_skill";

  const skillRoundCounts = (state.session as any).skillRoundCounts || {};
  const maxRoundsPerSkill = state.session.maxRoundsPerSkill || 4;

  const candidates = state.rubric.mustHave
    .map((x) => x.skill)
    .filter((x) => (skillRoundCounts[x] || 0) < maxRoundsPerSkill);

  const sorted = candidates.sort(
    (a, b) =>
      interviewUtility(state, b) - interviewUtility(state, a) ||
      (state.abilityBeliefs[b]?.uncertainty || 1) - (state.abilityBeliefs[a]?.uncertainty || 1)
  );

  const selectedSkill = sorted[0] || state.rubric.mustHave[0]?.skill || "项目实现";

  const subgraph = getSubGraph(state.session.interviewType || "project_deep_dive");
  state.subgraphName = subgraph.name;
  const step = subgraph.getCurrentStep(state);
  state.subgraphStep = subgraph.steps.indexOf(step);

  // Update current thread
  state.currentThread.focusSkill = selectedSkill;
  state.currentThread.requiredEvidence = state.rubric.mustHave
    .find((x) => x.skill === selectedSkill)?.evidenceExpectations || [];
  // A subgraph step is authoritative for the current turn. Keep rubric
  // evidence as a fallback, but never let the generic thread bypass the
  // interview-type-specific progression.
  if (step?.evidence) {
    state.currentThread.requiredEvidence = [step.evidence];
    state.pressureState.strategy = step.strategy;
  }

  return { state, next: "retrieve_evidence_pack" };
}

export { interviewUtility };
