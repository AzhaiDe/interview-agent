/**
 * Silver regression test runner.
 *
 * Evaluates the current system against the synthetic silver dataset and writes
 * a prediction envelope that `score.mjs` can grade.
 *
 * Tracks:
 *   - resume: skill extraction and evidence grounding
 *   - interview: per-turn scoring, action, and next-skill selection
 *   - ranking: person-job ranking under a frozen rubric
 *   - memory: long-term memory recall, isolation and privacy
 *
 * The memory track is intentionally NOT evaluated through the live OmniMemory
 * API to avoid cross-tenant pollution; a separate isolated harness is required.
 */

// Force-disable external services for offline eval runs.
// .env is loaded during import resolution (ESM hoisting), which may set
// MODEL_ENABLED=true. We override AFTER all imports settle so the eval
// never calls the real model API or OmniMemory unless --live is passed.
if (!process.argv.includes("--live")) {
  process.env.MODEL_ENABLED = "false";
  process.env.OMNIMEMORY_ENABLED = "false";
  process.env.OMNIMEMORY_WRITE_ENABLED = "false";
}

import fs from "node:fs/promises";
import path from "node:path";
import {
  createGraphSession,
  evaluateInterviewAnswer,
} from "../../src/agent-runtime.js";
import { analyzeResumeWorkflow } from "../../src/resume-workflow.js";
import {
  analyzeJobWithAgent,
  analyzeResumeWithAgent,
  matchWithAgent,
} from "../../src/recruiter-agent.js";
import { config } from "../../src/config.js";

// ---- flags ----
const args = new Set(process.argv.slice(2));
const live = args.has("--live");
const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx >= 0 && process.argv[limitIdx + 1] ? Number(process.argv[limitIdx + 1]) : null;

