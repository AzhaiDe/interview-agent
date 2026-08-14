import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../src/config.js";
import { database } from "../src/database.js";
import type { InterviewSession, JobProfile, MatchResult, RecruiterResume } from "../src/types.js";

async function readJson<T>(filename: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(filename, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

const legacyDir = path.resolve(process.argv[2] || path.join(process.cwd(), "data"));
const interviews = await readJson<{ sessions?: InterviewSession[] }>(path.join(legacyDir, "interviews.json"), {});
const recruiter = await readJson<{ jobs?: JobProfile[]; resumes?: RecruiterResume[]; matches?: unknown }>(path.join(legacyDir, "recruiter.json"), {});

let sessionCount = 0;
for (const session of interviews.sessions || []) { database.saveInterview(config.localUserId, session); sessionCount++; }
let jobCount = 0;
for (const job of recruiter.jobs || []) { database.saveJob(config.localUserId, job); jobCount++; }
let resumeCount = 0;
for (const resume of recruiter.resumes || []) { database.saveRecruiterResume(config.localUserId, resume); resumeCount++; }

let matchCount = 0;
const rawMatches = recruiter.matches;
if (Array.isArray(rawMatches)) {
  for (const entry of rawMatches) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !Array.isArray(entry[1])) continue;
    database.saveMatches(entry[0], config.localUserId, entry[1] as MatchResult[]); matchCount += entry[1].length;
  }
} else if (rawMatches && typeof rawMatches === "object") {
  for (const [jobId, matches] of Object.entries(rawMatches)) {
    if (!Array.isArray(matches)) continue;
    database.saveMatches(jobId, config.localUserId, matches as MatchResult[]); matchCount += matches.length;
  }
}

console.log(JSON.stringify({ source: legacyDir, target: config.databasePath, sessions: sessionCount, jobs: jobCount, resumes: resumeCount, matches: matchCount }, null, 2));
database.close();
