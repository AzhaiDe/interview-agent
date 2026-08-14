/**
 * Node: update_evidence_ledger
 * Records evidence items from this turn into the evidence ledger.
 */

import crypto from "node:crypto";
import type { InterviewGraphState, GraphNodeResult, EvidenceLedgerItem } from "../graph-state.js";

export function updateEvidenceLedgerNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "update_evidence_ledger");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "update_evidence_ledger", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "update_evidence_ledger";

  const evidence = (state as any)._extractedEvidence;
  const score = state.aggregateResult?.score || 0;
  const skill = state.currentThread.focusSkill;
  const turnId = `TURN-${crypto.randomUUID().slice(0, 12)}`;

  if (evidence?.covered?.length > 0) {
    const evidenceId = `EVID-${crypto.randomUUID().slice(0, 12)}`;
    const item: EvidenceLedgerItem = {
      id: evidenceId,
      turnId,
      skillId: skill,
      claim: evidence.quote || "",
      evidenceSpan: evidence.quote,
      evidenceType: evidence.covered[0] || "unknown",
      polarity: score >= 6 ? "supports" : "unknown",
      source: "answer",
      confidence: 0.7,
      citations: state.retrieval?.facts.flatMap((f) => f.sourceIds) || [],
    };
    state.evidenceLedger.push(item);

    // Store turnId for update_ability_beliefs
    (state as any)._currentTurnId = turnId;
    (state as any)._currentEvidenceId = evidenceId;
  } else {
    (state as any)._currentTurnId = turnId;
  }

  return { state, next: "update_ability_beliefs" };
}
