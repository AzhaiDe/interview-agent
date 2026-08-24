import assert from "node:assert/strict";
import test from "node:test";
import { interviewGraphV2 } from "../src/agent/langgraph-v2.js";

test("V2 answer state carries evidence, review gate and memory event", async () => {
  const thread = `evidence-${Date.now()}`;
  await interviewGraphV2.invoke({ sessionId: thread, targetRole: "后端工程师", pressure: "high" }, { configurable: { thread_id: thread } });
  const result = await interviewGraphV2.invoke({ answer: "x" }, { configurable: { thread_id: thread } });
  assert.equal(result.review.required, true);
  assert.equal(result.evidenceClaims[0].polarity, "unknown");
  assert.equal(result.memoryEventIds.length, 1);
});
