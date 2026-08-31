/**
 * 动态轮次控制模块
 *
 * 功能：
 * 1. 基于信念水平的轮次决策
 * 2. 提前结束条件
 * 3. 延长面试条件
 * 4. 与 LangGraph V2 集成
 */

// ============ 轮次决策类型 ============

export type RoundDecision = {
  action: "continue" | "finish" | "extend";
  reason: string;
  confidence: number;
  metadata: {
    currentRound: number;
    maxRounds: number;
    currentBelief: number;
    currentUncertainty: number;
    skillCoverage: number;
    overallScore: number;
  };
};

// ============ 轮次控制配置 ============

export type RoundControlConfig = {
  // 基础轮次配置
  minRounds: number;          // 最小轮次（强制）
  maxRounds: number;          // 最大轮次（强制）
  defaultRounds: number;      // 默认轮次

  // 提前结束条件
  earlyFinishThresholds: {
    belief: number;           // 信念 >= 此值可以考虑提前结束
    confidence: number;       // 置信度 >= 此值可以考虑提前结束
    minRounds: number;        // 至少完成这么多轮次
  };

  // 延长面试条件
  extendThresholds: {
    belief: number;           // 信念 < 此值可以考虑延长
    uncertainty: number;      // 不确定性 > 此值可以考虑延长
    maxExtensionRounds: number; // 最多延长多少轮次
  };

  // 技能覆盖要求
  skillCoverage: {
    requiredSkills: string[]; // 必须考察的技能
    minimumCoverage: number;  // 最低覆盖率（0-1）
  };
};

const DEFAULT_ROUND_CONTROL_CONFIG: RoundControlConfig = {
  minRounds: 2,
  maxRounds: 5,
  defaultRounds: 3,

  earlyFinishThresholds: {
    belief: 4.5,
    confidence: 0.85,
    minRounds: 3,
  },

  extendThresholds: {
    belief: 2.5,
    uncertainty: 0.7,
    maxExtensionRounds: 2,
  },

  skillCoverage: {
    requiredSkills: ["problem_solving", "system_design", "technical_depth"],
    minimumCoverage: 0.6,
  },
};

// ============ 轮次决策函数 ============

/**
 * 计算技能覆盖率
 */
export function calculateSkillCoverage(
  beliefs: Record<string, number>,
  requiredSkills: string[]
): number {
  if (requiredSkills.length === 0) return 1;

  const coveredCount = requiredSkills.filter((skill) => {
    const belief = beliefs[skill];
    return belief !== undefined && belief >= 3.0;
  }).length;

  return coveredCount / requiredSkills.length;
}

/**
 * 计算整体评分
 */
export function calculateOverallScore(
  beliefs: Record<string, number>,
  uncertainties: Record<string, number>
): number {
  const entries = Object.entries(beliefs);
  if (entries.length === 0) return 2.5;

  const weightedSum = entries.reduce((sum, [skill, belief]) => {
    const uncertainty = uncertainties[skill] ?? 1.0;
    const weight = 1 - uncertainty; // 不确定性越低，权重越高
    return sum + belief * weight;
  }, 0);

  const totalWeight = entries.reduce((sum, [skill]) => {
    const uncertainty = uncertainties[skill] ?? 1.0;
    return sum + (1 - uncertainty);
  }, 0);

  return totalWeight > 0 ? weightedSum / totalWeight : 2.5;
}

/**
 * 做出轮次决策
 */
export function makeRoundDecision(
  currentRound: number,
  beliefs: Record<string, number>,
  uncertainties: Record<string, number>,
  config: RoundControlConfig = DEFAULT_ROUND_CONTROL_CONFIG
): RoundDecision {
  const currentBelief = Object.values(beliefs).reduce((sum, b) => sum + b, 0) / Object.values(beliefs).length || 2.5;
  const currentUncertainty = Object.values(uncertainties).reduce((sum, u) => sum + u, 0) / Object.values(uncertainties).length || 1.0;
  const skillCoverage = calculateSkillCoverage(beliefs, config.skillCoverage.requiredSkills);
  const overallScore = calculateOverallScore(beliefs, uncertainties);

  const metadata = {
    currentRound,
    maxRounds: config.maxRounds,
    currentBelief,
    currentUncertainty,
    skillCoverage,
    overallScore,
  };

  // 1. 强制最小轮次
  if (currentRound < config.minRounds) {
    return {
      action: "continue",
      reason: `未达到最小轮次 ${config.minRounds}，继续面试`,
      confidence: 1.0,
      metadata,
    };
  }

  // 2. 强制最大轮次
  if (currentRound >= config.maxRounds) {
    return {
      action: "finish",
      reason: `已达到最大轮次 ${config.maxRounds}，结束面试`,
      confidence: 1.0,
      metadata,
    };
  }

  // 3. 提前结束检查
  if (
    currentRound >= config.earlyFinishThresholds.minRounds &&
    currentBelief >= config.earlyFinishThresholds.belief &&
    currentUncertainty <= 1 - config.earlyFinishThresholds.confidence &&
    skillCoverage >= config.skillCoverage.minimumCoverage
  ) {
    return {
      action: "finish",
      reason: `信念水平高 (${currentBelief.toFixed(2)})，置信度高 (${currentUncertainty.toFixed(2)})，技能覆盖率 ${(skillCoverage * 100).toFixed(0)}%，提前结束`,
      confidence: Math.min(currentBelief / 5, 1),
      metadata,
    };
  }

  // 4. 延长面试检查
  if (
    currentBelief < config.extendThresholds.belief ||
    currentUncertainty > config.extendThresholds.uncertainty
  ) {
    const extensionRounds = currentRound - config.defaultRounds;
    if (extensionRounds < config.extendThresholds.maxExtensionRounds) {
      return {
        action: "extend",
        reason: `信念水平低 (${currentBelief.toFixed(2)}) 或不确定性高 (${currentUncertainty.toFixed(2)})，延长面试`,
        confidence: 1 - currentBelief / 5,
        metadata,
      };
    }
  }

  // 5. 技能覆盖率不足
  if (skillCoverage < config.skillCoverage.minimumCoverage) {
    return {
      action: "continue",
      reason: `技能覆盖率不足 (${(skillCoverage * 100).toFixed(0)}% < ${(config.skillCoverage.minimumCoverage * 100).toFixed(0)}%)，继续考察`,
      confidence: 1 - skillCoverage,
      metadata,
    };
  }

  // 6. 默认继续
  return {
    action: "continue",
    reason: `默认继续，当前轮次 ${currentRound}`,
    confidence: 0.6,
    metadata,
  };
}

