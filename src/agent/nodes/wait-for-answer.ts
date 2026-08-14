/**
 * Node: wait_for_answer
 * Interrupts the graph to wait for candidate's answer.
 */

import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";

export function waitForAnswerNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "wait_for_answer");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "wait_for_answer", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "wait_for_answer";

  const question = state.pendingQuestion!;

  // Update session state
  state.session.currentQuestion = question.text;
  state.session.currentTopic = question.topic;
  state.session.currentMappedSkill = question.mappedSkill;
  state.session.currentQuestionType = question.questionType;
  state.session.topicDepth = question.depth;
  state.session.state = "asking";
  state.session.phase = question.questionType === "scenario"
    ? "故障与系统设计"
    : question.questionType === "knowledge"
    ? "技术原理"
    : "项目核验";

  // Add question to transcript
  state.transcript.push({ role: "interviewer", text: question.text });
  if (state.session.transcript !== state.transcript) {
    state.session.transcript.push({ role: "interviewer", text: question.text });
  }

  // Interrupt: graph pauses here until answer is provided
  return {
    state,
    interrupt: {
      reason: "awaiting_candidate_answer",
      payload: {
        questionId: `Q-${state.session.id}-${state.budget.questionsUsed + 1}`,
        question: question.text,
        mappedSkill: question.mappedSkill,
      },
    },
  };
}
