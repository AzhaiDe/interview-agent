/**
 * LangGraph V2 - 完整版（集成所有模块）
 *
 * 集成模块：
 * 1. RAG 知识库检索
 * 2. 动态策略选择
 * 3. 异常处理和降级
 * 4. 可观测性
 * 5. 记忆系统集成
 * 6. Prompt 注册表
 * 7. 模型分层调用
 * 8. 动态轮次控制
 *
 * 节点流程：
 * START → load_context → retrieve_knowledge → select_strategy → compose_question
 * → question_guard → wait_for_answer → evaluate_answer → update_belief
 * → make_round_decision → converge → (循环或 END)
 */

import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { config } from "../config.js";

// 导入所有模块
import { retrieveKnowledgePack, generateQuestionFromKnowledge, type KnowledgePack } from "./modules/langgraph-rag.js";
import { makeStrategyDecision, generateQuestionByStrategy, type StrategyDecision } from "./modules/langgraph-strategy.js";
import { modelCallWithResilience, fallbackToRuleEngine } from "./modules/langgraph-resilience.js";
import { Observability, generateTraceId } from "./modules/langgraph-observability.js";
import { createOmniMemory, type OmniMemory } from "./modules/langgraph-memory.js";
import { promptRegistry } from "./modules/langgraph-prompt-registry.js";
import { modelSelector, smartModelCall, type TaskType } from "./modules/langgraph-model-tier.js";
import { roundController, type RoundDecision } from "./modules/langgraph-round-control.js";
import { evaluateAnswer, type JudgeAggregate, type EvaluationResult } from "./langgraph-evaluator-v2.js";

// ============ 状态定义 ============

function channel<T>(fallback: T) {
  return Annotation<T>({
    reducer: (_left: T, right: T) => right,
    default: () => fallback,
  });
}

export const InterviewGraphState = Annotation.Root({
  // 基础信息
  sessionId: Annotation<string>(),
  targetRole: Annotation<string>(),
  pressure: Annotation<string>(),
  candidateId: channel<string | undefined>(undefined),

  // 面试内容
  answer: channel(""),
  question: channel(""),
  mappedSkill: channel(""),
  strategy: channel<string>("deep_dive"),

  // 知识库
  knowledgePack: channel<KnowledgePack | undefined>(undefined),

  // 策略决策
  strategyDecision: channel<StrategyDecision | undefined>(undefined),

  // 证据和信念
  evidence: channel<string[]>([]),
  belief: channel<Record<string, number>>({}),
  beliefUncertainty: channel<Record<string, number>>({}),
  evidenceClaims: channel<Array<{
    claim: string;
    polarity: "supports" | "contradicts" | "unknown";
    confidence: number;
  }>>([]),

  // 评审结果
  aggregateResult: channel<Partial<JudgeAggregate>>({}),
  evaluationResult: channel<EvaluationResult | undefined>(undefined),

  // 人工复核
  review: channel<{ required: boolean; reason?: string }>({ required: false }),

  // 记忆
  memoryEventIds: channel<string[]>([]),
  omniMemory: channel<OmniMemory | undefined>(undefined),

  // 轮次控制
  node: channel("start"),
  nextAction: channel<"answer" | "finished">("answer"),
  round: channel(0),
  roundDecision: channel<RoundDecision | undefined>(undefined),
  priorAnswers: channel<string[]>([]),
  priorQuestions: channel<string[]>([]),

  // 追踪
  trace: channel<string[]>([]),
  traceId: channel<string>(""),

  // 可观测性
  observability: channel<Observability | undefined>(undefined),

  // 模型调用统计
  modelCalls: channel(0),
  judgesUsed: channel<string[]>([]),
  totalCost: channel(0),
  totalLatencyMs: channel(0),
});

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

/**
 * 节点 1：load_context - 加载上下文
 */
