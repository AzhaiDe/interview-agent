/**
 * LangGraph V2 - 智能面试评估系统（集成模型调用）
 *
 * 基于 LangGraph 官方框架，实现：
 * - 多维度评审（规则引擎 + 模型评审）
 * - 贝叶斯信念更新
 * - 证据追踪
 * - 人工复核判断
 *
 * 节点流程：
 * START → load_context → select_strategy → compose_question → question_guard
 * → wait_for_answer → evaluate_answer → converge → (循环或 END)
 */

import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { config } from "../config.js";
import { evaluateAnswer, type JudgeAggregate } from "./langgraph-evaluator-v2.js";

// ============ 状态定义 ============

export const InterviewGraphState = Annotation.Root({
  sessionId: Annotation<string>(),
  targetRole: Annotation<string>(),
  pressure: Annotation<string>(),
  answer: channel(""),
  question: channel(""),
  mappedSkill: channel(""),
  evidence: channel<string[]>([]),
  belief: channel<Record<string, number>>({}),
  beliefUncertainty: channel<Record<string, number>>({}),
  evidenceClaims: channel<Array<{
    claim: string;
    polarity: "supports" | "contradicts" | "unknown";
    confidence: number;
  }>>([]),
  review: channel<{ required: boolean; reason?: string }>({ required: false }),
  memoryEventIds: channel<string[]>([]),
  node: channel("start"),
  nextAction: channel<"answer" | "finished">("answer"),
  round: channel(0),
  trace: channel<string[]>([]),
  aggregateResult: channel<Partial<JudgeAggregate>>({}),
  priorAnswers: channel<string[]>([]),
  modelCalls: channel(0),
  judgesUsed: channel<string[]>([]),
});

function channel<T>(fallback: T) {
  return Annotation<T>({
    reducer: (_left: T, right: T) => right,
    default: () => fallback,
  });
}

export type InterviewGraphStateType = typeof InterviewGraphState.State;

// ============ 工具函数 ============

const appendTrace = (state: InterviewGraphStateType, node: string) => ({
  node,
  trace: [...state.trace, node],
});

// ============ 贝叶斯信念更新 ============

function updateBelief(
  currentBelief: number,
  currentUncertainty: number,
  score: number,
  evidenceCount: number
): { meanLevel: number; uncertainty: number } {
  const observed = Math.max(1, Math.min(5, score / 2));
  const info = Math.min(0.35, 0.08 + evidenceCount * 0.045);
  const meanLevel = Number((currentBelief + info * (observed - currentBelief)).toFixed(3));
  const uncertainty = Number(Math.max(0.1, currentUncertainty * (1 - info)).toFixed(3));
  return { meanLevel, uncertainty };
}

// ============ 节点实现 ============

const loadContext = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "load_context"),
  evidence: state.evidence.length ? state.evidence : [`${state.targetRole}:核心能力待验证`],
});

const selectStrategy = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "select_strategy"),
  mappedSkill: state.mappedSkill || "problem_solving",
});

const composeQuestion = (state: InterviewGraphStateType) => {
  const defaultQuestions: Record<string, string> = {
    problem_solving: `请结合${state.targetRole}经历，说明你如何解决一个复杂问题？`,
    system_design: `请描述你在${state.targetRole}中参与的系统设计，包括架构决策和权衡？`,
    technical_depth: `请深入讲解你在${state.targetRole}中使用的核心技术，包括原理和边界？`,
    project_execution: `请描述你在${state.targetRole}中负责的项目，包括职责、指标和验证？`,
  };

  return {
    ...appendTrace(state, "compose_question"),
    question: state.question || defaultQuestions[state.mappedSkill] || defaultQuestions.problem_solving,
  };
};

const questionGuard = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "question_guard"),
  question: state.question.trim() || `请描述一个你最具挑战性的${state.targetRole}项目？`,
});

const waitForAnswer = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "wait_for_answer"),
  nextAction: "answer" as const,
});

