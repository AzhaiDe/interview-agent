/**
 * Prompt 注册表模块
 *
 * 功能：
 * 1. Prompt 版本管理
 * 2. 动态加载和渲染
 * 3. 变量替换
 * 4. A/B 测试支持
 * 5. 与 LangGraph V2 集成
 */

import crypto from "node:crypto";

// ============ Prompt 类型定义 ============

export type PromptType =
  | "compose_question"      // 生成面试问题
  | "evaluate_answer"       // 评估回答
  | "select_strategy"       // 选择策略
  | "generate_feedback"     // 生成反馈
  | "summarize_interview"   // 总结面试
  | "system"                // 系统提示
  | "user";                 // 用户提示

export type PromptVariant = {
  id: string;
  version: string;
  content: string;
  metadata: {
    type: PromptType;
    description?: string;
    tags?: string[];
    createdAt: number;
    updatedAt: number;
    author?: string;
    abTestGroup?: "A" | "B" | "control";
  };
};

export type PromptTemplate = {
  name: string;
  type: PromptType;
  variants: PromptVariant[];
  activeVersion: string;
  metadata: {
    description?: string;
    variables: string[];
    createdAt: number;
    updatedAt: number;
  };
};

// ============ Prompt 注册表类 ============

export class PromptRegistry {
  private templates: Map<string, PromptTemplate> = new Map();
  private abTestRatios: Map<string, { A: number; B: number; control: number }> = new Map();

  /**
   * 注册 Prompt 模板
   */
  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.name, template);
  }

  /**
   * 添加 Prompt 变体
   */
  addVariant(
    templateName: string,
    variant: Omit<PromptVariant, "id">
  ): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    const id = crypto.randomBytes(8).toString("hex");
    const newVariant: PromptVariant = {
      ...variant,
      id,
    };

    template.variants.push(newVariant);
    template.metadata.updatedAt = Date.now();

    return id;
  }

  /**
   * 获取 Prompt 模板
   */
  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * 获取指定版本的 Prompt 变体
   */
  getVariant(name: string, version?: string): PromptVariant | undefined {
    const template = this.templates.get(name);
    if (!template) return undefined;

    const targetVersion = version || template.activeVersion;
    return template.variants.find((v) => v.version === targetVersion);
  }

  /**
   * 设置活跃版本
   */
  setActiveVersion(name: string, version: string): void {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template ${name} not found`);
    }

    const variant = template.variants.find((v) => v.version === version);
    if (!variant) {
      throw new Error(`Version ${version} not found in template ${name}`);
    }

    template.activeVersion = version;
    template.metadata.updatedAt = Date.now();
  }

  /**
   * 渲染 Prompt（变量替换）
   */
  render(
    name: string,
    variables: Record<string, string | number>,
    version?: string
  ): string {
    const variant = this.getVariant(name, version);
    if (!variant) {
      throw new Error(`Prompt variant not found: ${name}@${version || "active"}`);
    }

    let content = variant.content;

    // 变量替换
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      content = content.replace(placeholder, String(value));
    }

    // 检查是否有未替换的变量
    const remaining = content.match(/\{\{([^}]+)\}\}/g);
    if (remaining && remaining.length > 0) {
      console.warn(
        `Prompt ${name} has unresolved variables: ${remaining.join(", ")}`
      );
    }

    return content;
  }

  /**
   * A/B 测试：根据比例选择变体
   */
  selectVariantForABTest(name: string): PromptVariant {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template ${name} not found`);
    }

    const ratios = this.abTestRatios.get(name) || { A: 0.33, B: 0.33, control: 0.34 };
    const random = Math.random();

    let cumulative = 0;
    let selectedGroup: "A" | "B" | "control" = "control";

    if (random < ratios.A) {
      selectedGroup = "A";
    } else if (random < ratios.A + ratios.B) {
      selectedGroup = "B";
    } else {
      selectedGroup = "control";
    }

    const variant = template.variants.find(
      (v) => v.metadata.abTestGroup === selectedGroup
    );

    if (!variant) {
      // 如果没有找到对应组的变体，返回活跃版本
      return template.variants.find((v) => v.version === template.activeVersion)!;
    }

    return variant;
  }

  /**
   * 设置 A/B 测试比例
   */
  setABTestRatios(
    name: string,
    ratios: { A: number; B: number; control: number }
  ): void {
    const sum = ratios.A + ratios.B + ratios.control;
    if (Math.abs(sum - 1) > 0.01) {
      throw new Error(`A/B test ratios must sum to 1, got ${sum}`);
    }

    this.abTestRatios.set(name, ratios);
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 删除模板
   */
  deleteTemplate(name: string): void {
    this.templates.delete(name);
    this.abTestRatios.delete(name);
  }

  /**
   * 清空所有模板
   */
  clear(): void {
    this.templates.clear();
    this.abTestRatios.clear();
  }
}

