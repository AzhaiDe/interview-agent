/**
 * LangGraph V2 - 多维度评审系统 v2（集成模型调用）
 *
 * 功能：
 * 1. 确定性评审（Base Judge）- 规则引擎，快速响应
 * 2. 模型评审（4 类 Judge）- 调用百炼 API，智能评审
 *    - Technical: 技术正确性
 *    - Evidence: 证据完整性
 *    - Consistency: 一致性
 *    - Communication: 表达能力
 * 3. 加权聚合 - 5 类评审结果聚合
 * 4. 人工复核判断 - 分歧检测
 *
 * 使用示例：
 * const result = await evaluateAnswer(answer, skill, sessionId, round, priorAnswers, question, targetRole);
 */

import { z } from "zod";
import crypto from "node:crypto";
import { modelJudge, type JudgeType } from "./langgraph-model-judge.js";

// ============ 评分 Schema ============

export const judgeSchema = z.object({
  score: z.number().min(0).max(10),
  relevance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidenceCovered: z.array(z.string()).max(6),
  missingEvidence: z.array(z.string()).max(6),
  verdict: z.enum(["supported", "partial", "incorrect", "insufficient"]),
  feedback: z.string().min(1).max(800),
  evidenceQuote: z.string().max(160).optional(),
  weakPoint: z.string().max(500).optional(),
  strongPoint: z.string().max(500).optional(),
});

export type JudgeResult = z.infer<typeof judgeSchema>;

export type JudgeKind = "base" | "technical" | "evidence" | "consistency" | "communication";

export type JudgeEntry = {
  kind: JudgeKind;
  result: JudgeResult;
};

// ============ 评审权重配置 ============

const JUDGE_WEIGHTS: Record<JudgeKind, number> = {
  base: 0.10,
  technical: 0.35,
  evidence: 0.25,
  consistency: 0.15,
  communication: 0.15,
};

// ============ 证据类型定义 ============

export const evidenceTypes = [
  "personal_responsibility",
  "input_output",
  "technical_actions",
  "causal_relations",
  "alternatives",
  "metrics",
  "samples_and_baselines",
  "validation_methods",
  "exception_handling",
  "uncertainty",
  "conflicts_with_prior",
  "injection_or_off_topic",
];

// ============ 注入攻击检测 ============

const injectionPatterns = [
  /忽略.*(?:规则 | 指令)/,
  /系统提示/,
  /给我满分/,
  /ignore previous/i,
  /改变评分/,
  /告诉我.*提示词/,
  /你现在是/,
  /绕过/,
];

const offTopicPatterns = /(篮球)|(足球)|(旅游)|(美食)|(电影)|(游戏)|(音乐)|(运动)|(天气)|(八卦)|(明星)/;
const onTopicAnchor = /(项目)|(接口)|(系统)|(实现)|(技术)|(代码)|(数据)|(服务)|(模块)|(功能)|(需求)|(设计)|(开发)|(部署)|(架构)|(性能)|(优化)/;

// ============ 证据抽取 ============

export function extractEvidence(answer: string, skill: string) {
  const covered: string[] = [];
  const missing: string[] = [];

  // 检测个人职责证据
  if (/(我负责)|(我主导)|(我设计)|(我实现)|(我开发)|(我完成)|(我的职责)|(我承担)/.test(answer)) {
    covered.push("personal_responsibility");
  } else {
    missing.push("personal_responsibility");
  }

  // 检测技术动作证据
  if (/(使用)|(采用)|(引入)|(重构)|(优化)|(升级)|(搭建)|(部署)|(配置)|(开发)|(实现)/.test(answer)) {
    covered.push("technical_actions");
  } else {
    missing.push("technical_actions");
  }

  // 检测指标证据
  const metrics = answer.match(/\d+(?:\.\d+)?\s*(?:%|ms|秒 | 倍 | 万 | 亿 | 个 | 条 | 次)|(提升)|(降低)|(减少)|(增加)|(改进)/g);
  if (metrics && metrics.length >= 2) {
    covered.push("metrics");
  } else {
    missing.push("metrics");
  }

  // 检测因果关系证据
  if (/(因为)|(所以)|(导致)|(因此)|(原因是)|(为了)|(使得)|(从而)|(故而)/.test(answer)) {
    covered.push("causal_relations");
  } else {
    missing.push("causal_relations");
  }

  // 检测验证方法证据
  if (/(测试)|(验证)|(监控)|(指标)|(对比)|(A\/B)|(压测)|(评估)|(测量)|(检验)/.test(answer)) {
    covered.push("validation_methods");
  } else {
    missing.push("validation_methods");
  }

  // 检测异常处理证据
  if (/(异常)|(错误)|(失败)|(降级)|(回滚)|(容灾)|(备份)|(恢复)|(重试)|(兜底)/.test(answer)) {
    covered.push("exception_handling");
  } else {
    missing.push("exception_handling");
  }

  // 检测注入攻击
  const injection = injectionPatterns.some((pattern) => pattern.test(answer));

  // 检测跑题
  const offTopic = offTopicPatterns.test(answer) && !onTopicAnchor.test(answer);

  const quote = answer.slice(0, Math.min(160, answer.length));

  return { covered, missing, injection, offTopic, quote, skill };
}

