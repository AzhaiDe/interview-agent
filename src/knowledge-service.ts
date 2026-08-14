import fs from "node:fs";
import path from "node:path";

export type KnowledgeStatus = "verified" | "candidate" | "pending_expert_review" | "rejected";
export type KnowledgeRow = { id: string; entity_type: string; role_ids: string[]; status?: KnowledgeStatus; judge_status?: KnowledgeStatus; source_ids: string[]; content: Record<string, any>; tags?: string[] };
export type KnowledgeSource = { id: string; platform: string; source_kind: string; status: KnowledgeStatus; title: string; url: string; role_ids: string[]; rights?: string; topics?: string[] };
export type EvidencePack = {
  roleId: string;
  query: string;
  facts: Array<{ entityId: string; statement: string; sourceIds: string[]; confidence: number }>;
  concepts: KnowledgeRow[];
  questions: KnowledgeRow[];
  followups: KnowledgeRow[];
  misconceptions: KnowledgeRow[];
  failureModes: KnowledgeRow[];
  sources: KnowledgeSource[];
  retrievalTrace: { lexical: string[]; graph: string[]; reranked: string[]; excluded: Array<{ id: string; reason: string }> };
  retrievalConfidence: number;
  personalMemory: Array<{ eventId: string; source: "memory" | "pending_message"; text: string; groupId?: string | null; timestamp?: string | null }>;
  provenance: { localEntityIds: string[]; memoryEventIds: string[]; generatedAt: string };
};