// ============ 默认 Prompt 模板 ============

export function createDefaultPromptRegistry(): PromptRegistry {
  const registry = new PromptRegistry();

  // 注册 compose_question 模板
  registry.registerTemplate({
    name: "compose_question",
    type: "compose_question",
    variants: [
      {
        id: "cq-v1",
        version: "v1.0",
        content: `请结合{{targetRole}}经历，说明你如何解决一个复杂问题？`,
        metadata: {
          type: "compose_question",
          description: "基础版问题生成",
          tags: ["problem_solving"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
      {
        id: "cq-v2",
        version: "v2.0",
        content: `在{{targetRole}}的工作中，请描述一个你遇到的最复杂的技术挑战。你是如何分析问题、设计方案并最终解决的？`,
        metadata: {
          type: "compose_question",
          description: "详细版问题生成",
          tags: ["problem_solving", "detailed"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
      {
        id: "cq-v3",
        version: "v3.0",
        content: `作为{{targetRole}}，请分享一个你主导的复杂项目。包括：
1. 问题的背景和复杂性
2. 你的分析和设计方案
3. 执行过程中的挑战
4. 最终结果和量化指标`,
        metadata: {
          type: "compose_question",
          description: "结构化问题生成",
          tags: ["problem_solving", "structured"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          abTestGroup: "A",
        },
      },
    ],
    activeVersion: "v2.0",
    metadata: {
      description: "面试问题生成模板",
      variables: ["targetRole", "skill", "pressure"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });

  // 注册 evaluate_answer 模板
  registry.registerTemplate({
    name: "evaluate_answer",
    type: "evaluate_answer",
    variants: [
      {
        id: "ea-v1",
        version: "v1.0",
        content: `请评估以下回答：

问题：{{question}}
回答：{{answer}}

评估维度：
1. 技术正确性
2. 证据完整性
3. 逻辑清晰度
4. 量化指标

请给出 0-10 分的评分和详细反馈。`,
        metadata: {
          type: "evaluate_answer",
          description: "基础版评估提示",
          tags: ["evaluation"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    ],
    activeVersion: "v1.0",
    metadata: {
      description: "回答评估模板",
      variables: ["question", "answer", "skill", "targetRole"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });

  // 注册 generate_feedback 模板
  registry.registerTemplate({
    name: "generate_feedback",
    type: "generate_feedback",
    variants: [
      {
        id: "gf-v1",
        version: "v1.0",
        content: `基于以下评估结果，为候选人提供建设性反馈：

评分：{{score}}
判定：{{verdict}}
证据：{{evidence}}
反馈：{{feedback}}

请提供：
1. 优点总结
2. 改进建议
3. 下一步行动`,
        metadata: {
          type: "generate_feedback",
          description: "反馈生成模板",
          tags: ["feedback"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    ],
    activeVersion: "v1.0",
    metadata: {
      description: "反馈生成模板",
      variables: ["score", "verdict", "evidence", "feedback"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });

  return registry;
}

// ============ 辅助函数 ============

/**
 * 渲染 Prompt（便捷函数）
 */
export function renderPrompt(
  registry: PromptRegistry,
  name: string,
  variables: Record<string, string | number>,
  version?: string
): string {
  return registry.render(name, variables, version);
}

// ============ 单例导出 ============

export const promptRegistry = createDefaultPromptRegistry();