/**
 * 节点 6：evaluate_answer - 评估回答（核心节点）
 *
 * 集成模型调用：
 * 1. 确定性评审（Base Judge）- 规则引擎
 * 2. 模型评审（4 类 Judge 并行）- 调用百炼 API
 * 3. 加权聚合
 * 4. 贝叶斯信念更新
 * 5. 人工复核判断
 */
const evaluateAnswerNode = async (state: InterviewGraphStateType) => {
  const skill = state.mappedSkill || "problem_solving";
  const answer = state.answer || "";

  // 调用多维度评审系统（集成模型调用）
  const result = await evaluateAnswer(
    answer,
    skill,
    state.sessionId,
    state.round + 1,
    state.priorAnswers,
    state.question,
    state.targetRole
  );

  // 更新技能信念（贝叶斯更新）
  const currentBelief = state.belief[skill] ?? 2.5;
  const currentUncertainty = state.beliefUncertainty[skill] ?? 1.0;

  const { meanLevel, uncertainty } = updateBelief(
    currentBelief,
    currentUncertainty,
    result.score,
    result.aggregate.judges[0]?.evidenceCovered.length || 0
  );

  const eventId = `v2:${state.sessionId}:${state.round + 1}`;

  return {
    ...appendTrace(state, "evaluate_answer"),
    answer: "",

    // 多维度评审结果
    aggregateResult: result.aggregate,
    evidenceClaims: result.evidenceClaims,

    // 人工复核判断
    review: {
      required: result.needsHumanReview,
      reason: result.needsHumanReview
        ? `评审分歧过大 (spread=${result.aggregate.spread}) 或置信度过低 (confidence=${result.aggregate.confidence})，需要人工复核`
        : undefined,
    },

    // 信念更新
    belief: { ...state.belief, [skill]: meanLevel },
    beliefUncertainty: { ...state.beliefUncertainty, [skill]: uncertainty },

    // 轮次递增
    round: state.round + 1,

    // 记录历史回答
    priorAnswers: [...state.priorAnswers, answer],

    // 记忆事件
    memoryEventIds: [...state.memoryEventIds, eventId],

    // 模型调用统计
    modelCalls: result.modelCalls,
    judgesUsed: result.judgesUsed,
  };
};

const converge = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "converge"),
  nextAction: state.round >= 3 ? "finished" as const : "answer" as const,
});

function routeAfterConverge(state: InterviewGraphStateType) {
  if (state.nextAction === "finished") return END;
  if (state.review?.required) return END;
  return "compose_question";
}

// ============ 图构建 ============

export function buildInterviewGraph(checkpointer: any = new MemorySaver()): any {
  return new StateGraph(InterviewGraphState)
    .addNode("load_context", loadContext)
    .addNode("select_strategy", selectStrategy)
    .addNode("compose_question", composeQuestion)
    .addNode("question_guard", questionGuard)
    .addNode("wait_for_answer", waitForAnswer)
    .addNode("evaluate_answer", evaluateAnswerNode)
    .addNode("converge", converge)

    .addEdge(START, "load_context")
    .addEdge("load_context", "select_strategy")
    .addEdge("select_strategy", "compose_question")
    .addEdge("compose_question", "question_guard")
    .addEdge("question_guard", "wait_for_answer")
    .addEdge("evaluate_answer", "converge")

    .addConditionalEdges(
      "wait_for_answer",
      (state) => (state.answer?.trim() ? "evaluate_answer" : END),
      { evaluate_answer: "evaluate_answer", [END]: END }
    )
    .addConditionalEdges(
      "converge",
      routeAfterConverge,
      { compose_question: "compose_question", [END]: END }
    )

    .compile({ checkpointer });
}

export async function buildPostgresInterviewGraph() {
  if (!config.postgresUrl) {
    throw new Error("DATABASE_URL/POSTGRES_URL is required for the PostgreSQL graph");
  }

  const saver = PostgresSaver.fromConnString(config.postgresUrl);
  await saver.setup();

  return { saver, graph: buildInterviewGraph(saver) };
}

export const interviewGraphV2 = buildInterviewGraph();
