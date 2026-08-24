import assert from "node:assert/strict";
import test from "node:test";
import { langGraphAnswer, langGraphOpening } from "../src/langgraph-session-adapter.js";
import { createGraphSession } from "../src/agent-runtime.js";

test("LangGraph session adapter maps opening and answer contracts", async () => {
  const session = createGraphSession({ targetRole: "后端工程师", experiences: [], skills: [], rawText: "", summary: "", education: [], recommendedRoles: [], strengths: [], risks: [], questions: [] } as any, 3);
  const opening = await langGraphOpening(session);
  assert.ok(opening.question);
  const answer = await langGraphAnswer(session, "我负责了检索链路的隔离和延迟优化，结果可复现。");
  assert.equal(answer.shouldFinish, false);
  assert.ok(answer.evidenceClaims.length > 0);
});
