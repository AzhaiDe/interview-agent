/**
 * Evaluation Runner
 *
 * Runs the gold dataset through the agent graph and compares results against expectations.
 * Implements evaluation per PRD §16.3.
 *
 * Usage:
 *   npm run eval:gold                    # Run all evaluations
 *   npm run eval:gold -- --limit 10      # Run first 10 evaluations
 *   npm run eval:gold -- --category strong  # Run only strong quality answers
 */

import fs from "node:fs";
import path from "node:path";
import { createGraphSession, evaluateInterviewAnswer } from "../src/agent-runtime.js";
import { goldResumes } from "./resumes/gold-resumes.js";
import { goldQuestions } from "./questions/gold-questions.js";
import { goldAnswers } from "./answers/gold-answers.js";

// Disable model for deterministic evaluation
process.env.MODEL_ENABLED = "false";
process.env.OMNIMEMORY_ENABLED = "false";

type EvalResult = {
  answerId: string;
  questionId: string;
  expectedScore: number;
  actualScore: number;
  scoreDelta: number;
  expectedEvidence: string[];
  actualEvidence: string[];
  evidencePrecision: number;
  evidenceRecall: number;
  expectedVerdict: string;
  actualVerdict: string;
  verdictMatch: boolean;
  quality: string;
  passed: boolean;
};

type EvalSummary = {
  total: number;
  passed: number;
  failed: number;
  averageScoreDelta: number;
  averageEvidencePrecision: number;
  averageEvidenceRecall: number;
  verdictAccuracy: number;
  byQuality: Record<string, { total: number; passed: number }>;
};

/**
 * Calculate precision: how many of the actual evidence items were expected.
 */
function calculatePrecision(expected: string[], actual: string[]): number {
  if (actual.length === 0) return 0;
  const expectedSet = new Set(expected);
  const correct = actual.filter((item) => expectedSet.has(item)).length;
  return correct / actual.length;
}

/**
 * Calculate recall: how many of the expected evidence items were found.
 */
function calculateRecall(expected: string[], actual: string[]): number {
  if (expected.length === 0) return 1;
  const actualSet = new Set(actual);
  const correct = expected.filter((item) => actualSet.has(item)).length;
  return correct / expected.length;
}

/**
 * Map judge verdict to expected verdict format.
 */
function mapVerdict(verdict: string): string {
  const mapping: Record<string, string> = {
    supported: "supported",
    partial: "partial",
    insufficient: "insufficient",
    incorrect: "incorrect",
  };
  return mapping[verdict] || "insufficient";
}

/**
 * Run a single evaluation.
 */
async function runEvaluation(
  answer: typeof goldAnswers[0]
): Promise<EvalResult> {
  const question = goldQuestions.find((q) => q.id === answer.questionId);
  if (!question) {
    throw new Error(`Question not found: ${answer.questionId}`);
  }

  // Use the first resume for simplicity (in production, would match by role)
  const profile = goldResumes[0];

  // Create a session
  const session = createGraphSession(profile, 3, "project_deep_dive");

  // Set up the state to match the question
  const state = (session as any)._graphState;
  state.rubric = session.roleRubric;
  state.currentThread.focusSkill = question.skill;
  state.currentThread.focusExperienceTitle = profile.experiences[0]?.title || "测试项目";
  state.pendingQuestion = {
    text: question.text,
    topic: question.skill,
    mappedSkill: question.skill,
    questionType: question.questionType,
    depth: question.difficulty,
    strategy: question.strategy,
    valid: true,
  };

  // Evaluate the answer
  const outcome = await evaluateInterviewAnswer("eval-owner", session, answer.text);

  // Extract actual results
  const actualScore = outcome.evaluation.score;
  const actualEvidence = outcome.evaluation.evidenceCovered;
  const actualVerdict = mapVerdict(outcome.evaluation.verdict || "insufficient");

  // Calculate metrics
  const scoreDelta = Math.abs(actualScore - answer.expectedScore);
  const evidencePrecision = calculatePrecision(answer.expectedEvidence, actualEvidence);
  const evidenceRecall = calculateRecall(answer.expectedEvidence, actualEvidence);
  const verdictMatch = actualVerdict === answer.expectedVerdict;

  // Determine pass/fail (tolerance: score within 1.5, verdict matches, recall >= 0.6)
  const passed = scoreDelta <= 1.5 && verdictMatch && evidenceRecall >= 0.6;

  return {
    answerId: answer.id,
    questionId: answer.questionId,
    expectedScore: answer.expectedScore,
    actualScore,
    scoreDelta,
    expectedEvidence: answer.expectedEvidence,
    actualEvidence,
    evidencePrecision,
    evidenceRecall,
    expectedVerdict: answer.expectedVerdict,
    actualVerdict,
    verdictMatch,
    quality: answer.quality,
    passed,
  };
}

