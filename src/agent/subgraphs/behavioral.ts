/**
 * Subgraph: behavioral
 * 行为面试子图：情境 → 个人任务 → 实际行动 → 决策依据 → 结果 → 反思 → 迁移到新场景
 */

import type { InterviewGraphState } from "../graph-state.js";

export const behavioralSubGraph = {
  name: "behavioral",
  interviewType: "behavioral" as const,

  steps: [
    { evidence: "情境", strategy: "specificity", objective: "establish_baseline" as const },
    { evidence: "个人任务", strategy: "ownership", objective: "verify_ownership" as const },
    { evidence: "实际行动", strategy: "mechanism", objective: "verify_mechanism" as const },
    { evidence: "决策依据", strategy: "tradeoff", objective: "test_tradeoff" as const },
    { evidence: "结果", strategy: "metric", objective: "test_metric" as const },
    { evidence: "反思", strategy: "specificity", objective: "establish_baseline" as const },
    { evidence: "迁移到新场景", strategy: "failure", objective: "test_failure" as const },
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
