/**
 * Node: plan_question
 * Creates a structured question plan (QuestionPlan).
 */

import type { InterviewGraphState, GraphNodeResult, QuestionPlan } from "../graph-state.js";

export function planQuestionNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "plan_question");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "plan_question", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "plan_question";
  // A new plan starts a new guard lifecycle. Retries caused by this plan
  // itself are counted by questionGuardNode and cannot leak into the next turn.
  state.questionGuardAttempts = 0;

  const skill = state.currentThread.focusSkill;
  const covered = state.currentThread.coveredEvidence;
  const required = state.currentThread.requiredEvidence;
  const missing = required.filter((e) => !covered.includes(e));
  const strategy = state.pressureState.strategy;
  const depth = state.currentThread.depthLevel;
  const subgraphStep = state.subgraphName ? `${state.subgraphName}[${state.subgraphStep}]` : "main";

  // Determine objective based on missing evidence and depth
  let objective: QuestionPlan["objective"] = "establish_baseline";
  if (missing.includes("职责边界") || missing.includes("个人任务")) objective = "verify_ownership";
  else if (missing.includes("实现机制")) objective = "verify_mechanism";
  else if (missing.includes("选型权衡")) objective = "test_tradeoff";
  else if (missing.includes("指标与口径")) objective = "test_metric";
  else if (missing.includes("异常与边界") || strategy === "failure") objective = "test_failure";
  else if (state.contradictions.length > 0) objective = "resolve_contradiction";

  const plan: QuestionPlan = {
    targetSkillId: skill,
    objective,
    difficulty: Math.min(5, Math.max(1, depth + 1)) as 1 | 2 | 3 | 4 | 5,
    pressureStrategy: strategy,
    requiredEvidence: missing.length > 0 ? missing : required.slice(0, 3),
    retrievalQuery: `${state.candidate.targetRole} ${skill} ${strategy} ${objective} ${missing.join(" ")} ${subgraphStep}`,
    reason: missing.length > 0
      ? `需要补全${missing.slice(0, 2).join("、")}证据（${subgraphStep}）`
      : `在${skill}方向继续深挖（${subgraphStep}）`,
  };

  state.questionPlan = plan;
  return { state, next: "compose_question" };
}