/**
 * Run all evaluations and generate summary.
 */
async function runAllEvaluations(options: {
  limit?: number;
  category?: string;
}): Promise<EvalSummary> {
  let answers = goldAnswers;

  // Apply filters
  if (options.limit) {
    answers = answers.slice(0, options.limit);
  }
  if (options.category) {
    answers = answers.filter((a) => a.quality === options.category);
  }

  console.log(`Running ${answers.length} evaluations...`);
  console.log("");

  const results: EvalResult[] = [];
  for (const answer of answers) {
    try {
      const result = await runEvaluation(answer);
      results.push(result);
      const status = result.passed ? "✓" : "✗";
      console.log(`${status} ${answer.id}: score ${result.actualScore.toFixed(1)} (expected ${answer.expectedScore}), verdict ${result.actualVerdict} (expected ${answer.expectedVerdict})`);
    } catch (err) {
      console.error(`✗ ${answer.id}: ERROR - ${err instanceof Error ? err.message : String(err)}`);
      results.push({
        answerId: answer.id,
        questionId: answer.questionId,
        expectedScore: answer.expectedScore,
        actualScore: 0,
        scoreDelta: answer.expectedScore,
        expectedEvidence: answer.expectedEvidence,
        actualEvidence: [],
        evidencePrecision: 0,
        evidenceRecall: 0,
        expectedVerdict: answer.expectedVerdict,
        actualVerdict: "error",
        verdictMatch: false,
        quality: answer.quality,
        passed: false,
      });
    }
  }

  // Calculate summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const averageScoreDelta = results.reduce((sum, r) => sum + r.scoreDelta, 0) / results.length;
  const averageEvidencePrecision = results.reduce((sum, r) => sum + r.evidencePrecision, 0) / results.length;
  const averageEvidenceRecall = results.reduce((sum, r) => sum + r.evidenceRecall, 0) / results.length;
  const verdictAccuracy = results.filter((r) => r.verdictMatch).length / results.length;

  const byQuality: Record<string, { total: number; passed: number }> = {};
  for (const result of results) {
    if (!byQuality[result.quality]) {
      byQuality[result.quality] = { total: 0, passed: 0 };
    }
    byQuality[result.quality].total++;
    if (result.passed) {
      byQuality[result.quality].passed++;
    }
  }

  return {
    total: results.length,
    passed,
    failed,
    averageScoreDelta,
    averageEvidencePrecision,
    averageEvidenceRecall,
    verdictAccuracy,
    byQuality,
  };
}

/**
 * Main entry point.
 */
async function main() {
  const args = process.argv.slice(2);
  const options: { limit?: number; category?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--category" && args[i + 1]) {
      options.category = args[i + 1];
      i++;
    }
  }

  const summary = await runAllEvaluations(options);

  console.log("");
  console.log("=".repeat(60));
  console.log("Evaluation Summary");
  console.log("=".repeat(60));
  console.log(`Total: ${summary.total}`);
  console.log(`Passed: ${summary.passed} (${((summary.passed / summary.total) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${summary.failed}`);
  console.log("");
  console.log(`Average Score Delta: ${summary.averageScoreDelta.toFixed(2)}`);
  console.log(`Average Evidence Precision: ${(summary.averageEvidencePrecision * 100).toFixed(1)}%`);
  console.log(`Average Evidence Recall: ${(summary.averageEvidenceRecall * 100).toFixed(1)}%`);
  console.log(`Verdict Accuracy: ${(summary.verdictAccuracy * 100).toFixed(1)}%`);
  console.log("");
  console.log("By Quality:");
  for (const [quality, stats] of Object.entries(summary.byQuality)) {
    const rate = ((stats.passed / stats.total) * 100).toFixed(1);
    console.log(`  ${quality}: ${stats.passed}/${stats.total} (${rate}%)`);
  }
  console.log("=".repeat(60));

  // Exit with error code if too many failures
  const passRate = summary.passed / summary.total;
  if (passRate < 0.7) {
    console.error(`\n✗ Evaluation failed: pass rate ${(passRate * 100).toFixed(1)}% < 70%`);
    process.exit(1);
  } else {
    console.log(`\n✓ Evaluation passed: pass rate ${(passRate * 100).toFixed(1)}%`);
  }
}

main().catch((err) => {
  console.error("Evaluation runner failed:", err);
  process.exit(1);
});
