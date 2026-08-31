/**
 * 模型分层调用模块
 *
 * 功能：
 * 1. 模型层级定义（fast/standard/reasoning）
 * 2. 根据任务复杂度自动选择模型
 * 3. 成本优化策略
 * 4. 与模型调用集成
 */

import { config } from "../../config.js";

// ============ 模型层级定义 ============

export type ModelTier = "fast" | "standard" | "reasoning";

export type ModelConfig = {
  tier: ModelTier;
  name: string;
  maxTokens: number;
  temperature: number;
  costPerToken: number;
  latencyEstimate: number; // 毫秒
};

// ============ 模型配置 ============

const MODEL_CONFIGS: Record<ModelTier, ModelConfig> = {
  fast: {
    tier: "fast",
    name: config.model.fast || "qwen-turbo",
    maxTokens: 2000,
    temperature: 0.1,
    costPerToken: 0.0008, // 每 1K tokens 成本（元）
    latencyEstimate: 500,
  },
  standard: {
    tier: "standard",
    name: config.model.standard || "qwen3.7-plus",
    maxTokens: 4000,
    temperature: 0.05,
    costPerToken: 0.002,
    latencyEstimate: 1500,
  },
  reasoning: {
    tier: "reasoning",
    name: config.model.reasoning || "qwen3-max",
    maxTokens: 8000,
    temperature: 0.02,
    costPerToken: 0.02,
    latencyEstimate: 5000,
  },
};

// ============ 任务类型定义 ============

export type TaskType =
  | "evidence_extraction"     // 证据抽取（简单）
  | "basic_evaluation"        // 基础评估（中等）
  | "technical_judge"         // 技术评审（复杂）
  | "evidence_judge"          // 证据评审（中等）
  | "consistency_judge"       // 一致性评审（复杂）
  | "communication_judge"     // 表达评审（简单）
  | "strategy_selection"      // 策略选择（中等）
  | "question_generation"     // 问题生成（中等）
  | "feedback_generation"     // 反馈生成（简单）
  | "interview_summary";      // 面试总结（复杂）

// ============ 任务复杂度配置 ============

export type TaskComplexity = {
  type: TaskType;
  recommendedTier: ModelTier;
  estimatedTokens: number;
  priority: "low" | "medium" | "high";
  description: string;
};

const TASK_COMPLEXITY: Record<TaskType, TaskComplexity> = {
  evidence_extraction: {
    type: "evidence_extraction",
    recommendedTier: "fast",
    estimatedTokens: 500,
    priority: "low",
    description: "简单的文本匹配和提取",
  },
  basic_evaluation: {
    type: "basic_evaluation",
    recommendedTier: "standard",
    estimatedTokens: 1000,
    priority: "medium",
    description: "基础的回答评估",
  },
  technical_judge: {
    type: "technical_judge",
    recommendedTier: "reasoning",
    estimatedTokens: 2000,
    priority: "high",
    description: "深度技术评审，需要推理能力",
  },
  evidence_judge: {
    type: "evidence_judge",
    recommendedTier: "standard",
    estimatedTokens: 1500,
    priority: "medium",
    description: "证据完整性评审",
  },
  consistency_judge: {
    type: "consistency_judge",
    recommendedTier: "reasoning",
    estimatedTokens: 2000,
    priority: "high",
    description: "一致性分析，需要对比历史",
  },
  communication_judge: {
    type: "communication_judge",
    recommendedTier: "fast",
    estimatedTokens: 800,
    priority: "low",
    description: "表达能力评审，相对简单",
  },
  strategy_selection: {
    type: "strategy_selection",
    recommendedTier: "standard",
    estimatedTokens: 1000,
    priority: "medium",
    description: "策略选择决策",
  },
  question_generation: {
    type: "question_generation",
    recommendedTier: "standard",
    estimatedTokens: 1200,
    priority: "medium",
    description: "面试问题生成",
  },
  feedback_generation: {
    type: "feedback_generation",
    recommendedTier: "fast",
    estimatedTokens: 800,
    priority: "low",
    description: "反馈文本生成",
  },
  interview_summary: {
    type: "interview_summary",
    recommendedTier: "reasoning",
    estimatedTokens: 3000,
    priority: "high",
    description: "面试总结，需要综合分析",
  },
};

// ============ 模型选择器 ============

export class ModelSelector {
  private costBudget?: number; // 总成本预算（元）
  private latencyBudget?: number; // 总延迟预算（毫秒）
  private totalCost: number = 0;
  private totalLatency: number = 0;

  constructor(options: {
    costBudget?: number;
    latencyBudget?: number;
  } = {}) {
    this.costBudget = options.costBudget;
    this.latencyBudget = options.latencyBudget;
  }

  /**
   * 根据任务类型选择模型层级
   */
  selectTier(taskType: TaskType): ModelTier {
    const complexity = TASK_COMPLEXITY[taskType];
    return complexity.recommendedTier;
  }