const loadContext = async (state: InterviewGraphStateType) => {
  const traceId = generateTraceId();
  const observability = new Observability({
    minLevel: "info",
    sessionId: state.sessionId,
  });

  // 初始化 OmniMemory
  const omniMemory = createOmniMemory(state.sessionId, state.targetRole);

  // 记录面试开始
  await omniMemory.recordInterviewStart({
    candidateId: state.candidateId,
    pressure: state.pressure,
  });

  observability.logger.info("interview_start", {
    targetRole: state.targetRole,
    pressure: state.pressure,
  });

  return {
    ...appendTrace(state, "load_context"),
    traceId,
    observability,
    omniMemory,
    evidence: state.evidence.length ? state.evidence : [`${state.targetRole}:核心能力待验证`],
  };
};

/**
 * 节点 2：retrieve_knowledge - 检索知识库
 */
const retrieveKnowledge = (state: InterviewGraphStateType) => {
  const skill = state.mappedSkill || "problem_solving";

  // 检索知识包
  const knowledgePack = retrieveKnowledgePack(
    state.targetRole,
    skill,
    state.pressure
  );

  if (state.observability) {
    state.observability.logger.info("knowledge_retrieved", {
      skill,
      questionsCount: knowledgePack.questions.length,
      bestPracticesCount: knowledgePack.bestPractices.length,
    });
  }

  return {
    ...appendTrace(state, "retrieve_knowledge"),
    knowledgePack,
  };
};

/**
 * 节点 3：select_strategy - 选择策略
 */
const selectStrategy = async (state: InterviewGraphStateType) => {
  const currentSkill = state.mappedSkill || "problem_solving";

  // 做出策略决策
  const decision = makeStrategyDecision(
    currentSkill,
    state.belief,
    state.beliefUncertainty,
    state.priorAnswers.reduce((acc, _, idx) => {
      const skill = state.mappedSkill || "problem_solving";
      acc[skill] = (acc[skill] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  );

  // 记录策略决策到记忆
  if (state.omniMemory) {
    await state.omniMemory.recordStrategyDecision({
      strategy: decision.strategy,
      mappedSkill: decision.mappedSkill,
      reason: decision.reason,
      confidence: decision.confidence,
    });
  }

  if (state.observability) {
    state.observability.logger.info("strategy_selected", {
      strategy: decision.strategy,
      mappedSkill: decision.mappedSkill,
      confidence: decision.confidence,
    });
  }

  return {
    ...appendTrace(state, "select_strategy"),
    mappedSkill: decision.mappedSkill,
    strategy: decision.strategy,
    strategyDecision: decision,
  };
};

/**
 * 节点 4：compose_question - 生成问题
 */
const composeQuestion = (state: InterviewGraphStateType) => {
  let question = "";

  // 优先使用知识库和策略生成问题
  if (state.knowledgePack && state.strategyDecision) {
    question = generateQuestionByStrategy(
      state.strategyDecision.strategy as any,
      state.mappedSkill,
      state.targetRole,
      state.knowledgePack,
      state.round
    );
  }

  // 如果知识库没有生成问题，使用 Prompt 注册表
  if (!question) {
    try {
      question = promptRegistry.render("compose_question", {
        targetRole: state.targetRole,
        skill: state.mappedSkill,
        pressure: state.pressure,
      });
    } catch (error) {
      // 使用默认问题
      const defaultQuestions: Record<string, string> = {
        problem_solving: `请结合${state.targetRole}经历，说明你如何解决一个复杂问题？`,
        system_design: `请描述你在${state.targetRole}中参与的系统设计，包括架构决策和权衡？`,
        technical_depth: `请深入讲解你在${state.targetRole}中使用的核心技术，包括原理和边界？`,
        project_execution: `请描述你在${state.targetRole}中负责的项目，包括职责、指标和验证？`,
      };
      question = defaultQuestions[state.mappedSkill] || defaultQuestions.problem_solving;
    }
  }

  return {
    ...appendTrace(state, "compose_question"),
    question,
  };
};

/**
 * 节点 5：question_guard - 问题守卫
 */
const questionGuard = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "question_guard"),
  question: state.question.trim() || `请描述一个你最具挑战性的${state.targetRole}项目？`,
});

