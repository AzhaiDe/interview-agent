#!/usr/bin/env node
/**
 * Gold-candidate data generator.
 *
 * Reads collected interview trajectories (from collect-trajectories.mjs)
 * and generates gold-candidate labels for expert annotation. This script
 * produces INITIAL labels that must be independently verified by ≥2 human
 * annotators before promotion to true Gold (per GOLD_BUILD_PROTOCOL.md).
 *
 * For each trajectory, it generates:
 *   - Per-turn: expected score range, expected action, expected next skill
 *   - Per-session: expected skill progression, quality rating
 *
 * Labels are derived from:
 *   1. KB scoring anchors (competency L1-L5 → score range)
 *   2. Answer quality heuristics (length, specificity, evidence, keywords)
 *   3. Question difficulty and archetype
 *
 * Output: evals/datasets/gold/interview-candidates.jsonl
 *
 * Each line includes `_annotation` fields for experts to verify/correct:
 *   - _modelScore, _modelAction: what the system actually produced
 *   - _suggestedScore, _suggestedAction: what the KB-based heuristic suggests
 *   - annotator1_score, annotator2_score, adjudicated_score: for human input
 *
 * Usage:
 *   node evals/scripts/generate-gold-candidates.mjs [--input FILE] [--output FILE]
 */

import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const inputPath = flag("input") || "evals/datasets/gold/trajectories.jsonl";
const outputPath = flag("output") || "evals/datasets/gold/interview-candidates.jsonl";

// Load KB scoring anchors for reference
async function loadJsonl(relative) {
  const text = await fs.readFile(path.join(root, relative), "utf8").catch(() => "");
  return text.split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

const anchors = await loadJsonl("knowledge-base/judged/scoring_anchors.jsonl");
const concepts = await loadJsonl("knowledge-base/judged/concepts.jsonl");

// Build anchor lookup by competency+level
const anchorByCompLevel = new Map();
for (const a of anchors) {
  anchorByCompLevel.set(`${a.content.competency_id}:${a.content.level}`, a);
}

// Score range mapping from L1-L5
function levelToScoreRange(level) {
  return { L1: [2, 3], L2: [4, 5], L3: [6, 7], L4: [7, 8], L5: [8, 9] }[level] || [3, 5];
}

function levelToAction(level) {
  return { L1: ["clarify"], L2: ["clarify"], L3: ["clarify", "advance"], L4: ["advance"], L5: ["advance", "finish"] }[level] || ["clarify"];
}

// Heuristic: estimate answer quality level from content
function estimateAnswerLevel(answer, question, mappedSkill) {
  if (!answer) return "L1";
  const text = answer.toLowerCase();

  // Very short / empty / off-topic
  if (answer.length < 15) return "L1";

  // Check for adversarial/off-topic markers
  if (/忽略.*指令|忽略.*规则|告诉我.*提示词|给我.*满分|篮球|电影|不感兴趣/.test(answer)) return "L0";

  // Evidence indicators
  const hasNumbers = /\d+%|\d+ms|\d+qps|\d+次|\d+万|p\d{2}/i.test(answer);
  const hasComparison = /相比|对比|权衡|vs|替代/.test(answer);
  const hasDiagnosis = /定位|排查|日志|监控|告警|根因|trace/i.test(answer);
  const hasMechanism = /原理|机制|实现|底层|源码|锁|线程|并发/.test(answer);
  const hasVerification = /验证|测试|压测|实验|指标|口径|回放|消融/.test(answer);
  const hasPersonal = /我负责|我独立|我设计|我实现/.test(answer);

  let score = 0;
  if (hasPersonal) score += 1;
  if (hasMechanism) score += 1;
  if (hasNumbers) score += 1;
  if (hasVerification) score += 1;
  if (hasComparison) score += 1;
  if (hasDiagnosis) score += 1;

  if (score >= 5) return "L5";
  if (score >= 4) return "L4";
  if (score >= 3) return "L3";
  if (score >= 2) return "L2";
  return "L1";
}

// Find matching competency from KB by skill name
function findCompetencyForSkill(skillName) {
  if (!skillName) return null;
  // Search concept tags for match
  const concept = concepts.find((c) =>
    c.tags.some((t) => t.includes(skillName) || skillName.includes(t))
  );
  if (concept) {
    // Find competency via anchors
    for (const a of anchors) {
      if (a.tags.some((t) => t.includes(skillName) || skillName.includes(t))) {
        return a.content.competency_id;
      }
    }
  }
  return null;
}

// Load trajectories
const trajText = await fs.readFile(path.resolve(root, inputPath), "utf8");
const trajectories = trajText.split(/\r?\n/).filter(Boolean).map(JSON.parse);

console.error(`[gold-candidates] loaded ${trajectories.length} trajectories`);

const candidates = [];

for (const traj of trajectories) {
  for (const turn of traj.turns) {
    if (!turn.answer) continue; // Skip unanswered questions

    const mappedSkill = turn.mappedSkill || turn.topic;
    const compId = findCompetencyForSkill(mappedSkill);
    const estimatedLevel = estimateAnswerLevel(turn.answer, turn.question, mappedSkill);
    const suggestedScoreRange = levelToScoreRange(estimatedLevel);
    const suggestedAction = levelToAction(estimatedLevel);

    candidates.push({
      id: `gold-cand-${candidates.length + 1}`,
      provenance: "model-assisted",
      sourceSessionId: traj.sessionId,
      sourceRound: turn.roundNo,
      targetRole: traj.targetRole,
      question: turn.question,
      answer: turn.answer,
      mappedSkill,
      questionType: turn.questionType,
      // System's actual output
      _modelScore: turn.evaluation?.score ?? null,
      _modelAction: turn.evaluation?.action ?? null,
      _modelAnsweredSkill: turn.evaluation?.answeredSkill ?? null,
      _modelNextSkill: turn.evaluation?.nextSkill ?? null,
      // KB-based heuristic suggestion
      _suggestedLevel: estimatedLevel,
      _suggestedScoreRange: suggestedScoreRange,
      _suggestedAction: suggestedAction,
      _kbCompetency: compId,
      // Annotation fields (to be filled by humans)
      annotation: {
        annotator1: { score: null, action: null, comment: "" },
        annotator2: { score: null, action: null, comment: "" },
        adjudicated: { scoreRange: null, action: null, comment: "" },
      },
    });
  }
}

// Write output
const fullPath = path.resolve(root, outputPath);
await fs.mkdir(path.dirname(fullPath), { recursive: true });
const lines = candidates.map((c) => JSON.stringify(c)).join("\n") + "\n";
await fs.writeFile(fullPath, lines, "utf8");

console.error(`[gold-candidates] wrote ${candidates.length} candidate annotations to ${outputPath}`);
console.log(JSON.stringify({
  count: candidates.length,
  outputPath,
  byRole: Object.fromEntries(
    [...new Set(candidates.map((c) => c.targetRole).filter(Boolean))].map((r) => [
      r,
      candidates.filter((c) => c.targetRole === r).length,
    ])
  ),
  byLevel: Object.fromEntries(
    ["L0", "L1", "L2", "L3", "L4", "L5"].map((l) => [
      l,
      candidates.filter((c) => c._suggestedLevel === l).length,
    ]).filter(([, n]) => n > 0)
  ),
  annotationNeeded: candidates.filter((c) => !c.annotation.annotator1.score).length,
}, null, 2));