// ============ 确定性评审器（Base Judge） ============

export function deterministicJudge(
  answer: string,
  skill: string,
  priorAnswers: string[] = []
): JudgeResult {
  const evidence = extractEvidence(answer, skill);

  // 注入攻击或跑题 → 直接低分
  if (evidence.injection || evidence.offTopic) {
    return judgeSchema.parse({
      score: 0.5,
      relevance: 0.1,
      confidence: 0.9,
      evidenceCovered: [],
      missingEvidence: evidenceTypes.slice(0, 6),
      verdict: "insufficient",
      feedback: evidence.injection ? "回答包含注入攻击。" : "回答跑题，与问题无关。",
      evidenceQuote: answer.slice(0, 120),
      weakPoint: evidence.injection ? "注入攻击" : "跑题",
    });
  }

  // 基础分：证据覆盖度
  let score = 3 + Math.min(4, evidence.covered.length * 0.8);

  // 回答长度加分
  if (answer.length >= 200) score += 1.5;
  else if (answer.length >= 100) score += 1;
  else if (answer.length >= 50) score += 0.5;
  else if (answer.length < 20) score -= 1;

  // 具体指标加分
  const specificCount = (answer.match(/\d+(?:\.\d+)?\s*(?:%|ms|秒 | 倍 | 万 | 亿 | 个 | 条 | 次)/g) || []).length;
  score += Math.min(1.5, specificCount * 0.3);

  // 一致性检测
  let consistencyPenalty = 0;
  if (priorAnswers.length > 0) {
    const lastAnswer = priorAnswers[priorAnswers.length - 1];
    if (/矛盾 | 不一致 | 冲突/.test(answer) && /矛盾 | 不一致 | 冲突/.test(lastAnswer)) {
      consistencyPenalty = 1.5;
    }
  }

  score = Math.max(0, Math.min(10, score - consistencyPenalty));
  const verdict = score >= 7 ? "supported" : score >= 4.5 ? "partial" : "insufficient";

  return judgeSchema.parse({
    score: Number(score.toFixed(1)),
    relevance: 0.9,
    confidence: evidence.covered.length >= 3 ? 0.78 : 0.62,
    evidenceCovered: evidence.covered,
    missingEvidence: evidence.missing.slice(0, 6),
    verdict,
    feedback: verdict === "supported"
      ? "回答包含可验证的职责、机制或结果证据。"
      : "回答仍缺少可验证的机制、指标或边界证据。",
    evidenceQuote: evidence.quote,
    weakPoint: evidence.missing.length ? `缺少${evidence.missing.slice(0, 2).join("、")}` : undefined,
    strongPoint: evidence.covered.length ? `已覆盖${evidence.covered.slice(0, 2).join("、")}` : undefined,
  });
}

// ============ 评审聚合 ============

export type JudgeAggregate = {
  score: number;
  confidence: number;
  spread: number;
  weights: Record<string, number>;
  needsHumanReview: boolean;
  judges: Array<{ kind: JudgeKind; score: number; confidence: number; verdict: string; evidenceCovered: string[] }>;
};

