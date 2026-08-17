/**
 * Node: retrieve_evidence_pack
 * Dual-layer RAG: Local KB + OmniMemory personal retrieval.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { InterviewGraphState, GraphNodeResult } from "../graph-state.js";
import { retrieveEvidencePack } from "../../knowledge-service.js";
import { omniMemory } from "../../omnimemory.js";
import { database } from "../../database.js";
import { recordDegradation, cacheVerifiedFacts, getCachedVerifiedFacts, hasCachedFacts } from "../fallbacks.js";

type KbRow = { id: string; entity_type: string; role_ids: string[]; status?: string; judge_status?: string; source_ids: string[]; content: Record<string, any>; tags?: string[] };
type KbSource = { id: string; platform: string; source_kind: string; status: string; title: string; url: string; role_ids: string[] };

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

function roleId(targetRole: string) {
  return roles.find((item) => item.match.test(targetRole))?.id || "ROLE_BACKEND_JAVA_GO";
}

export async function retrieveEvidencePackNode(state: InterviewGraphState): Promise<GraphNodeResult> {
  const prevEntry = [...state.trace.nodeHistory].reverse().find((e: any) => e.node === "retrieve_evidence_pack");
  if (prevEntry) prevEntry.exitedAt = new Date().toISOString();
  state.trace.nodeHistory.push({ node: "retrieve_evidence_pack", enteredAt: new Date().toISOString() });
  state.trace.currentNode = "retrieve_evidence_pack";

  const skill = state.currentThread.focusSkill;
  const strategy = state.questionPlan?.pressureStrategy || state.pressureState.strategy || "specificity";
  const role = roleId(state.candidate.targetRole);

  // Local KB retrieval with fallback to cached facts
  let pack = retrieveEvidencePack({
    roleId: role,
    query: state.questionPlan?.retrievalQuery || `${skill} ${strategy}`,
    skill,
    limit: 12,
  });

  // If KB retrieval returned no facts, try cached verified facts
  if (pack.facts.length === 0 && hasCachedFacts(role, skill)) {
    const cached = getCachedVerifiedFacts(role, skill);
    if (cached.length > 0) {
      pack.facts = cached;
      pack.retrievalTrace.excluded.push({
        id: "local_kb",
        reason: "KB empty; using cached verified facts",
      });
      recordDegradation(state, {
        nodeId: "retrieve_evidence_pack",
        reason: "local_kb_empty",
        fallbackUsed: "cached_verified_facts",
      });
    }
  }

  // Cache successful retrieval for future fallback
  if (pack.facts.length > 0) {
    cacheVerifiedFacts(role, skill, pack.facts);
  }

  // OmniMemory personal retrieval
  if (omniMemory.available()) {
    try {
      const groupId = `candidate:${state.ownerId}:interview:${state.session.id}`;
      const memories = await omniMemory.search({
        query: state.questionPlan?.retrievalQuery || `${state.candidate.targetRole} ${skill} ${strategy}`,
        deviceNo: database.memoryDeviceNo(state.ownerId),
        groupId,
        topK: 6,
      });
      pack.personalMemory = memories.map((m) => ({
        eventId: m.event_id || m.id || crypto.randomUUID(),
        source: m.source === "pending_message" ? "pending_message" : "memory",
        text: m.text,
        groupId: m.group_id,
        timestamp: m.timestamp,
      }));
      pack.provenance.memoryEventIds = pack.personalMemory.map((m) => m.eventId);
      pack.retrievalConfidence = Math.min(0.95, pack.retrievalConfidence + (pack.personalMemory.length ? 0.05 : 0));
    } catch {
      pack.retrievalTrace.excluded.push({
        id: "omnimemory",
        reason: "personal retrieval unavailable; local KB only",
      });
    }
  }

  state.retrieval = pack;
  state.trace.retrievalTrace = state.trace.retrievalTrace || [];
  (state.trace as any).retrievalTrace.push(pack.retrievalTrace);

  return { state, next: "plan_question" };
}