// ============ 轮次控制器 ============

export class RoundController {
  private config: RoundControlConfig;
  private extensionCount: number = 0;

  constructor(config: RoundControlConfig = DEFAULT_ROUND_CONTROL_CONFIG) {
    this.config = config;
  }

  /**
   * 做出轮次决策
   */
  decide(
    currentRound: number,
    beliefs: Record<string, number>,
    uncertainties: Record<string, number>
  ): RoundDecision {
    const decision = makeRoundDecision(currentRound, beliefs, uncertainties, this.config);

    // 记录延长次数
    if (decision.action === "extend") {
      this.extensionCount++;
    }

    // 检查是否超过最大延长次数
    if (
      decision.action === "extend" &&
      this.extensionCount >= this.config.extendThresholds.maxExtensionRounds
    ) {
      return {
        action: "finish",
        reason: `已达到最大延长次数 ${this.config.extendThresholds.maxExtensionRounds}，结束面试`,
        confidence: 1.0,
        metadata: decision.metadata,
      };
    }

    return decision;
  }

  /**
   * 是否应该继续
   */
  shouldContinue(
    currentRound: number,
    beliefs: Record<string, number>,
    uncertainties: Record<string, number>
  ): boolean {
    const decision = this.decide(currentRound, beliefs, uncertainties);
    return decision.action === "continue" || decision.action === "extend";
  }

  /**
   * 是否应该结束
   */
  shouldFinish(
    currentRound: number,
    beliefs: Record<string, number>,
    uncertainties: Record<string, number>
  ): boolean {
    const decision = this.decide(currentRound, beliefs, uncertainties);
    return decision.action === "finish";
  }

  /**
   * 重置延长计数
   */
  reset(): void {
    this.extensionCount = 0;
  }

  /**
   * 获取配置
   */
  getConfig(): RoundControlConfig {
    return this.config;
  }

  /**
   * 更新配置
   */
  updateConfig(update: Partial<RoundControlConfig>): void {
    this.config = { ...this.config, ...update };
  }
}

// ============ 辅助函数 ============

/**
 * 计算推荐的轮次数
 */
export function recommendRounds(
  beliefs: Record<string, number>,
  uncertainties: Record<string, number>,
  config: RoundControlConfig = DEFAULT_ROUND_CONTROL_CONFIG
): number {
  const avgBelief = Object.values(beliefs).reduce((sum, b) => sum + b, 0) / Object.values(beliefs).length || 2.5;
  const avgUncertainty = Object.values(uncertainties).reduce((sum, u) => sum + u, 0) / Object.values(uncertainties).length || 1.0;
  const skillCoverage = calculateSkillCoverage(beliefs, config.skillCoverage.requiredSkills);

  // 基础轮次
  let rounds = config.defaultRounds;

  // 根据信念调整
  if (avgBelief < 2.5) {
    rounds += 2; // 信念低，增加轮次
  } else if (avgBelief > 4.0) {
    rounds -= 1; // 信念高，减少轮次
  }

  // 根据不确定性调整
  if (avgUncertainty > 0.7) {
    rounds += 1; // 不确定性高，增加轮次
  }

  // 根据技能覆盖率调整
  if (skillCoverage < 0.6) {
    rounds += 1; // 覆盖率低，增加轮次
  }

  // 限制在范围内
  return Math.max(config.minRounds, Math.min(config.maxRounds, rounds));
}

// ============ 单例导出 ============

export const roundController = new RoundController();

export {
  DEFAULT_ROUND_CONTROL_CONFIG,
};