  /**
   * 根据任务类型和约束选择模型层级
   */
  selectTierWithConstraints(taskType: TaskType): ModelTier {
    const complexity = TASK_COMPLEXITY[taskType];
    let recommendedTier = complexity.recommendedTier;

    // 如果有成本预算，检查是否超出
    if (this.costBudget) {
      const remainingBudget = this.costBudget - this.totalCost;
      const estimatedCost = this.estimateCost(recommendedTier, complexity.estimatedTokens);

      if (estimatedCost > remainingBudget) {
        // 降级到更便宜的模型
        recommendedTier = this.downgradeTier(recommendedTier);
      }
    }

    // 如果有延迟预算，检查是否超出
    if (this.latencyBudget) {
      const remainingLatency = this.latencyBudget - this.totalLatency;
      const config = MODEL_CONFIGS[recommendedTier];

      if (config.latencyEstimate > remainingLatency) {
        // 降级到更快的模型
        recommendedTier = this.downgradeTier(recommendedTier);
      }
    }

    return recommendedTier;
  }

  /**
   * 降级模型层级
   */
  private downgradeTier(tier: ModelTier): ModelTier {
    switch (tier) {
      case "reasoning":
        return "standard";
      case "standard":
        return "fast";
      case "fast":
        return "fast"; // 已经是最低级
    }
  }

  /**
   * 升级模型层级
   */
  private upgradeTier(tier: ModelTier): ModelTier {
    switch (tier) {
      case "fast":
        return "standard";
      case "standard":
        return "reasoning";
      case "reasoning":
        return "reasoning"; // 已经是最高级
    }
  }

  /**
   * 估算成本
   */
  estimateCost(tier: ModelTier, tokens: number): number {
    const config = MODEL_CONFIGS[tier];
    return (tokens / 1000) * config.costPerToken;
  }

  /**
   * 记录实际成本
   */
  recordCost(tier: ModelTier, actualTokens: number): void {
    const cost = this.estimateCost(tier, actualTokens);
    this.totalCost += cost;
  }

  /**
   * 记录实际延迟
   */
  recordLatency(latencyMs: number): void {
    this.totalLatency += latencyMs;
  }

  /**
   * 获取成本统计
   */
  getCostStats(): {
    totalCost: number;
    remainingBudget: number;
    costByTier: Record<ModelTier, number>;
  } {
    return {
      totalCost: this.totalCost,
      remainingBudget: this.costBudget ? this.costBudget - this.totalCost : Infinity,
      costByTier: {
        fast: 0,
        standard: 0,
        reasoning: 0,
      },
    };
  }

  /**
   * 获取延迟统计
   */
  getLatencyStats(): {
    totalLatency: number;
    remainingBudget: number;
  } {
    return {
      totalLatency: this.totalLatency,
      remainingBudget: this.latencyBudget ? this.latencyBudget - this.totalLatency : Infinity,
    };
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.totalCost = 0;
    this.totalLatency = 0;
  }
}

// ============ 模型调用封装 ============

export type ModelCallOptions = {
  taskType: TaskType;
  prompt: string;
  variables?: Record<string, string | number>;
  temperature?: number;
  maxTokens?: number;
};

export type ModelCallResult<T> = {
  data: T;
  tier: ModelTier;
  latencyMs: number;
  tokensUsed: number;
  cost: number;
};

/**
 * 智能模型调用（自动选择层级）
 */
export async function smartModelCall<T>(
  callFn: (tier: ModelTier, prompt: string) => Promise<T>,
  options: ModelCallOptions,
  selector: ModelSelector
): Promise<ModelCallResult<T>> {
  const tier = selector.selectTierWithConstraints(options.taskType);
  const config = MODEL_CONFIGS[tier];

  const startTime = Date.now();
  const data = await callFn(tier, options.prompt);
  const latencyMs = Date.now() - startTime;

  // 估算 tokens（简化处理）
  const estimatedTokens = options.prompt.length / 4 + 500;

  // 记录成本和延迟
  selector.recordCost(tier, estimatedTokens);
  selector.recordLatency(latencyMs);

  const cost = selector.estimateCost(tier, estimatedTokens);

  return {
    data,
    tier,
    latencyMs,
    tokensUsed: estimatedTokens,
    cost,
  };
}

// ============ 辅助函数 ============

/**
 * 获取模型配置
 */
export function getModelConfig(tier: ModelTier): ModelConfig {
  return MODEL_CONFIGS[tier];
}

/**
 * 获取任务复杂度
 */
export function getTaskComplexity(taskType: TaskType): TaskComplexity {
  return TASK_COMPLEXITY[taskType];
}

/**
 * 获取所有任务类型
 */
export function getAllTaskTypes(): TaskType[] {
  return Object.keys(TASK_COMPLEXITY) as TaskType[];
}

// ============ 单例导出 ============

export const modelSelector = new ModelSelector();

export {
  MODEL_CONFIGS,
  TASK_COMPLEXITY,
};
