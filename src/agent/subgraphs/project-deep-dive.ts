/**
 * Subgraph: project_deep_dive
 * 项目深挖子图：职责边界 → 请求链路 → 关键机制 → 选型权衡 → 指标验证 → 故障边界
 */

import type { InterviewGraphState } from "../graph-state.js";

export const projectDeepDiveSubGraph = {
  name: "project_deep_dive",
  interviewType: "project_deep_dive" as const,

  // Each step maps to a pressure strategy in the main graph
  steps: [
    { evidence: "职责边界", strategy: "ownership", objective: "verify_ownership" as const },
    { evidence: "请求链路", strategy: "specificity", objective: "establish_baseline" as const },
    { evidence: "实现机制", strategy: "mechanism", objective: "verify_mechanism" as const },
    { evidence: "选型权衡", strategy: "tradeoff", objective: "test_tradeoff" as const },
    { evidence: "指标与口径", strategy: "metric", objective: "test_metric" as const },
    { evidence: "异常与边界", strategy: "failure", objective: "test_failure" as const },
  ],

  // Get the current step based on thread state
  getCurrentStep(state: InterviewGraphState) {
    const covered = state.currentThread.coveredEvidence;
    for (const step of this.steps) {
      if (!covered.includes(step.evidence)) return step;
    }
    return this.steps[this.steps.length - 1]; // All covered, use last
  },

  // Check if the subgraph is complete
  isComplete(state: InterviewGraphState) {
    const covered = state.currentThread.coveredEvidence;
    return this.steps.every((step) => covered.includes(step.evidence));
  },
};
