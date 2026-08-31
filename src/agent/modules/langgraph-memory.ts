/**
 * 记忆系统集成模块（OmniMemory）
 *
 * 功能：
 * 1. OmniMemory 集成接口
 * 2. 面试事件记录
 * 3. 跨会话记忆检索
 * 4. 记忆相关的面试策略调整
 * 5. 与 LangGraph V2 集成
 */

import crypto from "node:crypto";

// ============ 记忆事件类型 ============

export type MemoryEventType =
  | "interview_start"       // 面试开始
  | "interview_answer"      // 候选人回答
  | "interview_evaluation"  // 面试评估
  | "interview_end"         // 面试结束
  | "skill_belief_update"   // 技能信念更新
  | "evidence_collected"    // 证据收集
  | "strategy_decision"     // 策略决策
  | "model_call";           // 模型调用

export type MemoryEvent = {
  id: string;
  type: MemoryEventType;
  sessionId: string;
  timestamp: number;
  data: Record<string, any>;
  metadata: {
    targetRole?: string;
    skill?: string;
    round?: number;
    pressure?: string;
    tags?: string[];
  };
  embedding?: number[]; // 向量嵌入（用于相似度检索）
};

// ============ 候选人画像 ============

export type CandidateProfile = {
  id: string;
  name?: string;
  targetRole: string;
  experience?: number;
  skills: string[];
  background?: string;
  previousInterviews: Array<{
    sessionId: string;
    date: number;
    score: number;
    feedback: string;
    skills: Record<string, number>;
  }>;
  createdAt: number;
  updatedAt: number;
};

// ============ 记忆存储接口 ============

export interface MemoryStorage {
  save(event: MemoryEvent): Promise<void>;
  load(sessionId: string): Promise<MemoryEvent[]>;
  search(query: string, options?: {
    type?: MemoryEventType;
    sessionId?: string;
    targetRole?: string;
    skill?: string;
    limit?: number;
    threshold?: number;
  }): Promise<MemoryEvent[]>;
  clear(sessionId?: string): Promise<void>;
}

// ============ 内存存储实现 ============

export class InMemoryStorage implements MemoryStorage {
  private events: Map<string, MemoryEvent[]> = new Map();
  private allEvents: MemoryEvent[] = [];

  async save(event: MemoryEvent): Promise<void> {
    const sessionEvents = this.events.get(event.sessionId) || [];
    sessionEvents.push(event);
    this.events.set(event.sessionId, sessionEvents);
    this.allEvents.push(event);
  }

  async load(sessionId: string): Promise<MemoryEvent[]> {
    return this.events.get(sessionId) || [];
  }

  async search(query: string, options: {
    type?: MemoryEventType;
    sessionId?: string;
    targetRole?: string;
    skill?: string;
    limit?: number;
    threshold?: number;
  } = {}): Promise<MemoryEvent[]> {
    let results = this.allEvents;

    // 类型过滤
    if (options.type) {
      results = results.filter((e) => e.type === options.type);
    }

    // 会话过滤
    if (options.sessionId) {
      results = results.filter((e) => e.sessionId === options.sessionId);
    }

    // 角色过滤
    if (options.targetRole) {
      results = results.filter((e) => e.metadata.targetRole === options.targetRole);
    }

    // 技能过滤
    if (options.skill) {
      results = results.filter((e) => e.metadata.skill === options.skill);
    }

    // 简单文本匹配（实际应该用向量相似度）
    const queryLower = query.toLowerCase();
    results = results.filter((e) => {
      const text = JSON.stringify(e.data).toLowerCase();
      return text.includes(queryLower);
    });

    // 限制数量
    const limit = options.limit || 10;
    return results.slice(0, limit);
  }

  async clear(sessionId?: string): Promise<void> {
    if (sessionId) {
      this.events.delete(sessionId);
      this.allEvents = this.allEvents.filter((e) => e.sessionId !== sessionId);
    } else {
      this.events.clear();
      this.allEvents = [];
    }
  }
}

// ============ OmniMemory 类 ============

export class OmniMemory {
  private storage: MemoryStorage;
  private sessionId: string;
  private targetRole: string;
  private profiles: Map<string, CandidateProfile> = new Map();

  constructor(options: {
    sessionId: string;
    targetRole: string;
    storage?: MemoryStorage;
  }) {
    this.sessionId = options.sessionId;
    this.targetRole = options.targetRole;
    this.storage = options.storage || new InMemoryStorage();
  }

  /**
   * 记录事件
   */
  async recordEvent(
    type: MemoryEventType,
    data: Record<string, any>,
    metadata: {
      skill?: string;
      round?: number;
      pressure?: string;
      tags?: string[];
    } = {}
  ): Promise<string> {
    const event: MemoryEvent = {
      id: crypto.randomBytes(16).toString("hex"),
      type,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      data,
      metadata: {
        targetRole: this.targetRole,
        ...metadata,
      },
    };

    await this.storage.save(event);
    return event.id;
  }

  /**
   * 记录面试开始
   */
  async recordInterviewStart(data: {
    candidateId?: string;
    pressure: string;
  }): Promise<string> {
    return this.recordEvent("interview_start", data, {
      pressure: data.pressure,
    });
  }

  /**
   * 记录候选人回答
   */
  async recordInterviewAnswer(data: {
    question: string;
    answer: string;
    skill: string;
    round: number;
  }): Promise<string> {
    return this.recordEvent("interview_answer", data, {
      skill: data.skill,
      round: data.round,
    });
  }