export function aggregateJudges(entries: JudgeEntry[]): JudgeAggregate {
  const denominator = entries.reduce((sum, e) => sum + (JUDGE_WEIGHTS[e.kind] || 0), 0) || 1;
  const weights = Object.fromEntries(
    Object.entries(JUDGE_WEIGHTS).map(([kind, weight]) => [
      kind,
      entries.some((e) => e.kind === kind) ? Number((weight / denominator).toFixed(4)) : 0,
    ])
  );

  const score = Number(
    entries.reduce((sum, e) => sum + e.result.score * (weights[e.kind] || 0), 0).toFixed(1)
  );

  const confidence = Number(
    entries.reduce((sum, e) => sum + e.result.confidence * (weights[e.kind] || 0), 0).toFixed(2)
  );

  const scores = entries.map((e) => e.result.score);
  const spread = scores.length ? Math.max(...scores) - Math.min(...scores) : 10;
  const needsHumanReview = spread >= 3 || confidence < 0.55;

  return {
    score,
    confidence,
    spread,
    weights,
    needsHumanReview,
    judges: entries.map((e) => ({
      kind: e.kind,
      score: e.result.score,
      confidence: e.result.confidence,
      verdict: e.result.verdict,
      evidenceCovered: e.result.evidenceCovered,
    })),
  };
}

// ============ 完整评审流程（集成模型调用） ============

export type EvaluationResult = {
  score: number;
  confidence: number;
  verdict: string;
  feedback: string;
  evidenceClaims: Array<{ claim: string; polarity: "supports" | "contradicts" | "unknown"; confidence: number }>;
  needsHumanReview: boolean;
  aggregate: JudgeAggregate;
  judgesUsed: Array<JudgeKind | "rule_engine_fallback">;
  modelCalls: number;
};

/**
 * 多维度评审（异步，集成模型调用）
 *
 * @param answer - 候选人回答
 * @param skill - 考察技能
 * @param sessionId - 会话 ID
 * @param round - 轮次
 * @param priorAnswers - 历史回答
 * @param question - 面试问题
 * @param targetRole - 目标岗位
 * @returns 评审结果
 */
export async function evaluateAnswer(
  answer: string,
  skill: string,
  sessionId: string,
  round: number,
  priorAnswers: string[] = [],
  question: string = "",
  targetRole: string = ""
): Promise<EvaluationResult> {
  // 1. 确定性评审（Base Judge）- 始终执行
  const base = deterministicJudge(answer, skill, priorAnswers);

  // 2. 模型评审（4 类 Judge 并行）
  const modelJudges: JudgeEntry[] = [];
  let modelCalls = 0;

  const judgeTypes: JudgeType[] = ["technical", "evidence", "consistency", "communication"];
  const results = await Promise.allSettled(
    judgeTypes.map((type) =>
      modelJudge(answer, skill, question, targetRole, type, priorAnswers)
    )
  );

  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value !== null) {
      modelJudges.push({
        kind: judgeTypes[index] as JudgeKind,
        result: result.value,
      });
      modelCalls++;
    }
  });

  // 3. 聚合所有评审结果
  const allEntries: JudgeEntry[] = [
    { kind: "base", result: base },
    ...modelJudges,
  ];

  const aggregate = aggregateJudges(allEntries);

  // 4. 生成证据声明
  const evidenceClaims = aggregate.judges.map((judge) => ({
    claim: `${skill} - ${judge.verdict}`,
    polarity: judge.verdict === "supported" ? "supports" as const : judge.verdict === "incorrect" ? "contradicts" as const : "unknown" as const,
    confidence: judge.confidence,
  }));

  return {
    score: aggregate.score,
    confidence: aggregate.confidence,
    verdict: base.verdict,
    feedback: base.feedback,
    evidenceClaims,
    needsHumanReview: aggregate.needsHumanReview,
    aggregate,
    judgesUsed: allEntries.map((e) => e.kind),
    modelCalls,
  };
}

// 同步版本（仅规则引擎，用于测试）
export function evaluateAnswerSync(
  answer: string,
  skill: string,
  sessionId: string,
  round: number,
  priorAnswers: string[] = []
): Omit<EvaluationResult, "modelCalls" | "judgesUsed"> {
  const base = deterministicJudge(answer, skill, priorAnswers);
  const entries: JudgeEntry[] = [{ kind: "base", result: base }];
  const aggregate = aggregateJudges(entries);

  const evidenceClaims = aggregate.judges.map((judge) => ({
    claim: `${skill} - ${judge.verdict}`,
    polarity: judge.verdict === "supported" ? "supports" as const : judge.verdict === "incorrect" ? "contradicts" as const : "unknown" as const,
    confidence: judge.confidence,
  }));

  return {
    score: aggregate.score,
    confidence: aggregate.confidence,
    verdict: base.verdict,
    feedback: base.feedback,
    evidenceClaims,
    needsHumanReview: aggregate.needsHumanReview,
    aggregate,
  };
}
