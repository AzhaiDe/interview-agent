import assert from "node:assert/strict";
import test from "node:test";
import { parseDatabaseDriver, parseGraphEngine } from "../src/runtime-flags.js";

test("runtime flags preserve legacy defaults", () => {
  assert.equal(parseGraphEngine(undefined), "legacy");
  assert.equal(parseDatabaseDriver(undefined), "sqlite");
});

test("runtime flags reject unknown values safely", () => {
  assert.equal(parseGraphEngine("unknown"), "legacy");
  assert.equal(parseDatabaseDriver("mysql"), "sqlite");
});

test("runtime flags accept planned engines and drivers", () => {
  assert.equal(parseGraphEngine("langgraph"), "langgraph");
  assert.equal(parseGraphEngine("shadow"), "shadow");
  assert.equal(parseDatabaseDriver("postgres"), "postgres");
});
