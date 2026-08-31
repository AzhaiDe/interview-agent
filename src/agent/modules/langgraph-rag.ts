/**
 * RAG 知识库检索模块
 *
 * 功能：
 * 1. 知识库数据结构定义
 * 2. 知识检索函数（基于向量相似度）
 * 3. 知识库构建和索引
 * 4. 与 LangGraph V2 集成
 */

import crypto from "node:crypto";

// ============ 知识库数据结构 ============

export type KnowledgeType =
  | "interview_question"  // 面试问题
  | "best_practice"       // 最佳实践
  | "evaluation_criteria" // 评估标准
  | "follow_up_question"  // 追问问题
  | "red_flag"            // 红旗警告
  | "success_indicator";  // 成功指标

export type KnowledgeItem = {
  id: string;
  type: KnowledgeType;
  targetRole: string;
  skill: string;
  pressure: string;
  content: string;
  metadata: {
    difficulty: "easy" | "medium" | "hard";
    estimatedTime: number; // 秒
    tags: string[];
    relatedSkills: string[];
    version: string;
    createdAt: number;
    updatedAt: number;
  };
  embedding?: number[]; // 向量嵌入（用于相似度检索）
};

export type KnowledgePack = {
  questions: KnowledgeItem[];
  bestPractices: KnowledgeItem[];
  evaluationCriteria: KnowledgeItem[];
  followUpQuestions: KnowledgeItem[];
  redFlags: KnowledgeItem[];
  successIndicators: KnowledgeItem[];
};

// ============ 向量相似度计算 ============

/**
 * 计算两个向量的余弦相似度
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error("Vector dimensions must match");
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * 简单的文本向量化（基于字符 n-gram）
 * 实际生产环境应该使用模型生成嵌入
 */
export function simpleEmbed(text: string, dimensions: number = 128): number[] {
  const normalizedText = text.toLowerCase().trim();
  const vector = new Array(dimensions).fill(0);

  // 使用字符 bigram 和 trigram
  for (let i = 0; i < normalizedText.length - 1; i++) {
    const bigram = normalizedText.slice(i, i + 2);
    const hash = crypto.createHash("md5").update(bigram).digest("hex");
    const index = parseInt(hash.slice(0, 8), 16) % dimensions;
    vector[index] += 1;
  }

  for (let i = 0; i < normalizedText.length - 2; i++) {
    const trigram = normalizedText.slice(i, i + 3);
    const hash = crypto.createHash("md5").update(trigram).digest("hex");
    const index = parseInt(hash.slice(0, 8), 16) % dimensions;
    vector[index] += 1.5;
  }

  // 归一化
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => val / norm);
}

// ============ 知识库类 ============

export class KnowledgeBase {
  private items: Map<string, KnowledgeItem> = new Map();
  private embeddings: Map<string, number[]> = new Map();

  /**
   * 添加知识项
   */
  addItem(item: KnowledgeItem): void {
    this.items.set(item.id, item);

    // 生成或保存嵌入
    if (item.embedding) {
      this.embeddings.set(item.id, item.embedding);
    } else {
      const embedding = simpleEmbed(item.content);
      this.embeddings.set(item.id, embedding);
    }
  }

  /**
   * 批量添加知识项
   */
  addItems(items: KnowledgeItem[]): void {
    items.forEach((item) => this.addItem(item));
  }

  /**
   * 根据 ID 获取知识项
   */
  getItem(id: string): KnowledgeItem | undefined {
    return this.items.get(id);
  }