  /**
   * 记录面试评估
   */
  async recordInterviewEvaluation(data: {
    skill: string;
    score: number;
    verdict: string;
    confidence: number;
    evidence: string[];
    feedback: string;
    round: number;
  }): Promise<string> {
    return this.recordEvent("interview_evaluation", data, {
      skill: data.skill,
      round: data.round,
    });
  }

  /**
   * 记录面试结束
   */
  async recordInterviewEnd(data: {
    totalRounds: number;
    finalScore: number;
    skills: Record<string, number>;
    summary: string;
  }): Promise<string> {
    return this.recordEvent("interview_end", data);
  }

  /**
   * 记录技能信念更新
   */
  async recordSkillBeliefUpdate(data: {
    skill: string;
    oldBelief: number;
    newBelief: number;
    uncertainty: number;
    reason: string;
  }): Promise<string> {
    return this.recordEvent("skill_belief_update", data, {
      skill: data.skill,
    });
  }

  /**
   * 记录证据收集
   */
  async recordEvidenceCollected(data: {
    skill: string;
    evidence: string[];
    covered: string[];
    missing: string[];
  }): Promise<string> {
    return this.recordEvent("evidence_collected", data, {
      skill: data.skill,
    });
  }

  /**
   * 记录策略决策
   */
  async recordStrategyDecision(data: {
    strategy: string;
    mappedSkill: string;
    reason: string;
    confidence: number;
  }): Promise<string> {
    return this.recordEvent("strategy_decision", data, {
      skill: data.mappedSkill,
    });
  }

  /**
   * 记录模型调用
   */
  async recordModelCall(data: {
    tier: string;
    task: string;
    latencyMs: number;
    tokensUsed: number;
    success: boolean;
    error?: string;
  }): Promise<string> {
    return this.recordEvent("model_call", data, {
      tags: [data.tier, data.task],
    });
  }

  /**
   * 检索相关记忆
   */
  async retrieve(options: {
    type?: MemoryEventType;
    skill?: string;
    limit?: number;
    query?: string;
  } = {}): Promise<MemoryEvent[]> {
    const query = options.query || `${this.targetRole} ${options.skill || ""}`;

    return this.storage.search(query, {
      type: options.type,
      targetRole: this.targetRole,
      skill: options.skill,
      limit: options.limit || 10,
    });
  }

  /**
   * 获取会话历史
   */
  async getSessionHistory(): Promise<MemoryEvent[]> {
    return this.storage.load(this.sessionId);
  }

  /**
   * 获取候选人画像
   */
  async getCandidateProfile(candidateId: string): Promise<CandidateProfile | null> {
    return this.profiles.get(candidateId) || null;
  }

  /**
   * 保存候选人画像
   */
  async saveCandidateProfile(profile: CandidateProfile): Promise<void> {
    this.profiles.set(profile.id, profile);
  }

  /**
   * 更新候选人画像
   */
  async updateCandidateProfile(
    candidateId: string,
    update: Partial<CandidateProfile>
  ): Promise<CandidateProfile | null> {
    const profile = this.profiles.get(candidateId);
    if (!profile) return null;

    const updated = {
      ...profile,
      ...update,
      updatedAt: Date.now(),
    };

    this.profiles.set(candidateId, updated);
    return updated;
  }

  /**
   * 获取历史面试数据
   */
  async getHistoricalInterviews(candidateId: string): Promise<Array<{
    sessionId: string;
    date: number;
    score: number;
    feedback: string;
  }>> {
    const profile = await this.getCandidateProfile(candidateId);
    return profile?.previousInterviews || [];
  }

  /**
   * 检索相关技能评估
   */
  async getRelatedSkillEvaluations(skill: string, limit: number = 5): Promise<MemoryEvent[]> {
    return this.retrieve({
      type: "interview_evaluation",
      skill,
      limit,
    });
  }

  /**
   * 获取面试统计
   */
  async getStatistics(): Promise<{
    totalEvents: number;
    eventsByType: Record<MemoryEventType, number>;
    averageScore?: number;
    skillsEvaluated: string[];
  }> {
    const history = await this.getSessionHistory();

    const eventsByType = history.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<MemoryEventType, number>);

    const evaluations = history.filter((e) => e.type === "interview_evaluation");
    const scores = evaluations.map((e) => e.data.score as number);
    const averageScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : undefined;

    const skillsEvaluated = [...new Set(evaluations.map((e) => e.metadata.skill).filter(Boolean))] as string[];

    return {
      totalEvents: history.length,
      eventsByType,
      averageScore,
      skillsEvaluated,
    };
  }

  /**
   * 清空会话记忆
   */
  async clearSession(): Promise<void> {
    await this.storage.clear(this.sessionId);
  }

  /**
   * 清空所有记忆
   */
  async clearAll(): Promise<void> {
    await this.storage.clear();
  }
}

// ============ 辅助函数 ============

/**
 * 创建 OmniMemory 实例
 */
export function createOmniMemory(
  sessionId: string,
  targetRole: string,
  storage?: MemoryStorage
): OmniMemory {
  return new OmniMemory({ sessionId, targetRole, storage });
}

// ============ 单例导出 ============

export const defaultOmniMemory = createOmniMemory("default", "general");
