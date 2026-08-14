import type { InterviewSession, NextInterviewQuestion } from "./types.js";

export type PressurePolicy = {
  level: number;
  evidenceStrictness: string;
  scorePenalty: number;
  maxClarifyPerTopic: number;
  maxDepthPerTopic: number;
  scenarioInterval: number;
  promptInstruction: string;
};

const policies: Record<number, PressurePolicy> = {
  1: { level: 1, evidenceStrictness: "允许候选人补充背景，至少说明个人职责", scorePenalty: 0, maxClarifyPerTopic: 3, maxDepthPerTopic: 2, scenarioInterval: 99, promptInstruction: "引导式提问，允许先说明背景，再温和追问一个实现细节。" },
  2: { level: 2, evidenceStrictness: "要求职责和一个实现步骤", scorePenalty: 0, maxClarifyPerTopic: 2, maxDepthPerTopic: 3, scenarioInterval: 5, promptInstruction: "连续核查实现细节，但提供清晰的问题边界。" },
  3: { level: 3, evidenceStrictness: "要求职责、机制、权衡和指标口径", scorePenalty: .5, maxClarifyPerTopic: 2, maxDepthPerTopic: 3, scenarioInterval: 4, promptInstruction: "直接要求权衡、基线、指标与验证方式，减少泛泛背景。" },
  4: { level: 4, evidenceStrictness: "要求失败场景、规模变化和恢复策略", scorePenalty: .75, maxClarifyPerTopic: 1, maxDepthPerTopic: 4, scenarioInterval: 3, promptInstruction: "加入反例、故障和十倍规模变化，交叉验证实现可信度。" },
  5: { level: 5, evidenceStrictness: "高密度核查职责、机制、异常和数据可信度", scorePenalty: 1, maxClarifyPerTopic: 1, maxDepthPerTopic: 4, scenarioInterval: 2, promptInstruction: "高密度交叉验证职责边界、机制、异常与指标口径；保持专业，禁止侮辱。" },
};

export function pressurePolicy(level: number): PressurePolicy {
  return policies[Math.max(1, Math.min(5, Math.round(level)))] || policies[3];
}

export function applyPressurePolicy(session: InterviewSession) {
  const policy = pressurePolicy(session.pressure);
  session.maxClarifyPerTopic = policy.maxClarifyPerTopic;
  session.maxDepthPerTopic = policy.maxDepthPerTopic;
  return policy;
}

export function pressureQuestion(session: InterviewSession, skill: string, topic: string, action: "clarify" | "advance" | "pivot"): NextInterviewQuestion {
  const policy = pressurePolicy(session.pressure);
  const scenario = session.pressure >= 4 && (session.questionIndex + 1) % policy.scenarioInterval === 0;
  if (scenario) return { text: `针对「${topic}」做一次压力验证：如果流量或数据规模扩大 10 倍，同时核心依赖故障，你负责的模块会先在哪里失效？请给出监控信号、降级和恢复步骤。`, topic, mappedSkill: skill, questionType: "scenario", depth: Math.min(5, session.topicDepth + 1) };
  if (action === "clarify") return { text: session.pressure >= 3 ? `不要重复背景。围绕「${topic}」补充一个你亲自做出的关键决策、替代方案、指标口径和验证结果。` : `请继续围绕「${topic}」补充你亲自实现的步骤和验证结果。`, topic, mappedSkill: skill, questionType: "project_followup", depth: Math.min(5, session.topicDepth + 1) };
  const project = session.focusExperienceTitle || session.profile.experiences[0]?.title || "刚才的项目";
  return { text: `继续以「${project}」为背景，从「${skill}」这个角度看，你本人做出的关键决策是什么${session.pressure >= 3 ? "，当时如何权衡并验证结果" : "，具体如何落地"}？`, topic: project, mappedSkill: skill, questionType: session.pressure >= 4 ? "scenario" : "project_followup", depth: 1 };
}
