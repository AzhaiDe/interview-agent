/**
 * Node: question_guard
 *
 * Validates the pending question against quality rules per PRD §6.6.
 *
 * 9 checks total:
 * 1. Out of scope (岗位范围外)
 * 2. Duplicate (与历史问题重复)
 * 3. Multiple questions (多个主问题)
 * 4. Too short or too long (长度)
 * 5. Leading / suggestive (诱导性) ← new
 * 6. Discriminatory (歧视性) ← new
 * 7. Unprofessional / hurtful (不专业或伤害性) ← new
 * 8. KB-uncovered strong claims (KB 未覆盖强结论) ← new
 * 9. Contains non-existent resume facts (简历不存在事实) ← new
 *
 * Falls back to a safe template after N failed attempts.
 */

import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";

// ---- Detection patterns ----

const leadingPatterns = [
  /你是不是(觉得|认为|应该|知道)/,
  /难道不(是|应该|觉得|认为)/,
  /你应该(知道|明白|懂得|承认)/,
  /你(肯定|一定|必然)(是|会|能)/,
  /这不是(很明显|显而易见|理所当然)/,
  /谁不(知道|明白|认为)/,
  /Obviously,? /i,
  /Don't you (think|agree|believe)/i,
  /You (must|certainly|definitely)/i,
  /Isn't it (obvious|clear|evident)/i,
];

const discriminatoryPatterns = [
  // Age
  /(?:你|候选人)(?:太|年纪|年龄)(?:老|年轻|大|小)/,
  /\d{2}岁(?:太|应该|还)/,
  // Gender
  /女(?:生|孩子|人)(?:不适合|应该|不太)/,
  /男(?:生|孩子|人)(?:应该|就是|都)/,
  // Region / school
  /(?:你们|那个|这个)(?:学校|大学|地区|地方)(?:不行|不好|差)/,
  /(?:三本|专科|二本)(?:出来|毕业)(?:就|只能)/,
  // General
  /(?:你这种|你们这类|像你们这样)(?:人|背景|学历)/,
];

const unprofessionalPatterns = [
  // Mocking / insulting
  /这么(简单|基础|容易)都(不会|不懂|不明白)/,
  /你(根本|完全|居然)(不|没)(会|懂|理解|掌握)/,
  /怎么(可能|会)(不知道|不懂|不理解)/,
  /这都(不知道|不懂|不理解|不会)/,
  /太(差|烂|菜|笨|蠢)了/,
  /简直(是|太)( waste|糟糕|离谱)/,
  /you\s+(don'?t|can'?t)\s+(even\s+)?(know|understand)/i,
  /this\s+is\s+(so|very)\s+(basic|simple|stupid)/i,
  // Personal attack
  /你(是不是|怎么)(这么|这么|这样)(笨|蠢|傻|差)/,
  /你(?:的|这个)(?:水平|能力|回答)(?:太|很)(?:差|烂|糟)/,
];

// ---- Strong claim detection (needs KB backing) ----

const strongClaimPatterns = [
  /(?:必须|一定|必然|只能|唯一)(?:使用|采用|选择|是)/,
  /(?:绝对|完全|100%)(?:正确|错误|不行|不能)/,
  /(?:所有|每个|任何)(?:情况|场景|项目)(?:都|都一定)/,
  /(?:never|always|must|only)\s+(use|choose|is)/i,
];

// ---- Resume fact detection (claims that need resume grounding) ----

const resumeFactPatterns = [
  /你(?:在|之前)(?:公司|项目)(?:做|负责|实现)了([^，。]+?)(?:多少|几个|几年)/,
  /你(?:带|管理)(?:了)?\s*(\d+)\s*人/,
  /你(?:在|到)(?:公司|项目)(?:多久|几年|多长时间)/,
];

// ---- Main node ----

