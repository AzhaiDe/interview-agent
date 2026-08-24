import assert from "node:assert/strict";
import test from "node:test";
import { compareGraphObservations, rolloutAllowed } from "../src/graph-shadow.js";

test("shadow comparison blocks semantic routing drift", () => {
  const result = compareGraphObservations({ nextAction: "answer" }, { nextAction: "finished" });
  assert.equal(result.compatible, false);
  assert.equal(result.severity, "blocking");
});

test("rollout requires enough samples and no blocking drift", () => {
  const sample = Array.from({ length: 100 }, () => compareGraphObservations({ nextAction: "answer" }, { nextAction: "answer" }));
  assert.equal(rolloutAllowed(sample).allowed, true);
  assert.equal(rolloutAllowed(sample.slice(0, 99)).allowed, false);
});
