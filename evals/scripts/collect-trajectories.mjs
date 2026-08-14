#!/usr/bin/env node
/**
 * Interview trajectory collector.
 *
 * Exports complete interview sessions from the SQLite database as JSONL,
 * formatted for expert annotation. Each trajectory includes the full turn-
 * by-turn conversation, evaluation outcomes, and annotation placeholders.
 *
 * Output schema per trajectory:
 *   {
 *     sessionId, ownerId, createdAt, updatedAt, status,
 *     targetRole, pressure, interviewType,
 *     turns: [{
 *       roundNo, questionId, question, topic, mappedSkill, questionType, depth,
 *       answer, evaluation: { score, action, ... }
 *     }],
 *     annotation: { annotatorId, overallQuality, perTurn: [...], comments }
 *   }
 *
 * Usage:
 *   node evals/scripts/collect-trajectories.mjs [--output FILE] [--owner ID] [--limit N]
 */

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const outputPath = flag("output") || "evals/datasets/gold/trajectories.jsonl";
const ownerFilter = flag("owner");
const limit = flag("limit") ? Number(flag("limit")) : null;

const dbPath = path.resolve(root, "data-v2/offerpilot.sqlite");
const db = new Database(dbPath, { readonly: true });

// Fetch sessions
const sessionRows = db.prepare(`
  SELECT id, owner_id, status, state_json, created_at, updated_at
  FROM interview_sessions
  WHERE deleted_at IS NULL
    ${ownerFilter ? "AND owner_id = ?" : ""}
  ORDER BY created_at DESC
  ${limit ? `LIMIT ${limit}` : ""}
`).all(...(ownerFilter ? [ownerFilter] : []));

console.error(`[trajectories] found ${sessionRows.length} sessions`);

const trajectories = [];

for (const row of sessionRows) {
  let state;
  try {
    state = JSON.parse(row.state_json);
  } catch {
    console.error(`  [trajectories] skipping ${row.id}: invalid state_json`);
    continue;
  }

  // Fetch questions for this session
  const questions = db.prepare(`
    SELECT id, round_no, text, topic, mapped_skill, question_type, depth, created_at
    FROM interview_questions
    WHERE session_id = ?
    ORDER BY round_no ASC
  `).all(row.id);

  // Fetch answers indexed by question_id
  const answers = db.prepare(`
    SELECT question_id, answer_text, round_no
    FROM interview_answers
    WHERE session_id = ?
    ORDER BY round_no ASC
  `).all(row.id);
  const answerByQid = new Map(answers.map((a) => [a.question_id, a]));
  // Also index by round_no in case question_id is null
  const answerByRound = new Map(answers.map((a) => [a.round_no, a]));

  // Fetch evaluations indexed by round_no
  const evaluations = db.prepare(`
    SELECT round_no, evaluation_json
    FROM interview_evaluations
    WHERE session_id = ?
    ORDER BY round_no ASC
  `).all(row.id);
  const evalByRound = new Map();
  for (const ev of evaluations) {
    try { evalByRound.set(ev.round_no, JSON.parse(ev.evaluation_json)); } catch {}
  }

  const turns = [];
  for (const q of questions) {
    const ans = answerByQid.get(q.id) || answerByRound.get(q.round_no);
    const evaluation = evalByRound.get(q.round_no) || null;

    turns.push({
      roundNo: q.round_no,
      questionId: q.id,
      question: q.text,
      topic: q.topic,
      mappedSkill: q.mapped_skill,
      questionType: q.question_type,
      depth: q.depth,
      answer: ans?.answer_text || null,
      evaluation,
    });
  }

  if (!turns.length) continue;

  trajectories.push({
    sessionId: row.id,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    targetRole: state.profile?.targetRole || state.targetRole || null,
    pressure: state.pressure ?? null,
    interviewType: state.interviewType || state.phase || null,
    turnCount: turns.length,
    turns,
    annotation: {
      annotatorId: null,
      overallQuality: null,       // 1-5 Likert
      perTurn: turns.map(() => ({
        questionRelevance: null,  // 1-5
        scoreAgreement: null,     // boolean
        actionAgreement: null,    // boolean
        comment: "",
      })),
      comments: "",
    },
  });
}

db.close();

// Write output
const fullOutputPath = path.resolve(root, outputPath);
await fs.mkdir(path.dirname(fullOutputPath), { recursive: true });
const lines = trajectories.map((t) => JSON.stringify(t)).join("\n") + "\n";
await fs.writeFile(fullOutputPath, lines, "utf8");

console.error(`[trajectories] wrote ${trajectories.length} trajectories to ${outputPath}`);

const summary = {
  count: trajectories.length,
  outputPath,
  byRole: {},
  byStatus: {},
  avgTurns: 0,
};
for (const t of trajectories) {
  const role = t.targetRole || "unknown";
  summary.byRole[role] = (summary.byRole[role] || 0) + 1;
  summary.byStatus[t.status] = (summary.byStatus[t.status] || 0) + 1;
}
summary.avgTurns = trajectories.length
  ? Number((trajectories.reduce((s, t) => s + t.turnCount, 0) / trajectories.length).toFixed(1))
  : 0;

console.log(JSON.stringify(summary, null, 2));
