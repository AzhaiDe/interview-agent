/**
 * Node: compose_question
 * Generates a natural language question from the plan.
 */

import { z } from "zod";
import { modelGateway } from "../../model-gateway.js";
import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";
import { generateFallbackQuestion, recordDegradation } from "../fallbacks.js";

const questionSchema = z.object({
  text: z.string().min(8).max(800),
  topic: z.string().min(1),
  mappedSkill: z.string().min(1),
  questionType: z.enum(["project_followup", "knowledge", "scenario", "behavioral"]),
  depth: z.number().int().min(1).max(5),
  strategy: z.string().min(1),
});

function focusExperience(state: InterviewGraphState) {
  return state.candidate.experiences.find((x) => x.id === state.currentThread.focusExperienceId)
    || state.candidate.experiences[0];
}

/**
 * Try to compose a question using the model gateway.
 * Falls back to template-based composition when model is unavailable.
 */
async function composeWithModel(
  state: InterviewGraphState,
  plan: NonNullable<InterviewGraphState["questionPlan"]>,
  strategy: string
): Promise<{ text: string; fellback: boolean }> {
  if (!modelGateway.available()) {
    return { text: "", fellback: true };
  }

  try {
    const result = await modelGateway.structured({
      task: "agent.compose_question",
      promptVersion: "agent-graph-compose-v3",
      tier: "fast",
      system: `你是资深技术面试官。根据面试计划和候选人背景，生成一个自然、精准的追问。

要求：
- 必须围绕候选人的真实项目经历
- 明确指向一个具体的技术点或决策
- 要求候选人提供可验证的证据（代码、数据、机制）
- 避免诱导性问题
- 长度不超过 200 字`,
      user: JSON.stringify({
        role: state.candidate.targetRole,
        skill: plan.targetSkillId,
        strategy,
        project: focusExperience(state)?.title,
        lastAnswer: state.transcript.filter((x) => x.role === "candidate").at(-1)?.text,
        requiredEvidence: plan.requiredEvidence,
        difficulty: plan.difficulty,
      }),
      schema: z.object({
        text: z.string().min(8).max(400),
      }),
      temperature: 0.4,
      traceId: `${state.trace.traceId}:compose`,
    });

    state.trace.modelCalls++;
    state.trace.tokensUsed += result.inputTokens + result.outputTokens;
    state.trace.latencyMs += result.latencyMs;
    (state.trace as any).modelRuns ||= [];
    (state.trace as any).modelRuns.push({
      task: "agent.compose_question",
      model: result.model,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    return { text: result.data.text, fellback: false };
  } catch (err) {
    recordDegradation(state, {
      nodeId: "compose_question",
      reason: "composer_model_failed",
      fallbackUsed: "template_based_composition",
      recoveredFrom: err instanceof Error ? err.message : String(err),
    });
    return { text: "", fellback: true };
  }
}

export async function composeQuestionNode(state: InterviewGraphState): Promise<GraphNodeResult> {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "compose_question");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "compose_question", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "compose_question";

  const plan = state.questionPlan!;
  const skill = plan.targetSkillId;
  const strategy = plan.pressureStrategy;
  const exp = focusExperience(state);
  const project = exp?.title || "你简历中的这个项目";
  const hook = state.transcript.filter((x) => x.role === "candidate").at(-1)?.text.replace(/\s+/g, " ").slice(0, 72) || "刚才描述的方案";
  const evidenceHint = state.questionPlan?.requiredEvidence.slice(0, 2).join("、") || "机制与边界";
  const retrievedHint = state.retrieval?.questions?.[0]?.content?.prompt || state.retrieval?.facts?.[0]?.statement || "";

  const variant = state.questionGuardAttempts;
  const prompts: Record<string, string[]> = {
    ownership: [
      `继续围绕「${project}」。你刚才提到"${hook}"，其中哪一项关键决策和代码是你独立完成的？团队其他人分别负责什么？`,
      `回到「${project}」的实现现场：请只讲清楚你亲自负责的模块、一个关键改动，以及如何证明这部分确实由你完成。`,
      `针对「${project}」补充职责边界：如果删掉你负责的代码，系统哪一步会失效？你做了什么验证？`,
    ],
    specificity: [
      `请以「${project}」为背景，具体讲一个真实请求从输入到输出的完整链路，并说明你本人负责的环节。`,
      `请沿着「${project}」描述一次请求的关键数据流：入口、核心处理、存储或下游调用分别是什么？`,
      `只聚焦「${project}」的一条真实链路：请求如何进入你的模块，经过哪些关键步骤，最后如何返回结果？`,
    ],
    mechanism: [
      `沿着「${project}」继续。你提到的${skill}在底层如何工作？请说明关键数据结构、调用链和一个容易出错的边界。`,
      `针对「${project}」中的${skill}，请解释一次核心调用在系统内部经过哪些组件，以及最容易出错的环节。`,
      `请从实现机制出发说明「${project}」的${skill}：关键状态如何保存、如何并发处理、边界条件是什么？`,
    ],
    tradeoff: [
      `针对「${project}」中的${skill}，当时比较过哪些替代方案？最终取舍依据的约束、代价和收益是什么？`,
      `如果重新设计「${project}」的${skill}，你会比较哪两个方案？请说明当时没有选择另一个方案的原因。`,
      `请具体说明「${project}」中${skill}的一次技术取舍：约束是什么，牺牲了什么，又换来了什么？`,
    ],
    metric: [
      `继续核验「${project}」的${skill}：你如何定义指标、选择样本和基线？结果提升多少，如何排除其他因素？`,
      `请给出「${project}」中${skill}的一个可复现指标：口径、基线、采样方式和最终变化分别是什么？`,
      `针对「${project}」的${skill}，你如何证明方案真的有效？请说明对照实验、数据范围和可能的误差来源。`,
    ],
    failure: [
      `做压力验证：如果「${project}」的核心依赖超时、数据规模扩大十倍或发生重复请求，${skill}最先在哪里失效？你如何定位、降级和恢复？`,
      `请针对「${project}」设计一个故障演练：核心依赖不可用时，${skill}会出现什么信号，你的降级和恢复顺序是什么？`,
      `如果「${project}」的流量突然扩大十倍并出现重复请求，${skill}的边界在哪里？请给出监控、保护和回滚方案。`,
    ],
  };

  const variants = prompts[strategy] || prompts.specificity;
  const templateText = variants[variant % variants.length];

  // Try model-based composition first, fall back to template
  let text: string;
  const modelResult = await composeWithModel(state, plan, strategy);
  if (!modelResult.fellback && modelResult.text) {
    text = `${modelResult.text} 请明确覆盖${evidenceHint}。`.slice(0, 780);
  } else {
    // Template-based fallback (always available)
    text = `${templateText} 请明确覆盖${evidenceHint}。${retrievedHint ? `参考知识点：${retrievedHint.slice(0, 100)}` : ""}`.slice(0, 780);
  }
  const questionType = state.session.interviewType === "system_design" || strategy === "failure"
    ? "scenario"
    : state.session.interviewType === "technical_fundamentals"
    ? "knowledge"
    : "project_followup";

  const question = questionSchema.parse({
    text,
    topic: project,
    mappedSkill: skill,
    questionType,
    depth: plan.difficulty,
    strategy,
  });

  state.pendingQuestion = {
    ...question,
    valid: true,
  };

  return { state, next: "question_guard" };
}
