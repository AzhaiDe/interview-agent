/**
 * Node: update_ability_beliefs
 * Bayesian update of skill beliefs based on judge results.
 */

import type { InterviewGraphState, GraphNodeResult, SkillBelief } from "../graph-state.js";

export function updateAbilityBeliefsNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "update_ability_beliefs");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "update_ability_beliefs", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "update_ability_beliefs";

  const skill = state.currentThread.focusSkill;
  const score = state.aggregateResult?.score || 0;
  const evidence = (state as any)._extractedEvidence;
  const turnId = (state as any)._currentTurnId || "";
  const evidenceId = (state as any)._currentEvidenceId || "";

  const current = state.abilityBeliefs[skill] ||= {
    skillId: skill,
    meanLevel: 2.5,
    uncertainty: 1,
    evidenceCount: 0,
    maxDifficultyPassed: 0,
    supportingEvidenceIds: [],
    contradictingEvidenceIds: [],
    misconceptions: [],
  };

  // Bayesian update
  const observed = Math.max(1, Math.min(5, score / 2));
  const info = Math.min(0.35, 0.08 + (evidence?.covered?.length || 0) * 0.045);
  current.meanLevel = Number((current.meanLevel + info * (observed - current.meanLevel)).toFixed(3));
  current.uncertainty = Number(Math.max(0.1, current.uncertainty * (1 - info)).toFixed(3));
  current.evidenceCount++;
  current.maxDifficultyPassed = Math.max(
    current.maxDifficultyPassed,
    state.pendingQuestion?.depth || 1
  );
  current.lastTestedAt = new Date().toISOString();

  if (evidenceId) {
    if (score >= 6) {
      current.supportingEvidenceIds.push(evidenceId);
    } else {
      current.contradictingEvidenceIds.push(evidenceId);
    }
  }

  // Sync back to session agentRuntime for backward compatibility
  const runtime = (state.session as any).agentRuntime ||= {};
  runtime.beliefs = { ...state.abilityBeliefs };
  runtime.evidenceLedger = [...state.evidenceLedger];

  return { state, next: "update_pressure_state" };
}
