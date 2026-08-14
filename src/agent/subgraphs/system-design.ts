/**
 * Subgraph: system_design
 * 系统设计子图：需求澄清 → 容量估算 → 核心组件 → 数据模型 → 一致性 → 故障恢复 → 可观测性 → 演进方案
 */

import type { InterviewGraphState } from "../graph-state.js";

export const systemDesignSubGraph = {
  name: "system_design",
  interviewType: "system_design" as const,

  steps: [
    { evidence: "需求澄清", strategy: "specificity", objective: "establish_baseline" as const },
    { evidence: "容量估算", strategy: "metric", objective: "test_metric" as const },
    { evidence: "核心组件", strategy: "mechanism", objective: "verify_mechanism" as const },
    { evidence: "数据模型", strategy: "ownership", objective: "verify_ownership" as const },
    { evidence: "一致性", strategy: "mechanism", objective: "verify_mechanism" as const },
    { evidence: "故障恢复", strategy: "failure", objective: "test_failure" as const },
    { evidence: "可观测性", strategy: "metric", objective: "test_metric" as const },
    { evidence: "演进方案", strategy: "tradeoff", objective: "test_tradeoff" as const },
  ],

  getCurrentStep(state: InterviewGraphState) {
    const covered = state.currentThread.coveredEvidence;
    for (const step of this.steps) {
      if (!covered.includes(step.evidence)) return step;
    }
    return this.steps[this.steps.length - 1];
  },

  isComplete(state: InterviewGraphState) {
    const covered = state.currentThread.coveredEvidence;
    return this.steps.every((step) => covered.includes(step.evidence));
  },
};
