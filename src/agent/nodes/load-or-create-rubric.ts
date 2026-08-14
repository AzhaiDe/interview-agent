/**
 * Node: load_or_create_rubric
 * Creates or loads the role rubric from KB.
 */

import fs from "node:fs";
import path from "node:path";
import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";
import type { RoleRubric } from "../../types.js";

type KbRow = { id: string; entity_type: string; role_ids: string[]; status?: string; judge_status?: string; source_ids: string[]; content: Record<string, any>; tags?: string[] };

const root = path.resolve(process.cwd(), "knowledge-base");
const readJsonl = (name: string): KbRow[] => {
  const candidates = [path.join(root, "judged", `${name}.jsonl`), path.join(root, "generated", `${name}.jsonl`)];
  const file = candidates.find((item) => fs.existsSync(item));
  if (!file) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
};

const roles = [
  { id: "ROLE_BACKEND_JAVA_GO", match: /java|go|后端|服务端|基础架构|backend/i },
  { id: "ROLE_AI_RAG_LLM", match: /ai|rag|llm|agent|大模型|算法|模型/i },
  { id: "ROLE_FRONTEND", match: /前端|frontend|react|vue|web/i },
];

const evidenceTypes = ["职责边界", "实现机制", "选型权衡", "指标与口径", "验证与对照", "异常与边界"];

function roleId(targetRole: string) {
  return roles.find((item) => item.match.test(targetRole))?.id || "ROLE_BACKEND_JAVA_GO";
}

export function loadOrCreateRubricNode(state: InterviewGraphState): GraphNodeResult {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "load_or_create_rubric");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "load_or_create_rubric", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "load_or_create_rubric";

  if (state.session.roleRubric && state.session.roleRubric.version !== "initial") {
    state.rubric = state.session.roleRubric;
    return { state, next: "select_target_skill" };
  }

  const role = roleId(state.candidate.targetRole);
  const kb = { competencies: readJsonl("competencies") };
  const competencies = kb.competencies
    .filter((row) => row.role_ids?.includes(role))
    .slice(0, 30)
    .map((x) => x.content.name || x.tags?.[0])
    .filter(Boolean) as string[];

  const skills = [...new Set([...competencies.slice(0, 12), ...state.candidate.skills.slice(0, 8)])].slice(0, 18);

  const rubric: RoleRubric = {
    targetRole: state.candidate.targetRole,
    version: "kb-rubric-v2",
    mustHave: skills.map((skill) => ({
      skill,
      why: "岗位能力图要求",
      askAngles: ["机制", "权衡", "指标", "故障"],
      weight: 1,
      evidenceExpectations: [...evidenceTypes],
    })),
    niceToHave: competencies.slice(12),
    allowedTopics: competencies,
    outOfScope: ["敏感个人属性", "与岗位无关的人格判断"],
    coveragePlan: skills.map((skill) => ({ skill, minRounds: 1, maxRounds: 3 })),
  };

  state.rubric = rubric;
  state.session.roleRubric = rubric;

  // Initialize beliefs for must-have skills
  for (const item of rubric.mustHave) {
    state.abilityBeliefs[item.skill] ||= {
      skillId: item.skill,
      meanLevel: 2.5,
      uncertainty: 1,
      evidenceCount: 0,
      maxDifficultyPassed: 0,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
      misconceptions: [],
    };
  }

  return { state, next: "select_target_skill" };
}
