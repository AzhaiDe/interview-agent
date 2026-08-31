/**
 * 动态策略选择模块
 *
 * 功能：
 * 1. 策略评估函数（基于信念水平）
 * 2. 策略切换逻辑（深挖/探索/加压）
 * 3. 技能优先级排序
 * 4. 与 LangGraph V2 集成
 */

// ============ 策略类型定义 ============

export type StrategyType =
  | "deep_dive"      // 深挖：信念低，继续追问当前技能
  | "explore"        // 探索：信念高，切换到新技能
  | "pressure"       // 加压：中等信念，加压测试
  | "validate"       // 验证：检测矛盾或不确定
  | "confirm";       // 确认：高信念，确认最终评估

export type StrategyDecision = {
  strategy: StrategyType;
  mappedSkill: string;
  reason: string;
  confidence: number;
  metadata: {
    currentBelief: number;
    currentUncertainty: number;
    skillHistory: Array<{
      skill: string;
      belief: number;
      rounds: number;
    }>;
  };
};

// ============ 技能优先级配置 ============

export type SkillPriority = {
  skill: string;
  weight: number;        // 权重（0-1）
  required: boolean;     // 是否必需
  dependsOn: string[];   // 依赖的其他技能
};

const DEFAULT_SKILL_PRIORITIES: Record<string, SkillPriority> = {
  problem_solving: {
    skill: "problem_solving",
    weight: 0.25,
    required: true,
    dependsOn: [],
  },
  system_design: {
    skill: "system_design",
    weight: 0.25,
    required: true,
    dependsOn: ["problem_solving"],
  },
  technical_depth: {
    skill: "technical_depth",
    weight: 0.20,
    required: true,
    dependsOn: ["problem_solving"],
  },
  project_execution: {
    skill: "project_execution",
    weight: 0.15,
    required: false,
    dependsOn: ["problem_solving"],
  },
  communication: {
    skill: "communication",
    weight: 0.10,
    required: false,
    dependsOn: [],
  },
  leadership: {
    skill: "leadership",
    weight: 0.05,
    required: false,
    dependsOn: ["project_execution"],
  },
};

// ============ 策略阈值配置 ============

export type StrategyThresholds = {
  deepDive: number;      // 信念低于此值 → 深挖
  explore: number;       // 信念高于此值 → 探索
  pressure: number;      // 信念在此区间 → 加压
  validate: number;      // 不确定性高于此值 → 验证
  confirm: number;       // 信念高于此值 → 确认
};

const DEFAULT_THRESHOLDS: StrategyThresholds = {
  deepDive: 2.5,         // 信念 < 2.5 → 深挖
  explore: 4.0,          // 信念 > 4.0 → 探索
  pressure: 3.5,         // 信念 2.5-3.5 → 加压
  validate: 0.7,         // 不确定性 > 0.7 → 验证
  confirm: 4.5,          // 信念 > 4.5 → 确认
};

// ============ 策略评估函数 ============

/**
 * 评估当前技能状态
 */
export function evaluateSkillState(
  skill: string,
  belief: number,
  uncertainty: number,
  rounds: number,
  thresholds: StrategyThresholds = DEFAULT_THRESHOLDS
): {
  status: "low" | "medium" | "high" | "very_high";
  recommendation: StrategyType;
  confidence: number;
} {
  // 高不确定性 → 验证
  if (uncertainty >= thresholds.validate) {
    return {
      status: belief >= thresholds.explore ? "high" : "medium",
      recommendation: "validate",
      confidence: 1 - uncertainty,
    };
  }

  // 低信念 → 深挖
  if (belief < thresholds.deepDive) {
    return {
      status: "low",
      recommendation: "deep_dive",
      confidence: 1 - belief / 5,
    };
  }

  // 中等信念 → 加压或深挖
  if (belief < thresholds.pressure) {
    return {
      status: "medium",
      recommendation: rounds >= 2 ? "pressure" : "deep_dive",
      confidence: 0.6,
    };
  }

  // 高信念 → 探索或确认
  if (belief < thresholds.explore) {
    return {
      status: "high",
      recommendation: "pressure",
      confidence: belief / 5,
    };
  }

  // 很高信念 → 确认
  if (belief < thresholds.confirm) {
    return {
      status: "very_high",
      recommendation: "explore",
      confidence: belief / 5,
    };
  }

  // 极高信念 → 确认
  return {
    status: "very_high",
    recommendation: "confirm",
    confidence: belief / 5,
  };
}

