import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGraphSession, createInterviewOpening, evaluateInterviewAnswer, createGrowthReport, interviewUtility, sessionCritic, aggregateJudges } from "../src/agent-runtime.js";
import type { ResumeProfile } from "../src/types.js";
import { ExecutableGraph } from "../src/graph-runtime.js";
import { AppDatabase } from "../src/database.js";
import { questionGuardNode } from "../src/agent/nodes/question-guard.js";

// The lifecycle tests below intentionally exercise deterministic fallback so
// they do not depend on a remote model or memory service.
process.env.MODEL_ENABLED = "false";
process.env.OMNIMEMORY_ENABLED = "false";

const profile: ResumeProfile = {
  rawText: "项目：订单系统。负责接口幂等、Redis 缓存和 MySQL 索引，P99 从 120ms 降到 80ms。",
  targetRole: "Java 后端工程师",
  summary: "后端工程师",
  education: [],
  recommendedRoles: [],
  skills: ["Java", "Redis", "MySQL"],
  strengths: [],
  risks: [],
  questions: [],
  experiences: [{ id: "exp-1", title: "订单系统", type: "project", summary: "订单系统", bullets: ["负责接口幂等和缓存"], technologies: ["Java", "Redis", "MySQL"], claims: [], highlights: ["P99 80ms"], risks: [] }],
};

test("new graph runtime creates a checkpointable opening and evidence state", async () => {
  const session = createGraphSession(profile, 4, "project_deep_dive");
  const opening = await createInterviewOpening("test-owner", session);
  assert.equal(session.state, "asking");
  assert.equal(typeof opening.question, "string");
  assert.equal((session as any).agentRuntime.graphVersion, "offerpilot-interview-graph-v1");
  const outcome = await evaluateInterviewAnswer("test-owner", session, "我负责接口幂等和缓存设计，使用唯一业务键避免重复写入，P99 从 120ms 降到 80ms，并通过压测和灰度验证。依赖超时时会降级并告警。");
  assert.ok(outcome.evaluation.evidenceCovered.includes("职责边界"));
  assert.ok(outcome.evaluation.evidenceCovered.includes("指标与口径"));
  assert.equal((session as any).agentRuntime.evidenceLedger.length, 1);
  assert.ok((session as any).agentRuntime.beliefs[session.diagnoses[0].mappedSkill]);
});

test("new graph runtime distinguishes insufficient evidence from technical proof", async () => {
  const session = createGraphSession(profile, 2, "technical_fundamentals");
  await createInterviewOpening("test-owner", session);
  const outcome = await evaluateInterviewAnswer("test-owner", session, "嗯，我用过 Java 和 Redis，差不多就是这样。");
  assert.ok(outcome.evaluation.missingEvidence.length > 0);
  assert.ok(outcome.evaluation.score < 7);
  const report = await createGrowthReport(session);
  assert.equal(report.coachMode, "evidence_based");
  assert.ok(Array.isArray(report.weakPoints));
});

test("utility selector accounts for uncertainty, relevance and fatigue", () => {
  const session = createGraphSession(profile, 3);
  const skills = session.roleRubric!.mustHave.map((item) => item.skill);
  assert.ok(skills.length > 0);
  const first = skills[0];
  session.profile.experiences[0].technologies.push(first);
  const before = interviewUtility(session, first);
  session.skillRoundCounts[first] = 3;
  const after = interviewUtility(session, first);
  assert.ok(after < before);
});

test("session critic protects against budget and fatigue exhaustion", () => {
  const session = createGraphSession(profile, 3);
  const state = (session as any).agentRuntime;
  state.pressure.fatigue = 8;
  const result = sessionCritic(session, ["实现机制"]);
  assert.equal(result.shouldFinish, true);
  assert.equal(result.severeMissing, true);
});