export function questionGuardNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "question_guard");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "question_guard", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "question_guard";

  const question = state.pendingQuestion;
  if (!question) {
    return { state, next: "compose_question" };
  }

  const text = question.text;
  const transcript = state.transcript;

  const reject = (reason: string, category?: string): GraphNodeResult => {
    state.questionGuardAttempts += 1;
    question.valid = false;
    question.invalidReason = reason;
    (question as any).invalidCategory = category || "quality";

    // After N failed attempts, fall back to a safe template
    if (state.questionGuardAttempts >= state.maxQuestionGuardAttempts) {
      const skill = state.currentThread.focusSkill || question.mappedSkill;
      const project = state.currentThread.focusExperienceTitle || question.topic || "这个项目";
      question.text = `请围绕「${project}」补充${skill}的一个具体实现细节，并说明你如何验证它。`;
      question.questionType = state.session.interviewType === "technical_fundamentals" ? "knowledge" : "project_followup";
      question.strategy = "guard_fallback";
      question.valid = true;
      question.invalidReason = undefined;
      (question as any).invalidCategory = undefined;
      return { state, next: "wait_for_answer" };
    }
    return { state, next: "compose_question" };
  };

  // Check 1: out of scope
  if (state.rubric.outOfScope.some((term) => text.includes(term))) {
    return reject("问题包含岗位范围外的内容", "scope");
  }

  // Check 2: duplicate (semantic similarity with recent questions)
  const recentQuestions = transcript
    .filter((t) => t.role === "interviewer")
    .slice(-5)
    .map((t) => t.text);

  const normalized = text.replace(/\s+/g, "").toLowerCase();
  const isDuplicate = recentQuestions.some((q) => {
    const nq = q.replace(/\s+/g, "").toLowerCase();
    if (nq === normalized) return true;
    const left = new Set(normalized.split("").filter(Boolean));
    const right = new Set(nq.split("").filter(Boolean));
    const overlap = [...left].filter((c) => right.has(c)).length;
    const union = new Set([...left, ...right]).size || 1;
    return overlap / union >= 0.86;
  });

  if (isDuplicate) {
    return reject("问题与近期问题重复", "duplicate");
  }

  // Check 3: multiple questions in one
  const questionMarks = (text.match(/？|\?/g) || []).length;
  if (questionMarks > 2) {
    return reject("问题包含多个主问题", "multi_question");
  }

  // Check 4: too short or too long
  if (text.length < 8) {
    return reject("问题过短", "length");
  }
  if (text.length > 1200) {
    return reject("问题过长", "length");
  }

  // Check 5: leading / suggestive
  if (leadingPatterns.some((p) => p.test(text))) {
    return reject("问题包含诱导性表述", "leading");
  }

  // Check 6: discriminatory
  if (discriminatoryPatterns.some((p) => p.test(text))) {
    return reject("问题包含歧视性内容", "discriminatory");
  }

  // Check 7: unprofessional / hurtful
  if (unprofessionalPatterns.some((p) => p.test(text))) {
    return reject("问题包含不专业或伤害性表达", "unprofessional");
  }

  // Check 8: KB-uncovered strong claims
  const hasStrongClaim = strongClaimPatterns.some((p) => p.test(text));
  if (hasStrongClaim) {
    // Only reject if there's no verified KB fact supporting this
    const facts = state.retrieval?.facts || [];
    const hasMatchingFact = facts.some((f) => {
      const factText = (f as any).statement || "";
      const overlap = [...new Set(normalized.split(""))].filter((c) =>
        new Set(factText.split("")).has(c)
      ).length;
      return overlap >= 5;
    });
    if (!hasMatchingFact && facts.length > 0) {
      return reject("问题包含知识库未覆盖的强结论", "kb_uncovered");
    }
  }

  // Check 9: contains non-existent resume facts
  const candidateText = [
    ...state.candidate.experiences.map((e) => e.title),
    ...state.candidate.experiences.flatMap((e) => e.technologies),
    state.candidate.profileSummary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Only flag if the question references specific resume facts that don't exist
  const resumeRefPattern = /你(?:在|之前)(?:的)?(?:项目|公司|团队)(?:中|里)?(?:做|实现|负责)了?([^，。？\s]{2,20})/;
  const resumeRefMatch = text.match(resumeRefPattern);
  if (resumeRefMatch) {
    const referenced = resumeRefMatch[1].toLowerCase();
    if (referenced.length >= 3 && !candidateText.includes(referenced)) {
      return reject("问题引用了简历中不存在的事实", "resume_hallucination");
    }
  }

  question.valid = true;
  return { state, next: "wait_for_answer" };
}
