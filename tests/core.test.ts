import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AppDatabase } from "../src/database.js";
import { createGraphSession } from "../src/agent-runtime.js";
import { redactSensitive } from "../src/pii.js";
import { pressurePolicy } from "../src/pressure-policy.js";
import { promptRegistry } from "../src/prompt-registry.js";
import { extractText } from "../src/resume.js";
import { OmniMemoryClient } from "../src/omnimemory.js";
import type { ResumeProfile } from "../src/types.js";

const profile: ResumeProfile = {
  rawText: "Java 项目", targetRole: "后端开发", summary: "测试候选人", education: [],
  recommendedRoles: [], skills: ["Java"], experiences: [], strengths: [], risks: [], questions: ["介绍项目"],
};

test("PII redaction removes contact identifiers", () => {
  const output = redactSensitive("联系 test@example.com，手机 13812345678，身份证 110101199001011234");
  assert.equal(output.includes("test@example.com"), false);
  assert.equal(output.includes("13812345678"), false);
  assert.equal(output.includes("110101199001011234"), false);
});

test("SQLite repository persists interview state across instances", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "offerpilot-test-"));
  const filename = path.join(directory, "test.sqlite");
  const first = new AppDatabase(filename);
  const session = createGraphSession(profile, 2);
  first.saveInterview("local-user", session);
  first.close();
  const second = new AppDatabase(filename);
  assert.equal(second.getInterview(session.id, "local-user")?.profile.targetRole, "后端开发");
  second.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("each user receives one stable opaque OmniMemory device number", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "offerpilot-device-test-"));
  const db = new AppDatabase(path.join(directory, "test.sqlite"));
  const first = db.memoryDeviceNo("user-alice");
  assert.match(first, /^user-device-[0-9a-f-]+$/);
  assert.equal(db.memoryDeviceNo("user-alice"), first);
  assert.notEqual(db.memoryDeviceNo("user-bob"), first);
  db.close();
  const reopened = new AppDatabase(path.join(directory, "test.sqlite"));
  assert.equal(reopened.memoryDeviceNo("user-alice"), first);
  reopened.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("SQLite stores downloadable resume attachment metadata", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "offerpilot-file-test-"));
  const db = new AppDatabase(path.join(directory, "test.sqlite"));
  db.recordUploadedFile({
    id: "file-1",
    ownerId: "local-user",
    purpose: "candidate-resume",
    resourceId: "resume-1",
    originalName: "候选人简历.pdf",
    storageKey: "candidate-resume/file-1.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    sha256: "abc",
  });
  assert.deepEqual(db.uploadedFileForResource("local-user", "resume-1"), {
    id: "file-1",
    storageKey: "candidate-resume/file-1.pdf",
    originalName: "候选人简历.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    createdAt: db.uploadedFileForResource("local-user", "resume-1")?.createdAt,
  });
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("pressure levels change deterministic interview policy", () => {
  assert.ok(pressurePolicy(5).scorePenalty > pressurePolicy(1).scorePenalty);
  assert.ok(pressurePolicy(5).scenarioInterval < pressurePolicy(2).scenarioInterval);
  assert.ok(pressurePolicy(5).maxClarifyPerTopic < pressurePolicy(1).maxClarifyPerTopic);
});


test("prompt registry loads every versioned model prompt", () => {
  const entries = promptRegistry.list();
  assert.equal(entries.length, 7);
  for (const entry of entries) {
    const prompt = promptRegistry.get(entry.key as Parameters<typeof promptRegistry.get>[0]);
    assert.match(prompt.version, /v3\.\d+$/);
    assert.ok(prompt.system.length > 30);
  }
});

test("file content validation rejects a renamed fake PDF", async () => {
  await assert.rejects(() => extractText("resume.pdf", Buffer.from("not a pdf")), /不是有效 PDF/);
});

test("idempotency keys reject semantic reuse through stored request hash", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "offerpilot-idempotency-"));
  const db = new AppDatabase(path.join(directory, "test.sqlite"));
  db.saveIdempotent("local-user", "turn-1", "hash-a", { score: 7 });
  const saved = db.getIdempotent("local-user", "turn-1");
  assert.equal(saved?.requestHash, "hash-a");
  assert.deepEqual(saved?.response, { score: 7 });
  db.close(); fs.rmSync(directory, { recursive: true, force: true });
});

test("OmniMemory retrieval enforces group isolation, deduplication and PII redaction", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ success: true, data: { evidence_details: [
    { id: "m1", source: "pending_message", group_id: "candidate:u1:role:backend", text: "薄弱点：幂等恢复，联系 test@example.com" },
    { id: "m1", group_id: "candidate:u1:role:backend", text: "重复结果" },
    { id: "m2", group_id: "candidate:u2:role:backend", text: "其他用户记忆" },
  ] } }), { status: 200, headers: { "content-type": "application/json" } });
  const client = new OmniMemoryClient({ enabled: true, apiKey: "test-key", baseUrl: "https://memory.test/api/v2", fetchImpl: fetchImpl as typeof fetch });
  const results = await client.search({ query: "历史薄弱点", deviceNo: "candidate:u1", groupId: "candidate:u1:role:backend", topK: 5 });
  assert.equal(results.length, 1);
  assert.equal(results[0].text.includes("test@example.com"), false);
  assert.equal(results[0].source, "pending_message");
  assert.equal(results[0].group_id, "candidate:u1:role:backend");
});

test("OmniMemory ingest keeps session and group equal for production isolation", async () => {
  let payload: any;
  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ success: true, data: { job_id: "job-1", status: "queued" } }), { status: 202, headers: { "content-type": "application/json" } });
  };
  const client = new OmniMemoryClient({ enabled: true, apiKey: "test-key", baseUrl: "https://memory.test/api/v2", fetchImpl: fetchImpl as typeof fetch });
  await client.ingest({ turns: [{ role: "assistant", content: "已证明性能优化能力" }], deviceNo: "candidate:u1", sessionId: "interview:1", groupId: "candidate:u1:role:backend", groupName: "后端训练", commitId: "turn:1" });
  assert.equal(payload.session_id, "candidate:u1:role:backend");
  assert.equal(payload.group_id, "candidate:u1:role:backend");
  assert.equal(payload.client_meta.device_no, "candidate:u1");
});