const root = path.resolve(process.cwd(), "knowledge-base");
function readRows(name: string): KnowledgeRow[] {
  const candidates = [path.join(root, "judged", `${name}.jsonl`), path.join(root, "generated", `${name}.jsonl`)];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as KnowledgeRow);
}
function readGeneratedCandidates(name: string): KnowledgeRow[] {
  const file = path.join(root, "generated", `${name}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as KnowledgeRow).filter((row) => row.status === "candidate");
}
function readSources(): KnowledgeSource[] { return readRows("sources") as unknown as KnowledgeSource[]; }

const rows: Record<string, KnowledgeRow[]> = {
  concepts: readRows("concepts"), questions: readRows("questions"), followups: readRows("followups"), misconceptions: readRows("misconceptions"), failure_modes: readRows("failure_modes"), scoring_anchors: readRows("scoring_anchors"), competencies: readRows("competencies"),
};
for (const type of ["questions", "followups"] as const) {
  const existing = new Set(rows[type].filter((row) => (row.judge_status || row.status) === "verified" || (row.judge_status || row.status) === "candidate").map((row) => row.id));
  rows[type] = [...rows[type], ...readGeneratedCandidates(type).filter((row) => !existing.has(row.id))];
}
const sources = readSources();

function tokens(value: string): string[] {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const latin = normalized.split(/\s+/).filter((x) => x.length > 1);
  const cjk = [...normalized.replace(/\s/g, "")].flatMap((_, index, chars) => index < chars.length - 1 ? [chars[index], chars.slice(index, index + 2).join("")] : [chars[index]]);
  return [...new Set([...latin, ...cjk])];
}
function searchable(row: KnowledgeRow) { return [row.content?.name, row.content?.canonical, row.content?.prompt, row.content?.statement, row.content?.scenario, row.content?.operator, ...(row.tags || [])].filter(Boolean).join(" "); }
function allowed(row: KnowledgeRow, mode: "fact" | "training") {
  const status = row.judge_status || row.status;
  if (mode === "fact") return status === "verified";
  return status === "verified" || status === "candidate";
}
function roleMatch(row: KnowledgeRow, roleId: string) { return row.role_ids.includes(roleId); }
function lexicalScore(query: string, row: KnowledgeRow) {
  const q = tokens(query); const d = tokens(searchable(row)); if (!q.length || !d.length) return 0;
  const set = new Set(d); const overlap = q.filter((token) => set.has(token)).length;
  const phraseBoost = searchable(row).toLowerCase().includes(query.toLowerCase()) ? 2 : 0;
  return overlap / Math.sqrt(q.length * d.length) + phraseBoost;
}
function sortRows(query: string, input: KnowledgeRow[], limit: number, mode: "fact" | "training") {
  return input.filter((row) => allowed(row, mode)).map((row) => ({ row, score: lexicalScore(query, row) })).filter((item) => item.score > 0 || !query.trim()).sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id)).slice(0, limit).map((item) => item.row);
}

export function knowledgeHealth() {
  const counts = Object.fromEntries(Object.entries(rows).map(([name, items]) => [name, { total: items.length, verified: items.filter((row) => (row.judge_status || row.status) === "verified").length, candidate: items.filter((row) => (row.judge_status || row.status) === "candidate").length, pending: items.filter((row) => (row.judge_status || row.status) === "pending_expert_review").length }]));
  return { root, sourceCount: sources.length, verifiedSources: sources.filter((source) => source.status === "verified").length, counts };
}

export function retrieveEvidencePack(input: { roleId: string; query: string; skill?: string; limit?: number }): EvidencePack {
  const query = [input.query, input.skill].filter(Boolean).join(" "); const limit = input.limit || 8;
  const roleRows = (type: keyof typeof rows) => rows[type].filter((row) => roleMatch(row, input.roleId));
  const trainingPool = [...roleRows("concepts"), ...roleRows("questions"), ...roleRows("followups"), ...roleRows("misconceptions"), ...roleRows("failure_modes")];
  const lexical = sortRows(query, trainingPool, limit * 4, "training");
  const graph = trainingPool.filter((row) => row.tags?.some((tag) => tokens(query).includes(tag.toLowerCase()))).filter((row) => allowed(row, "training")).slice(0, limit * 2);
  const merged = [...new Map([...lexical, ...graph].map((row) => [row.id, row])).values()];
  const reranked = merged.sort((a, b) => lexicalScore(query, b) - lexicalScore(query, a)).slice(0, limit);
  const factRows = sortRows(query, roleRows("concepts"), limit, "fact");
  const factIds = new Set(factRows.map((row) => row.id));
  const excluded = trainingPool.filter((row) => !allowed(row, "training") || ((row.judge_status || row.status) === "pending_expert_review" && factIds.has(row.id))).slice(0, 20).map((row) => ({ id: row.id, reason: `${row.judge_status || row.status} 不允许作为 verified 技术事实` }));
  const selectedSources = [...new Set(reranked.flatMap((row) => row.source_ids || []))].map((id) => sources.find((source) => source.id === id)).filter(Boolean) as KnowledgeSource[];
  const facts = factRows.map((row) => ({ entityId: row.id, statement: row.content.definition || row.content.name || "", sourceIds: row.source_ids, confidence: 0.85 }));
  return { roleId: input.roleId, query, facts, concepts: reranked.filter((row) => row.entity_type === "concept"), questions: reranked.filter((row) => row.entity_type === "question"), followups: reranked.filter((row) => row.entity_type === "followup"), misconceptions: reranked.filter((row) => row.entity_type === "misconception"), failureModes: reranked.filter((row) => row.entity_type === "failure_mode"), sources: selectedSources, retrievalTrace: { lexical: lexical.map((row) => row.id), graph: graph.map((row) => row.id), reranked: reranked.map((row) => row.id), excluded }, retrievalConfidence: facts.length ? 0.85 : reranked.length ? 0.45 : 0.1, personalMemory: [], provenance: { localEntityIds: [...new Set([...reranked, ...factRows].map((row) => row.id))], memoryEventIds: [], generatedAt: new Date().toISOString() } };
}

export function getKnowledgeRows(type: keyof typeof rows, input: { roleId?: string; status?: KnowledgeStatus; limit?: number } = {}) {
  return rows[type].filter((row) => (!input.roleId || roleMatch(row, input.roleId)) && (!input.status || (row.judge_status || row.status) === input.status)).slice(0, input.limit || 100);
}
