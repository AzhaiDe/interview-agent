/**
 * Subgraph: technical_fundamentals
 * 技术原理子图：概念定义 → 内部机制 → 复杂度/性能 → 适用条件 → 不适用边界 → 与替代方案比较
 */

import type { InterviewGraphState } from "../graph-state.js";

export const technicalFundamentalsSubGraph = {
  name: "technical_fundamentals",
  interviewType: "technical_fundamentals" as const,

  steps: [
    { evidence: "概念定义", strategy: "specificity", objective: "establish_baseline" as const },
    { evidence: "实现机制", strategy: "mechanism", objective: "verify_mechanism" as const },
    { evidence: "复杂度/性能", strategy: "metric", objective: "test_metric" as const },
    { evidence: "适用条件", strategy: "ownership", objective: "verify_ownership" as const },
    { evidence: "不适用边界", strategy: "failure", objective: "test_failure" as const },
    { evidence: "选型权衡", strategy: "tradeoff", objective: "test_tradeoff" as const },
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