  /**
   * 检索相似知识项
   */
  retrieveSimilar(
    query: string,
    options: {
      type?: KnowledgeType;
      targetRole?: string;
      skill?: string;
      limit?: number;
      threshold?: number;
    } = {}
  ): Array<{ item: KnowledgeItem; score: number }> {
    const queryEmbedding = simpleEmbed(query);
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.5;

    const results: Array<{ item: KnowledgeItem; score: number }> = [];

    for (const [id, item] of this.items.entries()) {
      // 类型过滤
      if (options.type && item.type !== options.type) continue;

      // 角色过滤
      if (options.targetRole && item.targetRole !== options.targetRole) continue;

      // 技能过滤
      if (options.skill && item.skill !== options.skill) continue;

      // 计算相似度
      const embedding = this.embeddings.get(id);
      if (!embedding) continue;

      const score = cosineSimilarity(queryEmbedding, embedding);

      // 阈值过滤
      if (score >= threshold) {
        results.push({ item, score });
      }
    }

    // 按相似度排序并返回 top-k
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 获取知识包（用于问题生成）
   */
  getKnowledgePack(
    targetRole: string,
    skill: string,
    pressure: string
  ): KnowledgePack {
    const query = `${targetRole} ${skill} ${pressure}`;

    return {
      questions: this.retrieveSimilar(query, {
        type: "interview_question",
        targetRole,
        skill,
        limit: 5,
      }).map((r) => r.item),

      bestPractices: this.retrieveSimilar(query, {
        type: "best_practice",
        targetRole,
        skill,
        limit: 3,
      }).map((r) => r.item),

      evaluationCriteria: this.retrieveSimilar(query, {
        type: "evaluation_criteria",
        targetRole,
        skill,
        limit: 3,
      }).map((r) => r.item),

      followUpQuestions: this.retrieveSimilar(query, {
        type: "follow_up_question",
        targetRole,
        skill,
        limit: 5,
      }).map((r) => r.item),

      redFlags: this.retrieveSimilar(query, {
        type: "red_flag",
        targetRole,
        skill,
        limit: 3,
      }).map((r) => r.item),

      successIndicators: this.retrieveSimilar(query, {
        type: "success_indicator",
        targetRole,
        skill,
        limit: 3,
      }).map((r) => r.item),
    };
  }

  /**
   * 获取所有知识项
   */
  getAllItems(): KnowledgeItem[] {
    return Array.from(this.items.values());
  }

  /**
   * 获取知识库大小
   */
  size(): number {
    return this.items.size;
  }

  /**
   * 清空知识库
   */
  clear(): void {
    this.items.clear();
    this.embeddings.clear();
  }
}

// ============ 默认知识库 ============

export function createDefaultKnowledgeBase(): KnowledgeBase {
  const kb = new KnowledgeBase();

  // 后端工程师 - 系统设计
  const backendSystemDesignQuestions: KnowledgeItem[] = [
    {
      id: "be-sys-001",
      type: "interview_question",
      targetRole: "后端工程师",
      skill: "system_design",
      pressure: "低",
      content: "请描述一个你参与设计的高并发系统，包括架构决策和权衡？",
      metadata: {
        difficulty: "medium",
        estimatedTime: 180,
        tags: ["架构", "高并发", "权衡"],
        relatedSkills: ["technical_depth", "performance"],
        version: "v1.0",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
    {
      id: "be-sys-002",
      type: "interview_question",
      targetRole: "后端工程师",
      skill: "system_design",
      pressure: "中",
      content: "如果让你重新设计这个系统，你会做哪些改进？为什么？",
      metadata: {
        difficulty: "hard",
        estimatedTime: 240,
        tags: ["改进", "反思", "决策"],
        relatedSkills: ["critical_thinking", "innovation"],
        version: "v1.0",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  ];

  // 后端工程师 - 技术深度
  const backendTechnicalDepthQuestions: KnowledgeItem[] = [
    {
      id: "be-tech-001",
      type: "interview_question",
      targetRole: "后端工程师",
      skill: "technical_depth",
      pressure: "低",
      content: "请深入讲解你在项目中使用的核心数据库技术，包括索引优化和查询性能？",
      metadata: {
        difficulty: "medium",
        estimatedTime: 200,
        tags: ["数据库", "索引", "性能优化"],
        relatedSkills: ["database", "performance"],
        version: "v1.0",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  ];

  // 最佳实践
  const bestPractices: KnowledgeItem[] = [
    {
      id: "bp-001",
      type: "best_practice",
      targetRole: "后端工程师",
      skill: "system_design",
      pressure: "中",
      content: "优秀回答应该包含：明确的职责划分、具体的技术选型、量化的性能指标、验证方法",
      metadata: {
        difficulty: "medium",
        estimatedTime: 60,
        tags: ["评估标准", "最佳实践"],
        relatedSkills: ["evaluation"],
        version: "v1.0",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  ];

  // 评估标准
  const evaluationCriteria: KnowledgeItem[] = [
    {
      id: "ec-001",
      type: "evaluation_criteria",
      targetRole: "后端工程师",
      skill: "system_design",
      pressure: "中",
      content: "评估维度：架构合理性、技术深度、性能优化、可扩展性、容错设计",
      metadata: {
        difficulty: "medium",
        estimatedTime: 60,
        tags: ["评估", "维度"],
        relatedSkills: ["evaluation"],
        version: "v1.0",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  ];

  // 追问问题
  const followUpQuestions: KnowledgeItem[] = [
    {
      id: "fu-001",
      type: "follow_up_question",
      targetRole: "后端工程师",
      skill: "system_design",
      pressure: "中",
      content: "你提到的这个架构决策，有没有考虑过其他方案？为什么选择这个？",
      metadata: {
        difficulty: "medium",
        estimatedTime: 120,
        tags: ["追问", "决策", "权衡"],
        relatedSkills: ["critical_thinking"],
        version: "v1.0",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  ];

  // 红旗警告
  const redFlags: KnowledgeItem[] = [
    {
      id: "rf-001",
      type: "red_flag",
      targetRole: "后端工程师",
      skill: "system_design",
      pressure: "中",
      content: "无法说清自己的具体职责，只说'我们'做了什么",
      metadata: {
        difficulty: "easy",
        estimatedTime: 30,
        tags: ["红旗", "职责不清"],
        relatedSkills: ["personal_responsibility"],
        version: "v1.0",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  ];

  // 成功指标
  const successIndicators: KnowledgeItem[] = [
    {
      id: "si-001",
      type: "success_indicator",
      targetRole: "后端工程师",
      skill: "system_design",
      pressure: "中",
      content: "能清晰描述个人职责、技术选型理由、性能指标、验证方法",
      metadata: {
        difficulty: "easy",
        estimatedTime: 30,
        tags: ["成功", "指标"],
        relatedSkills: ["evidence"],
        version: "v1.0",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  ];

  kb.addItems([
    ...backendSystemDesignQuestions,
    ...backendTechnicalDepthQuestions,
    ...bestPractices,
    ...evaluationCriteria,
    ...followUpQuestions,
    ...redFlags,
    ...successIndicators,
  ]);

  return kb;
}

// ============ 单例导出 ============

export const knowledgeBase = createDefaultKnowledgeBase();

// ============ 辅助函数 ============

/**
 * 检索知识包（便捷函数）
 */
export function retrieveKnowledgePack(
  targetRole: string,
  skill: string,
  pressure: string
): KnowledgePack {
  return knowledgeBase.getKnowledgePack(targetRole, skill, pressure);
}

/**
 * 根据知识包生成问题
 */
export function generateQuestionFromKnowledge(
  knowledgePack: KnowledgePack,
  round: number,
  priorQuestions: string[] = []
): string {
  // 第一轮：使用主问题
  if (round === 0 && knowledgePack.questions.length > 0) {
    return knowledgePack.questions[0].content;
  }

  // 后续轮次：使用追问问题
  if (round > 0 && knowledgePack.followUpQuestions.length > 0) {
    const availableQuestions = knowledgePack.followUpQuestions.filter(
      (q) => !priorQuestions.includes(q.content)
    );

    if (availableQuestions.length > 0) {
      const index = Math.floor(Math.random() * availableQuestions.length);
      return availableQuestions[index].content;
    }
  }

  // 如果没有追问问题，返回默认问题
  return "";
}