// ---- helpers ----
const readJsonl = async <T>(filename: string): Promise<T[]> => {
  const text = await fs.readFile(filename, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
};

const root = process.cwd();
const outputFlag = process.argv.indexOf("--output");
const output = path.resolve(
  outputFlag >= 0 && process.argv[outputFlag + 1]
    ? process.argv[outputFlag + 1]
    : "evals/results/latest.json",
);

// ---- load silver cases ----
console.error("[silver] env MODEL_ENABLED=", process.env.MODEL_ENABLED, "config.model.enabled=", config.model.enabled, "apiKey=", config.model.apiKey ? "present" : "absent");
type ResumeCase = { id: string; role: string; text: string };
type InterviewCase = {
  id: string;
  questionSkill: string;
  question: string;
  answer: string;
};
type RankingCase = {
  jobId: string;
  rubric: string;
  candidates: { id: string; evidence: string }[];
};

const resumeCases = (await readJsonl<ResumeCase>(
  path.join(root, "evals/datasets/silver/resume.jsonl"),
)).slice(0, limit ?? Infinity);
const interviewCases = (await readJsonl<InterviewCase>(
  path.join(root, "evals/datasets/silver/interview.jsonl"),
)).slice(0, limit ?? Infinity);
const rankingCases = (await readJsonl<RankingCase>(
  path.join(root, "evals/datasets/silver/ranking.jsonl"),
)).slice(0, limit ?? Infinity);

const ownerId = "evaluation-user";

// ===========================
// Track 1: Resume
// ===========================
console.error("[silver] Track 1: Resume -", resumeCases.length, "cases");
const resume = [];
for (const item of resumeCases) {
  const profile = await analyzeResumeWorkflow(item.text, item.role);
  resume.push({
    id: item.id,
    skills: profile.skills,
    claims: (profile.evidenceCitations || []).map((x) => ({
      claim: x.claim,
      evidenceText: x.quote,
    })),
  });
  console.error(`  [silver] resume ${item.id}: ${profile.analysisMode} mode, ${profile.skills.length} skills`);
}

// ===========================
// Track 2: Interview
// ===========================
console.error("[silver] Track 2: Interview -", interviewCases.length, "cases");
const interview = [];
for (const item of interviewCases) {
  // Build a minimal synthetic profile so createGraphSession can initialise
  // rubric and skill beliefs.
  const profile = {
    rawText: `技能：${item.questionSkill}`,
    targetRole: item.questionSkill.includes("前端")
      ? "前端工程师"
      : item.questionSkill.includes("AI") ||
          item.questionSkill.includes("RAG") ||
          item.questionSkill.includes("算法")
        ? "AI/RAG 应用工程师"
        : "后端工程师",
    summary: `候选人在${item.questionSkill}方向有实践经历`,
    education: [],
    recommendedRoles: [],
    skills: [item.questionSkill],
    experiences: [
      {
        title: `${item.questionSkill}实践项目`,
        type: "project" as const,
        summary: `在${item.questionSkill}方向有具体实践经验`,
        bullets: [],
        technologies: [item.questionSkill],
        claims: [],
        highlights: [],
        risks: [],
      },
    ],
    strengths: [],
    risks: [],
    questions: [],
  };

  const session = createGraphSession(profile, 3, "comprehensive");

  // Override session fields to inject the silver question.
  session.currentQuestion = item.question;
  session.currentTopic = item.questionSkill;
  session.currentMappedSkill = item.questionSkill;
  session.currentQuestionType = "project_followup";
  session.focusRound = 0;
  session.topicDepth = 1;

  // Initialise agent runtime so retrieve() and modelJudge() have a state
  // container (the same shape that createInterviewOpening would set up).
  const rt = (session as any).agentRuntime;
  rt.node = "extract_claims";

  const result = await evaluateInterviewAnswer(ownerId, session, item.answer);
  interview.push({
    id: item.id,
    action: result.transition.action,
    answeredSkill: result.evaluation.answeredSkill,
    nextSkill: result.nextQuestion?.mappedSkill,
    score: result.evaluation.score,
  });
  console.error(`  [silver] interview ${item.id}: score=${result.evaluation.score}, action=${result.transition.action}`);
}

// ===========================
// Track 3: Ranking
// ===========================
console.error("[silver] Track 3: Ranking -", rankingCases.length, "cases");
const ranking = [];
for (const item of rankingCases) {
  const analyzed = await analyzeJobWithAgent(ownerId, "测评岗位", item.rubric);
  const job = analyzed.result;
  job.id = item.jobId;
  console.error(`  [silver] ranking job ${item.jobId}: ${analyzed.mode} mode`);

  const candidates = [];
  for (const candidate of item.candidates) {
    const resume: any = {
      id: candidate.id,
      jobId: job.id,
      fileName: `${candidate.id}.txt`,
      rawText: `项目经历\n${candidate.evidence}`,
      profile: {
        rawText: candidate.evidence,
        targetRole: job.title,
        summary: candidate.evidence,
        education: [],
        recommendedRoles: [],
        skills: [],
        experiences: [
          {
            title: "测评经历",
            type: "project" as const,
            summary: candidate.evidence,
            bullets: [],
            technologies: [],
            claims: [],
            highlights: [],
            risks: [],
          },
        ],
        strengths: [],
        risks: [],
        questions: [],
      },
      createdAt: new Date().toISOString(),
    };
    const analyzed = await analyzeResumeWithAgent(ownerId, job, resume);
    resume.analysis = analyzed.result;
    candidates.push(resume);
  }

  const matched = await matchWithAgent(ownerId, job, candidates);
  ranking.push({
    jobId: item.jobId,
    candidateIds: matched.result.map((x) => x.id),
  });
  console.error(`  [silver] ranking ${item.jobId}: ${matched.mode} mode, ${matched.result.length} candidates`);
}

// ===========================
// Write envelope
// ===========================
const envelope = {
  run: {
    createdAt: new Date().toISOString(),
    mode: live ? "live-model" : "offline-fallback",
    note: "Memory track is intentionally omitted until an isolated evaluation tenant is configured.",
  },
  resume,
  interview,
  ranking,
  memory: [],
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
console.log(`wrote ${output}`);
