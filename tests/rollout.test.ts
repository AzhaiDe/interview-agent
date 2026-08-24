import assert from "node:assert/strict";
import test from "node:test";
import { rolloutDecision } from "../src/rollout.js";

test("rollout is deterministic for the same session", () => {
  const a = rolloutDecision("session-a");
  const b = rolloutDecision("session-a");
  assert.deepEqual(a, b);
});