/**
 * 节点 6：wait_for_answer - 等待回答
 */
const waitForAnswer = (state: InterviewGraphStateType) => ({
  ...appendTrace(state, "wait_for_answer"),
  nextAction: "answer" as const,
});

/**
 * 节点 7：evaluate_answer - 评估回答（核心节点）
 */
const evaluateAnswerNode = async (state: InterviewGraphStateType) => {
  const skill = state.mappedSkill || "problem_solving";
  const answer = state.answer || "";

  // 记录候选人回答到记忆
  if (state.omniMemory) {
    await state.omniMemory.recordInterviewAnswer({
      question: state.question,
      answer,
      skill,
      round: state.round + 1,
    });
  }

  // 调用多维度评审系统（集成模型调用和降级策略）
  let result: EvaluationResult;

  try {
    result = await evaluateAnswer(
      answer,
      skill,
      state.sessionId,
      state.round + 1,
      state.priorAnswers,
      state.question,
      state.targetRole
    );

    // 记录模型调用统计
    if (state.observability) {
      state.observability.logger.info("evaluation_complete", {
        score: result.score,
        modelCalls: result.modelCalls,
        judgesUsed: result.judgesUsed,
      });
    }
  } catch (error) {
    // 降级到规则引擎
    if (state.observability) {
      state.observability.logger.error("evaluation_failed", error instanceof Error ? error : undefined);
    }

    const fallbackResult = fallbackToRuleEngine(answer, skill);
    result = {
      score: fallbackResult.score,
      confidence: fallbackResult.confidence,
      verdict: fallbackResult.verdict,
      feedback: fallbackResult.feedback,
      evidenceClaims: [],
      needsHumanReview: false,
      aggregate: {
        score: fallbackResult.score,
        confidence: fallbackResult.confidence,
        spread: 0,
        weights: {},
        needsHumanReview: false,
        judges: [],
      },
      judgesUsed: ["rule_engine_fallback"],
      modelCalls: 0,
    };
  }

  // 记录评估结果到记忆
  if (state.omniMemory) {
    await state.omniMemory.recordInterviewEvaluation({
      skill,
      score: result.score,
      verdict: result.verdict,
      confidence: result.confidence,
      evidence: result.evidenceClaims.map((e) => e.claim),
      feedback: result.feedback,
      round: state.round + 1,
    });
  }

  return {
    ...appendTrace(state, "evaluate_answer"),
    answer: "",
    aggregateResult: result.aggregate,
    evaluationResult: result,
    evidenceClaims: result.evidenceClaims,
    review: {
      required: result.needsHumanReview,
      reason: result.needsHumanReview
        ? `评审分歧过大 (spread=${result.aggregate.spread}) 或置信度过低 (confidence=${result.aggregate.confidence})，需要人工复核`
        : undefined,
    },
    modelCalls: result.modelCalls,
    judgesUsed: result.judgesUsed,
  };
};

/**
 * 节点 8：update_belief - 更新信念
 */
const updateBeliefNode = async (state: InterviewGraphStateType) => {
  const skill = state.mappedSkill || "problem_solving";
  const evalResult = state.evaluationResult;

  if (!evalResult || !evalResult.aggregate) {
    return appendTrace(state, "update_belief");
  }

  // 更新技能信念（贝叶斯更新）
  const currentBelief = state.belief[skill] ?? 2.5;
  const currentUncertainty = state.beliefUncertainty[skill] ?? 1.0;

  const { meanLevel, uncertainty } = updateBelief(
    currentBelief,
    currentUncertainty,
    evalResult.score,
    evalResult.aggregate.judges[0]?.evidenceCovered.length || 0
  );

  // 记录信念更新到记忆
  if (state.omniMemory) {
    await state.omniMemory.recordSkillBeliefUpdate({
      skill,
      oldBelief: currentBelief,
      newBelief: meanLevel,
      uncertainty,
      reason: `评分 ${evalResult.score}，证据数 ${evalResult.aggregate.judges[0]?.evidenceCovered.length || 0}`,
    });
  }

  if (state.observability) {
    state.observability.logger.info("belief_updated", {
      skill,
      oldBelief: currentBelief,
      newBelief: meanLevel,
      uncertainty,
    });
  }

  return {
    ...appendTrace(state, "update_belief"),
    belief: { ...state.belief, [skill]: meanLevel },
    beliefUncertainty: { ...state.beliefUncertainty, [skill]: uncertainty },
  };
};

