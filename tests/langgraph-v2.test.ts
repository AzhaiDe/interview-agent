import assert from "node:assert/strict";
import test from "node:test";
import { interviewGraphV2 } from "../src/agent/langgraph-v2.js";

test("LangGraph V2 follows the seven-node opening path", async () => {
  const result = await interviewGraphV2.invoke({ sessionId: "s1", targetRole: "后端工程师", pressure: "high" }, { configurable: { thread_id: "test-v2" } });
  assert.equal(result.node, "wait_for_answer");
  assert.deepEqual(result.trace, ["load_context", "select_strategy", "compose_question", "question_guard", "wait_for_answer"]);
  assert.equal(result.nextAction, "answer");
});

test("LangGraph V2 persists and converges through three answer turns", async () => {
  const thread = `test-v2-${Date.now()}`;
  let result = await interviewGraphV2.invoke({ sessionId: thread, targetRole: "后端工程师", pressure: "high" }, { configurable: { thread_id: thread } });
  for (let i = 0; i < 3; i++) {
    result = await interviewGraphV2.invoke({ answer: `这是第 ${i + 1} 轮的具体技术回答，包含实现细节和结果。` }, { configurable: { thread_id: thread } });
  }
  assert.equal(result.nextAction, "finished");
  assert.equal(result.round, 3);
  assert.equal(result.node, "converge");
});
