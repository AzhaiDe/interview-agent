/**
 * Node: session_critic
 * Evaluates whether to finish, change skill, or follow up.
 */

import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";

export function sessionCriticNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "session_critic");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "session_critic", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "session_critic";

  const evidence = (state as any)._extractedEvidence;
  const missing = evidence?.missing || [];

  const covered = Object.values(state.abilityBeliefs).filter((b) => b.evidenceCount > 0).length;
  const required = state.rubric.mustHave.length || 1;
  // Update session counters
  state.budget.questionsUsed++;
  state.session.questionIndex = state.budget.questionsUsed;
  // Evaluate the budget after accounting for the answer just processed. This
  // prevents the final allowed answer from generating one extra question.
  const budgetExhausted = state.budget.questionsUsed >= state.budget.questionBudget;
  const fatigue = state.fatigueState.fatigueScore >= Math.max(6, state.budget.questionBudget - 2);
  const severeMissing = missing.includes("职责边界") || missing.includes("实现机制");
  const skill = state.currentThread.focusSkill;
  const skillRoundCounts = (state.session as any).skillRoundCounts ||= {};
  const topicRoundCounts = (state.session as any).topicRoundCounts ||= {};
  skillRoundCounts[skill] = (skillRoundCounts[skill] || 0) + 1;
  topicRoundCounts[state.pendingQuestion?.topic || skill] =
    (topicRoundCounts[state.pendingQuestion?.topic || skill] || 0) + 1;

  // Store diagnosis
  const score = state.aggregateResult?.score || 0;
  const mergedCovered = [...new Set((state.latestJudges || []).flatMap((j) => j.evidenceCovered))];
  const mergedMissing = missing;

  state.session.scores.push(score);
  state.session.transcript.push({ role: "candidate", text: state.latestAnswer || "", score });
  if (state.transcript !== state.session.transcript) {
    state.transcript.push({ role: "candidate", text: state.latestAnswer || "", score });
  }

  const diagnosis = {
    round: state.budget.questionsUsed,
    question: state.pendingQuestion?.text || "",
    answerSummary: (state.latestAnswer || "").replace(/\s+/g, " ").slice(0, 220),
    score,
    topic: state.pendingQuestion?.topic || skill,
    mappedSkill: skill,
    questionType: state.pendingQuestion?.questionType || "project_followup",
    action: budgetExhausted ? "advance" as const : "advance" as const,
    missingEvidence: mergedMissing,
    weakPoint: mergedMissing.length ? `缺少${mergedMissing.slice(0, 2).join("、")}` : undefined,
    strongPoint: mergedCovered.length ? `已覆盖${mergedCovered.slice(0, 2).join("、")}` : undefined,
    evidenceQuote: evidence?.quote,
    relevance: state.latestJudges?.[0]?.relevance || 0.9,
    reason: `Graph route: confidence=${state.aggregateResult?.confidence}; spread=${state.aggregateResult?.spread}`,
  };
  state.session.diagnoses.push(diagnosis);

  // Determine next action
  if (budgetExhausted || fatigue) {
    state.nextAction = "finish";
    state.session.state = "finishing";
    state.session.phase = "总结";
  } else if (severeMissing && !budgetExhausted) {
    state.nextAction = "followup";
  } else {
    state.nextAction = "select_next_skill";
  }

  return { state, next: "route_next_action" };
}