// ============ 技能选择函数 ============

/**
 * 选择下一个要考察的技能
 */
export function selectNextSkill(
  currentSkill: string,
  beliefs: Record<string, number>,
  uncertainties: Record<string, number>,
  skillRounds: Record<string, number>,
  skillPriorities: Record<string, SkillPriority> = DEFAULT_SKILL_PRIORITIES
): string {
  // 获取所有技能的状态
  const skillStates = Object.entries(skillPriorities).map(([skill, priority]) => {
    const belief = beliefs[skill] ?? 2.5;
    const uncertainty = uncertainties[skill] ?? 1.0;
    const rounds = skillRounds[skill] ?? 0;

    const status = evaluateSkillState(skill, belief, uncertainty, rounds);

    return {
      skill,
      priority: priority.weight,
      required: priority.required,
      belief,
      uncertainty,
      rounds,
      status: status.status,
      recommendation: status.recommendation,
      confidence: status.confidence,
    };
  });

  // 优先选择必需技能中信念最低的
  const requiredSkills = skillStates.filter((s) => s.required);
  const lowBeliefRequired = requiredSkills
    .filter((s) => s.status === "low" || s.status === "medium")
    .sort((a, b) => a.belief - b.belief);

  if (lowBeliefRequired.length > 0) {
    return lowBeliefRequired[0].skill;
  }

  // 如果所有必需技能都已考察完毕，选择非必需技能中优先级最高的
  const optionalSkills = skillStates.filter((s) => !s.required);
  const unexploredOptional = optionalSkills
    .filter((s) => s.rounds === 0)
    .sort((a, b) => b.priority - a.priority);

  if (unexploredOptional.length > 0) {
    return unexploredOptional[0].skill;
  }

  // 如果所有技能都已考察，返回当前技能
  return currentSkill;
}

// ============ 策略决策函数 ============

/**
 * 做出策略决策
 */
export function makeStrategyDecision(
  currentSkill: string,
  beliefs: Record<string, number>,
  uncertainties: Record<string, number>,
  skillRounds: Record<string, number>,
  thresholds: StrategyThresholds = DEFAULT_THRESHOLDS,
  skillPriorities: Record<string, SkillPriority> = DEFAULT_SKILL_PRIORITIES
): StrategyDecision {
  const currentBelief = beliefs[currentSkill] ?? 2.5;
  const currentUncertainty = uncertainties[currentSkill] ?? 1.0;
  const currentRounds = skillRounds[currentSkill] ?? 0;

  // 评估当前技能状态
  const evaluation = evaluateSkillState(
    currentSkill,
    currentBelief,
    currentUncertainty,
    currentRounds,
    thresholds
  );

  // 根据评估结果决定策略
  let strategy: StrategyType;
  let mappedSkill: string;
  let reason: string;

  switch (evaluation.recommendation) {
    case "deep_dive":
      strategy = "deep_dive";
      mappedSkill = currentSkill;
      reason = `当前技能 ${currentSkill} 信念较低 (${currentBelief.toFixed(2)})，需要深挖`;
      break;

    case "validate":
      strategy = "validate";
      mappedSkill = currentSkill;
      reason = `当前技能 ${currentSkill} 不确定性较高 (${currentUncertainty.toFixed(2)})，需要验证`;
      break;

    case "pressure":
      strategy = "pressure";
      mappedSkill = currentSkill;
      reason = `当前技能 ${currentSkill} 信念中等 (${currentBelief.toFixed(2)})，需要加压测试`;
      break;

    case "explore":
      strategy = "explore";
      mappedSkill = selectNextSkill(
        currentSkill,
        beliefs,
        uncertainties,
        skillRounds,
        skillPriorities
      );
      reason = `当前技能 ${currentSkill} 信念较高 (${currentBelief.toFixed(2)})，切换到 ${mappedSkill}`;
      break;

    case "confirm":
      strategy = "confirm";
      mappedSkill = currentSkill;
      reason = `当前技能 ${currentSkill} 信念很高 (${currentBelief.toFixed(2)})，确认最终评估`;
      break;

    default:
      strategy = "deep_dive";
      mappedSkill = currentSkill;
      reason = `默认策略：深挖当前技能 ${currentSkill}`;
  }

  // 构建技能历史
  const skillHistory = Object.entries(beliefs).map(([skill, belief]) => ({
    skill,
    belief,
    rounds: skillRounds[skill] ?? 0,
  }));

  return {
    strategy,
    mappedSkill,
    reason,
    confidence: evaluation.confidence,
    metadata: {
      currentBelief,
      currentUncertainty,
      skillHistory,
    },
  };
}

