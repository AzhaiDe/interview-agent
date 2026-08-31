/**
 * LangGraph V2 - 智能面试评估系统
 *
 * 基于 LangGraph 官方框架，实现多维度评审、贝叶斯信念更新、证据追踪
 *
 * 节点流程：
 * START → load_context → select_strategy → compose_question → question_guard
 * → wait_for_answer → evaluate_answer → converge → (循环或 END)
 */

import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { config } from "../config.js";
import { evaluateAnswer as evaluateAnswerLogic, type JudgeAggregate } from "./langgraph-evaluator.js";

// ============ 状态定义 ============

/**
 * 稳定的 V2 状态结构
 * 节点通过此对象通信，避免三状态同步问题
 */
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
  // 将 0-10 分映射到 1-5
  const observed = Math.max(1, Math.min(5, score / 2));

  // 信息增益：证据越多，信息量越大
  const info = Math.min(0.35, 0.08 + evidenceCount * 0.045);

  // 贝叶斯更新
  const meanLevel = Number((currentBelief + info * (observed - currentBelief)).toFixed(3));
  const uncertainty = Number(Math.max(0.1, currentUncertainty * (1 - info)).toFixed(3));

  return { meanLevel, uncertainty };
}

// ============ 节点实现 ============

/**
 * 节点 1：load_context - 加载上下文
 * 初始化面试上下文，设置默认证据提示
 */
const loadContext = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "load_context"),
  evidence: state.evidence.length ? state.evidence : [`${state.targetRole}:核心能力待验证`],
});

/**
 * 节点 2：select_strategy - 选择策略
 * 确定当前考察的技能
 */
const selectStrategy = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "select_strategy"),
  mappedSkill: state.mappedSkill || "problem_solving",
});

/**
 * 节点 3：compose_question - 生成问题
 * 基于目标岗位和技能生成面试问题
 */
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

/**
 * 节点 4：question_guard - 问题质量检查
 * 验证问题质量，避免空问题
 */
const questionGuard = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "question_guard"),
  question: state.question.trim() || `请描述一个你最具挑战性的${state.targetRole}项目？`,
});

/**
 * 节点 5：wait_for_answer - 等待回答
 * 中断节点，等待候选人输入回答
 */
const waitForAnswer = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "wait_for_answer"),
  nextAction: "answer" as const,
});

/**
 * 节点 6：evaluate_answer - 评估回答  核心节点
 *
 * 多维度评审：
 * 1. 确定性评审（Base Judge）- 证据覆盖度、注入检测、跑题检测
 * 2. 加权聚合 - 多评审器结果聚合
 * 3. 贝叶斯信念更新 - 动态更新技能评分
 * 4. 人工复核判断 - 分歧检测
 */
const evaluateAnswer = (state: InterviewGraphStateType) => {
  const skill = state.mappedSkill || "problem_solving";
  const answer = state.answer || "";

  // 调用多维度评审系统（从 langgraph-evaluator 导入）
  const result = evaluateAnswerLogic(
    answer,
    skill,
    state.sessionId,
    state.round + 1,
    state.priorAnswers
  );

  // 更新技能信念（贝叶斯更新）
  const currentBelief = state.belief[skill] ?? 2.5;  // 初始信念 2.5/5
  const currentUncertainty = state.beliefUncertainty[skill] ?? 1.0;  // 初始不确定性 100%

  const { meanLevel, uncertainty } = updateBelief(
    currentBelief,
    currentUncertainty,
    result.score,
    result.aggregate.judges[0]?.evidenceCovered.length || 0
  );

  // 生成记忆事件 ID
  const eventId = `v2:${state.sessionId}:${state.round + 1}`;
  const reviewRequired = result.needsHumanReview || result.score < 4.5;

  return {
    ...appendTrace(state, "evaluate_answer"),
    answer: "",  // 清空回答（避免重复处理）

    // 多维度评审结果
    aggregateResult: result.aggregate,
    evidenceClaims: result.evidenceClaims,

    // 人工复核判断
    review: {
      required: reviewRequired,
      reason: reviewRequired
        ? result.needsHumanReview
          ? `评审分歧过大 (spread=${result.aggregate.spread}) 或置信度过低 (confidence=${result.aggregate.confidence})，需要人工复核`
          : `回答证据不足 (score=${result.score})，需要人工复核`
        : undefined,
    },

    // 信念更新
    belief: {
      ...state.belief,
      [skill]: meanLevel,
    },
    beliefUncertainty: {
      ...state.beliefUncertainty,
      [skill]: uncertainty,
    },

    // 轮次递增
    round: state.round + 1,

    // 记录历史回答（用于一致性检测）
    priorAnswers: [...state.priorAnswers, answer],

    // 记忆事件
    memoryEventIds: [...state.memoryEventIds, eventId],
  };
};

/**
 * 节点 7：converge - 汇聚/决策
 * 根据轮次和状态决定下一步
 */
const converge = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "converge"),
  nextAction: state.round >= 3 ? "finished" as const : "answer" as const,
});

/**
 * 条件边路由：converge 之后
 */
function routeAfterConverge(state: InterviewGraphStateType) {
  if (state.nextAction === "finished") return END;
  if (state.review?.required) return END;  // 需要人工复核时结束
  return "compose_question";
}

// ============ 图构建 ============

/**
 * 构建面试图（默认使用内存检查点）
 */
export function buildInterviewGraph(checkpointer: any = new MemorySaver()): any {
  return new StateGraph(InterviewGraphState)
    .addNode("load_context", loadContext)
    .addNode("select_strategy", selectStrategy)
    .addNode("compose_question", composeQuestion)
    .addNode("question_guard", questionGuard)
    .addNode("wait_for_answer", waitForAnswer)
    .addNode("evaluate_answer", evaluateAnswer)
    .addNode("converge", converge)

    // 固定边
    .addEdge(START, "load_context")
    .addEdge("load_context", "select_strategy")
    .addEdge("select_strategy", "compose_question")
    .addEdge("compose_question", "question_guard")
    .addEdge("question_guard", "wait_for_answer")
    .addEdge("evaluate_answer", "converge")

    // 条件边
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

/**
 * 构建 PostgreSQL 面试图（生产环境）
 */
export async function buildPostgresInterviewGraph() {
  if (!config.postgresUrl) {
    throw new Error("DATABASE_URL/POSTGRES_URL is required for the PostgreSQL graph");
  }

  const saver = PostgresSaver.fromConnString(config.postgresUrl);
  await saver.setup();

  return {
    saver,
    graph: buildInterviewGraph(saver),
  };
}

// 默认导出（内存检查点版本）
export const interviewGraphV2 = buildInterviewGraph();
