import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prompts = {
  "resume.analysis": { version: "resume-analysis-v3.0", file: "resume/analysis.v3.md" },
  "interview.opening": { version: "interview-opening-v3.1", file: "interview/opening.v3.md" },
  "interview.turn": { version: "interview-turn-v3.1", file: "interview/evaluate-and-next.v3.md" },
  "interview.report": { version: "growth-report-v3.0", file: "interview/growth-report.v3.md" },
  "recruiter.job": { version: "recruiter-job-v3.0", file: "recruiter/jd-analysis.v3.md" },
  "recruiter.resume": { version: "recruiter-resume-v3.0", file: "recruiter/resume-evidence.v3.md" },
  "recruiter.match": { version: "recruiter-match-v3.0", file: "recruiter/match-calibration.v3.md" },
} as const;

export type PromptKey = keyof typeof prompts;
export type PromptDefinition = { key: PromptKey; version: string; system: string };

export class PromptRegistry {
  private cache = new Map<PromptKey, PromptDefinition>();

  get(key: PromptKey): PromptDefinition {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const entry = prompts[key];
    const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts", entry.file);
    const system = fs.readFileSync(filename, "utf8").trim();
    if (!system) throw new Error(`Prompt 文件为空: ${entry.file}`);
    const definition = { key, version: entry.version, system };
    this.cache.set(key, definition);
    return definition;
  }

  list() { return Object.entries(prompts).map(([key, value]) => ({ key, ...value })); }
}

export const promptRegistry = new PromptRegistry();