// ============ 策略执行函数 ============

/**
 * 根据策略生成问题
 */
export function generateQuestionByStrategy(
  strategy: StrategyType,
  skill: string,
  targetRole: string,
  knowledgePack?: any,
  round: number = 0
): string {
  const defaultQuestions: Record<string, Record<string, string>> = {
    problem_solving: {
      deep_dive: `请结合${targetRole}经历，详细说明你如何解决一个复杂问题？包括问题定义、方案设计和执行过程。`,
      pressure: `在你提到的解决方案中，最大的挑战是什么？你是如何克服的？`,
      validate: `你提到的这个方法，有没有在其他场景下使用过？效果如何？`,
      confirm: `总结一下，你认为自己在问题解决方面的核心优势是什么？`,
    },
    system_design: {
      deep_dive: `请描述你在${targetRole}中参与的系统设计，包括架构决策和权衡？`,
      pressure: `如果让你重新设计这个系统，你会做哪些改进？为什么？`,
      validate: `你提到的架构决策，有没有考虑过其他方案？为什么选择这个？`,
      confirm: `你认为自己在系统设计方面的核心能力是什么？`,
    },
    technical_depth: {
      deep_dive: `请深入讲解你在${targetRole}中使用的核心技术，包括原理和边界？`,
      pressure: `这个技术的性能瓶颈在哪里？你是如何优化的？`,
      validate: `你提到的这个技术，有没有在其他项目中应用过？效果如何？`,
      confirm: `总结一下，你认为自己在技术深度方面的核心优势是什么？`,
    },
    project_execution: {
      deep_dive: `请描述你在${targetRole}中负责的项目，包括职责、指标和验证？`,
      pressure: `项目中遇到的最大困难是什么？你是如何解决的？`,
      validate: `你提到的这个指标，是如何测量和验证的？`,
      confirm: `你认为自己在项目执行方面的核心能力是什么？`,
    },
  };

  // 优先使用知识库
  if (knowledgePack && round > 0 && knowledgePack.followUpQuestions?.length > 0) {
    const index = Math.floor(Math.random() * knowledgePack.followUpQuestions.length);
    return knowledgePack.followUpQuestions[index].content;
  }

  // 使用默认问题
  const skillQuestions = defaultQuestions[skill] || defaultQuestions.problem_solving;
  return skillQuestions[strategy] || skillQuestions.deep_dive;
}

// ============ 单例导出 ============

export {
  DEFAULT_SKILL_PRIORITIES,
  DEFAULT_THRESHOLDS,
};
