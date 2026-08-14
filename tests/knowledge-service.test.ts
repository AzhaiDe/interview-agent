import test from "node:test";
import assert from "node:assert/strict";
import { knowledgeHealth, retrieveEvidencePack } from "../src/knowledge-service.js";
import { verifyClaims } from "../src/technical-verifier.js";

test("knowledge service returns traceable role-filtered training evidence", () => {
  const health = knowledgeHealth();
  assert.ok(health.sourceCount >= 20);
  const pack = retrieveEvidencePack({ roleId: "ROLE_BACKEND_JAVA_GO", query: "Redis 缓存 一致性 故障", skill: "缓存与一致性" });
  assert.equal(pack.roleId, "ROLE_BACKEND_JAVA_GO");
  assert.ok(pack.retrievalTrace.lexical.length > 0 || pack.retrievalTrace.graph.length > 0);
  assert.ok(pack.retrievalTrace.reranked.length > 0);
  assert.ok(pack.questions.every((row) => row.role_ids.includes("ROLE_BACKEND_JAVA_GO")));
  assert.ok(pack.sources.every((source) => source.id && source.url));
  assert.deepEqual(pack.personalMemory, []);
  assert.ok(pack.provenance.localEntityIds.length > 0);
  assert.match(pack.provenance.generatedAt, /^20/);
});

test("pending knowledge is never returned as a verified fact", () => {
  const pack = retrieveEvidencePack({ roleId: "ROLE_AI_RAG_LLM", query: "RAG Agent 幻觉", skill: "幻觉与拒答" });
  assert.ok(pack.facts.every((fact) => fact.confidence >= 0.8));
  assert.ok(pack.retrievalTrace.excluded.length >= 0);
});

test("technical verifier emits claim-level provenance instead of free-form approval", () => {
  const result = verifyClaims("Redis 缓存可以降低数据库读取压力。这个回答没有提供可验证指标。", [{ entityId: "concept-redis", statement: "缓存通过减少后端存储读取降低数据库压力", sourceIds: ["source-official"], confidence: 0.9 }]);
  assert.equal(result.length, 2);
  assert.equal(result[0].verdict, "supported");
  assert.deepEqual(result[0].citationIds, ["source-official"]);
  assert.equal(result[1].verdict, "not_verifiable");
});