/**
 * 节点 9：make_round_decision - 轮次决策
 */
const makeRoundDecisionNode = (state: InterviewGraphStateType) => {
  const decision = roundController.decide(
    state.round + 1,
    state.belief,
    state.beliefUncertainty
  );

  if (state.observability) {
    state.observability.logger.info("round_decision", {
      action: decision.action,
      reason: decision.reason,
      confidence: decision.confidence,
    });
  }

  return {
    ...appendTrace(state, "make_round_decision"),
    roundDecision: decision,
  };
};

/**
 * 节点 10：converge - 收敛
 */
const converge = (state: InterviewGraphStateType) => {
  const decision = state.roundDecision;

  if (!decision) {
    return {
      ...appendTrace(state, "converge"),
      nextAction: state.round >= 3 ? "finished" as const : "answer" as const,
    };
  }

  let nextAction: "answer" | "finished";

  if (decision.action === "finish") {
    nextAction = "finished";
  } else if (decision.action === "extend" || decision.action === "continue") {
    nextAction = "answer";
  } else {
    nextAction = state.round >= 3 ? "finished" : "answer";
  }

  // 如果需要人工复核，直接结束
  if (state.review?.required) {
    nextAction = "finished";
  }

  return {
    ...appendTrace(state, "converge"),
    nextAction,
    round: state.round + 1,
    priorAnswers: state.answer ? [...state.priorAnswers, state.answer] : state.priorAnswers,
    priorQuestions: state.question ? [...state.priorQuestions, state.question] : state.priorQuestions,
  };
};

function routeAfterConverge(state: InterviewGraphStateType) {
  if (state.nextAction === "finished") return END;
  return "retrieve_knowledge";
}

// ============ 图构建 ============

export function buildInterviewGraph(checkpointer: any = new MemorySaver()): any {
  return new StateGraph(InterviewGraphState)
    .addNode("load_context", loadContext)
    .addNode("retrieve_knowledge", retrieveKnowledge)
    .addNode("select_strategy", selectStrategy)
    .addNode("compose_question", composeQuestion)
    .addNode("question_guard", questionGuard)
    .addNode("wait_for_answer", waitForAnswer)
    .addNode("evaluate_answer", evaluateAnswerNode)
    .addNode("update_belief", updateBeliefNode)
    .addNode("make_round_decision", makeRoundDecisionNode)
    .addNode("converge", converge)

    .addEdge(START, "load_context")
    .addEdge("load_context", "retrieve_knowledge")
    .addEdge("retrieve_knowledge", "select_strategy")
    .addEdge("select_strategy", "compose_question")
    .addEdge("compose_question", "question_guard")
    .addEdge("question_guard", "wait_for_answer")
    .addEdge("evaluate_answer", "update_belief")
    .addEdge("update_belief", "make_round_decision")
    .addEdge("make_round_decision", "converge")

    .addConditionalEdges(
      "wait_for_answer",
      (state) => (state.answer?.trim() ? "evaluate_answer" : END),
      { evaluate_answer: "evaluate_answer", [END]: END }
    )
    .addConditionalEdges(
      "converge",
      routeAfterConverge,
      { retrieve_knowledge: "retrieve_knowledge", [END]: END }
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

export const interviewGraphV2Full = buildInterviewGraph();