test("judge aggregation preserves configured role weights when a model judge is unavailable", () => {
  const result = (score: number) => ({ score, relevance: 1, confidence: 0.8, evidenceCovered: [], missingEvidence: [], verdict: "partial" as const, feedback: "ok" });
  const aggregate = aggregateJudges([{ kind: "base", result: result(4) }, { kind: "communication", result: result(8) }]);
  assert.equal(aggregate.score, 5.7);
  assert.equal(aggregate.weights.technical, 0);
  assert.equal(aggregate.weights.base, 0.5714);
  assert.equal(aggregate.weights.communication, 0.4286);
});

test("executable graph checkpoints, interrupts and resumes", async () => {
  const seen: string[] = [];
  const graph = new ExecutableGraph<{ count: number }>({
    version: "test-graph-v1", start: "a", interrupts: new Set(["b"]),
    nodes: {
      a: (state) => { seen.push("a"); return { state: { count: state.count + 1 } }; },
      b: (state) => { seen.push("b"); return { state, interrupt: { reason: "human_review" } }; },
      c: (state) => { seen.push("c"); return { state: { count: state.count + 1 } }; },
    },
    edges: { a: "b", b: "c" },
  });
  const paused = await graph.run({ count: 0 });
  assert.equal(paused.status, "interrupted");
  assert.deepEqual(seen, ["a", "b"]);
  const resumed = await graph.resume(paused.checkpoints.at(-1)!);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.state.count, 2);
});

test("question guard falls back after bounded repair attempts", () => {
  const session = createGraphSession(profile, 3, "project_deep_dive");
  const state = (session as any)._graphState;
  state.rubric = session.roleRubric;
  state.currentThread.focusSkill = "Java";
  state.currentThread.focusExperienceTitle = "订单系统";
  state.maxQuestionGuardAttempts = 1;
  state.pendingQuestion = {
    text: "历史问题？",
    topic: "订单系统",
    mappedSkill: "Java",
    questionType: "project_followup",
    depth: 1,
    strategy: "specificity",
  };
  state.transcript = [{ role: "interviewer", text: "历史问题？" }];
  const result = questionGuardNode(state);
  assert.equal(result.next, "wait_for_answer");
  assert.equal(state.pendingQuestion.valid, true);
  assert.equal(state.pendingQuestion.strategy, "guard_fallback");
});

test("SQLite round-trip preserves graph state and supports three answer turns", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "offerpilot-p0-"));
  const db = new AppDatabase(path.join(directory, "roundtrip.sqlite"));
  const ownerId = "local-user";
  try {
    let session = createGraphSession(profile, 3, "project_deep_dive");
    session.questionBudget = 3;
    await createInterviewOpening(ownerId, session);
    db.saveInterview(ownerId, session);
    db.saveGraphCheckpoint(ownerId, session);
    // Simulate a pre-migration/session write that lost the denormalized graph
    // column. The repository must still recover the latest checkpoint state.
    (db as any).db.prepare("UPDATE interview_sessions SET graph_state_json=NULL WHERE id=?").run(session.id);

    session = db.getInterview(session.id, ownerId)!;
    assert.ok((session as any)._graphState);
    assert.equal((session as any)._graphState.currentThread.focusSkill, session.currentMappedSkill);

    const answers = [
      "我负责接口实现，通过唯一业务键保证幂等，并用压测验证。",
      "我设计了缓存和索引，P99 从 120ms 降到 80ms，并做了灰度。",
      "依赖超时会降级、熔断、告警并回滚。",
    ];
    for (const answer of answers) {
      const outcome = await evaluateInterviewAnswer(ownerId, session, answer);
      assert.ok(outcome.evaluation.answeredSkill.length > 0);
      db.saveInterview(ownerId, session);
      session = db.getInterview(session.id, ownerId)!;
      assert.ok((session as any)._graphState);
      assert.equal(session.diagnoses.length, session.questionIndex);
      assert.ok(session.diagnoses.at(-1)?.mappedSkill);
    }
    assert.equal(session.diagnoses.length, 3);
    assert.equal((session as any)._graphState.evidenceLedger.length, 3);
    assert.equal(session.transcript.filter((turn) => turn.role === "interviewer").length, 3);
    assert.equal(session.transcript.filter((turn) => turn.role === "candidate").length, 3);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
