import { Annotation, Command, END, MemorySaver, START, StateGraph, interrupt, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { InterviewGraphState } from "./graph-state.js";
import { loadContextNode } from "./nodes/load-context.js";
import { loadOrCreateRubricNode } from "./nodes/load-or-create-rubric.js";
import { selectTargetSkillNode } from "./nodes/select-target-skill.js";
import { planQuestionNode } from "./nodes/plan-question.js";
import { retrieveEvidencePackNode } from "./nodes/retrieve-evidence-pack.js";
import { composeQuestionNode } from "./nodes/compose-question.js";
import { questionGuardNode } from "./nodes/question-guard.js";
import { extractClaimsNode } from "./nodes/extract-claims.js";
import { parallelJudgeNode } from "./nodes/parallel-judge.js";
import { aggregateJudgesNode } from "./nodes/aggregate-judges.js";
import { updateEvidenceLedgerNode } from "./nodes/update-evidence-ledger.js";
import { updateAbilityBeliefsNode } from "./nodes/update-ability-beliefs.js";
import { updatePressureStateNode } from "./nodes/update-pressure-state.js";
import { sessionCriticNode } from "./nodes/session-critic.js";
import { createGrowthReport } from "../agent-runtime.js";
import { enqueueMemory, flushMemoryOutbox } from "../omnimemory.js";
import { database } from "../database.js";

export const InterviewV3State = Annotation.Root({
  runtime: Annotation<InterviewGraphState>(),
});
export type InterviewV3StateType = typeof InterviewV3State.State;

const apply = (r: { state: InterviewGraphState }) => ({ runtime: r.state });

export function createInterviewGraphV3(checkpointer: BaseCheckpointSaver = new MemorySaver()) {
  const bootstrap = (s: InterviewV3StateType) => apply(loadOrCreateRubricNode(loadContextNode(s.runtime).state));
  const decideNext = (s: InterviewV3StateType) => {
    const state = s.runtime;
    if (state.session.state === "completed" || state.session.state === "finishing" || state.budget.questionsUsed >= state.budget.questionBudget) {
      state.nextAction = "finish";
      return { runtime: state };
    }
    if (state.nextAction !== "followup" || !state.currentThread.focusSkill) selectTargetSkillNode(state);
    state.nextAction = "ask";
    state.session.state = "asking";
    return { runtime: state };
  };
  const formulate = async (s: InterviewV3StateType) => {
    const state = s.runtime;
    planQuestionNode(state); await retrieveEvidencePackNode(state); await composeQuestionNode(state); questionGuardNode(state);
    state.session.currentQuestion = state.pendingQuestion?.text; state.session.currentTopic = state.pendingQuestion?.topic;
    state.session.currentMappedSkill = state.pendingQuestion?.mappedSkill; state.session.currentQuestionType = state.pendingQuestion?.questionType;
    state.session.phase = "提问";
    return { runtime: state };
  };
  const awaitAnswer = (s: InterviewV3StateType) => {
    const state = s.runtime;
    const resumed = interrupt({ kind: "candidate_answer", sessionId: state.session.id, question: state.pendingQuestion?.text });
    state.latestAnswer = typeof resumed === "string" ? resumed : String((resumed as any)?.answer || "");
    return { runtime: state };
  };
  const evaluate = async (s: InterviewV3StateType) => {
    const state = s.runtime; state.session.state = "evaluating";
    await extractClaimsNode(state); await parallelJudgeNode(state); aggregateJudgesNode(state);
    if (state.aggregateResult?.needsHumanReview) {
      state.session.state = "human_review"; state.session.phase = "人工复核";
      const decision = interrupt({ kind: "human_review", sessionId: state.session.id, aggregate: state.aggregateResult, judges: state.latestJudges });
      if ((decision as any)?.decision === "reject") { state.nextAction = "finish"; state.session.state = "finishing"; }
      else { state.aggregateResult.needsHumanReview = false; state.session.state = "evaluating"; }
    }
    return { runtime: state };
  };
  const commit = (s: InterviewV3StateType) => {
    const state = s.runtime;
    updateEvidenceLedgerNode(state); updateAbilityBeliefsNode(state); updatePressureStateNode(state); sessionCriticNode(state);
    enqueueMemory({ ownerId: state.ownerId, deviceNo: database.memoryDeviceNo(state.ownerId), sessionId: `interview:${state.session.id}`, groupId: `candidate:${state.ownerId}:interview:${state.session.id}`, groupName: "候选人面试长期记忆", commitId: `turn:${state.session.id}:${state.budget.questionsUsed}`, content: `问题：${state.pendingQuestion?.text || ""}；回答：${state.latestAnswer || ""}；技能：${state.currentThread.focusSkill}；评分：${state.aggregateResult?.score || 0}` });
    void flushMemoryOutbox(1);
    state.session.state = state.nextAction === "finish" ? "finishing" : "generating_next";
    return { runtime: state };
  };
  const finalize = async (s: InterviewV3StateType) => {
    const state = s.runtime; state.session.state = "completed"; state.session.phase = "总结";
    state.session.growthReport = await createGrowthReport(state.session); state.session.result = state.session.growthReport.result;
    return { runtime: state };
  };
  const route = (s: InterviewV3StateType) => s.runtime.nextAction === "finish" ? "finalize" : "formulate_question";
  return new StateGraph(InterviewV3State)
    .addNode("bootstrap", bootstrap).addNode("decide_next", decideNext).addNode("formulate_question", formulate)
    .addNode("await_answer", awaitAnswer).addNode("evaluate_answer", evaluate).addNode("commit_turn", commit).addNode("finalize", finalize)
    .addEdge(START, "bootstrap").addEdge("bootstrap", "decide_next").addConditionalEdges("decide_next", route)
    .addEdge("formulate_question", "await_answer").addEdge("await_answer", "evaluate_answer").addEdge("evaluate_answer", "commit_turn")
    .addEdge("commit_turn", "decide_next").addEdge("finalize", END).compile({ checkpointer });
}

export { Command };
