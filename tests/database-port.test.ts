import assert from "node:assert/strict";
import test from "node:test";
import { SqliteInterviewPersistence } from "../src/database-port.js";

test("SQLite adapter satisfies the interview persistence contract", () => {
  const adapter = new SqliteInterviewPersistence();
  adapter.ensureOwner("port-test-user");
  assert.equal(adapter.getInterview("missing", "port-test-user"), undefined);
});
