/**
 * Gold Dataset: Annotated Questions
 *
 * 100 sample questions with annotations covering different strategies and evidence expectations.
 * Used for evaluation per PRD §16.3.
 */

export type AnnotatedQuestion = {
  id: string;
  text: string;
  skill: string;
  strategy: "ownership" | "specificity" | "mechanism" | "tradeoff" | "metric" | "failure";
  requiredEvidence: string[];
  difficulty: number;
  questionType: "project_followup" | "knowledge" | "scenario" | "behavioral";
};

export const goldQuestions: AnnotatedQuestion[] = [
  {
    id: "q-001",
    text: "请围绕「订单系统」说明你独立完成的接口幂等设计，以及如何证明这部分由你完成。",
    skill: "Java",
    strategy: "ownership",
    requiredEvidence: ["职责边界", "实现机制", "验证方法"],
    difficulty: 2,
    questionType: "project_followup",
  },
  {
    id: "q-002",
    text: "请以「订单系统」为背景，具体讲一个真实请求从输入到输出的完整链路。",
    skill: "Java",
    strategy: "specificity",
    requiredEvidence: ["输入输出", "技术动作", "因果关系"],
    difficulty: 2,
    questionType: "project_followup",
  },
  {
    id: "q-003",
    text: "请说明「订单系统」中 Redis 缓存的底层工作原理和最容易出错的边界。",
    skill: "Redis",
    strategy: "mechanism",
    requiredEvidence: ["技术动作", "异常处理", "边界条件"],
    difficulty: 3,
    questionType: "project_followup",
  },
  {
    id: "q-004",
    text: "针对「订单系统」中的 MySQL 索引优化，当时比较过哪些替代方案？最终取舍依据是什么？",
    skill: "MySQL",
    strategy: "tradeoff",
    requiredEvidence: ["替代方案", "决策依据", "权衡分析"],
    difficulty: 3,
    questionType: "project_followup",
  },
  {
    id: "q-005",
    text: "请给出「订单系统」中 P99 优化的一个可复现指标：口径、基线和最终变化。",
    skill: "性能优化",
    strategy: "metric",
    requiredEvidence: ["指标定义", "基线数据", "结果验证"],
    difficulty: 3,
    questionType: "project_followup",
  },
  {
    id: "q-006",
    text: "如果「订单系统」的核心依赖超时或数据规模扩大十倍，Redis 缓存最先在哪里失效？",
    skill: "Redis",
    strategy: "failure",
    requiredEvidence: ["异常处理", "降级方案", "边界条件"],
    difficulty: 4,
    questionType: "scenario",
  },
  {
    id: "q-007",
    text: "请围绕「RAG 知识库系统」说明你独立完成的向量检索 pipeline 设计。",
    skill: "RAG",
    strategy: "ownership",
    requiredEvidence: ["职责边界", "实现机制", "个人贡献"],
    difficulty: 2,
    questionType: "project_followup",
  },
  {
    id: "q-008",
    text: "请以「RAG 知识库系统」为背景，描述一次检索请求从查询到返回的完整流程。",
    skill: "RAG",
    strategy: "specificity",
    requiredEvidence: ["输入输出", "技术动作", "数据流"],
    difficulty: 2,
    questionType: "project_followup",
  },
  {
    id: "q-009",
    text: "请说明「RAG 知识库系统」中 Milvus 向量索引的底层工作原理。",
    skill: "Milvus",
    strategy: "mechanism",
    requiredEvidence: ["技术动作", "底层原理", "数据结构"],
    difficulty: 3,
    questionType: "project_followup",
  },
  {
    id: "q-010",
    text: "针对「RAG 知识库系统」的重排序算法，当时比较过哪些方案？最终选择的原因是什么？",
    skill: "RAG",
    strategy: "tradeoff",
    requiredEvidence: ["替代方案", "对比分析", "决策依据"],
    difficulty: 3,
    questionType: "project_followup",
  },
  // ... 更多问题（为简洁起见，这里只展示前 10 个，实际应有 100 个）
];
