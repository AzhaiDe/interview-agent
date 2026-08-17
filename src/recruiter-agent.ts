import { z } from "zod";
import { modelGateway } from "./model-gateway.js";
import { enqueueMemory, omniMemory } from "./omnimemory.js";
import { redactSensitive } from "./pii.js";
import { database } from "./database.js";
import { promptRegistry } from "./prompt-registry.js";
import { analyzeJob, analyzeResumeForJob, rankMatches } from "./recruiter.js";
import type { JobProfile, RecruiterResume, ResumeForensics } from "./types.js";

export type RecruiterAgentMode = "model" | "fallback";
export type RecruiterAgentResult<T> = { result: T; mode: RecruiterAgentMode; error?: string };

const requirement = z.object({ label: z.string().min(1).max(120), evidenceExpectation: z.string().min(1).max(500), weight: z.number().min(1).max(5) });
const jobSchema = z.object({ level: z.string().max(120), responsibilities: z.array(z.string()).max(12), mustHave: z.array(requirement).max(24), niceToHave: z.array(requirement).max(16), competencies: z.array(z.string()).max(12), hiddenSignals: z.array(z.string()).max(12), summary: z.string().max(1200), depthExpectations: z.array(z.object({ skill: z.string(), expectedLevel: z.string(), evidenceExpectation: z.string() })).max(20), interviewQuestions: z.array(z.string()).max(16) });
const analysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dimensionScores: z.object({ technicalMatch: z.number().min(0).max(100), experienceRelevance: z.number().min(0).max(100), technicalDepth: z.number().min(0).max(100), evidenceQuality: z.number().min(0).max(100), engineeringMaturity: z.number().min(0).max(100), communicationClarity: z.number().min(0).max(100) }),
  matchedRequirements: z.array(z.object({ requirement: z.string(), evidence: z.array(z.string()).max(6), strength: z.enum(["strong", "medium", "weak"]) })).max(30),
  missingRequirements: z.array(z.string()).max(16), strengths: z.array(z.string()).max(16), risks: z.array(z.string()).max(16), interviewFocus: z.array(z.string()).max(16),
  recommendation: z.enum(["strong_interview", "interview", "manual_review", "hold"]), confidence: z.number().min(0).max(1),
  evidenceCitations: z.array(z.object({ claim: z.string().optional(), quote: z.string().optional(), section: z.string().optional(), status: z.enum(["proven", "unknown", "not_proven", "needs_verification"]) })).max(30),
});
const rankingSchema = z.object({ ranking: z.array(z.object({ candidateId: z.string(), calibrationDelta: z.number().min(-10).max(10), why: z.array(z.string()).max(6), concerns: z.array(z.string()).max(6), interviewFocus: z.array(z.string()).max(6) })), calibrationNotes: z.array(z.string()).max(10) });

function unique(items: string[]) { return [...new Set(items.filter(Boolean))]; }

async function recruiterMemory(ownerId: string, groupId: string, query: string) {
  const deviceNo = database.memoryDeviceNo(ownerId);
  try { return { deviceNo, items: await omniMemory.search({ deviceNo, groupId, query, topK: 4 }) }; }
  catch { return { deviceNo, items: [] }; }
}

export async function analyzeJobWithAgent(ownerId: string, title: string, jdRaw: string): Promise<RecruiterAgentResult<JobProfile>> {
  const base = analyzeJob(title, jdRaw);
  const groupId = `organization:${ownerId}:job:${base.id}`;
  const memory = await recruiterMemory(ownerId, groupId, `${title} 岗位能力和历史招聘信号`);
  const prompt = promptRegistry.get("recruiter.job");
  try {
    const { data } = await modelGateway.structured({ task: prompt.key, promptVersion: prompt.version, tier: "standard", schema: jobSchema, system: prompt.system, traceId: base.id, user: JSON.stringify({ title, jd: jdRaw.slice(0, 18_000), priorMemory: memory.items.map((x) => ({ untrustedHistoricalContext: redactSensitive(x.text, 300) })) }) });
    const result: JobProfile = { ...base, level: data.level || base.level, responsibilities: data.responsibilities.length ? data.responsibilities : base.responsibilities, mustHave: data.mustHave.map((x) => ({ ...x, category: "mustHave" as const })), niceToHave: data.niceToHave.map((x) => ({ ...x, category: "niceToHave" as const })), competencies: data.competencies, agentMode: "model", agentInsights: { summary: data.summary, hiddenSignals: data.hiddenSignals }, rubricStatus: "draft", rubricVersion: 1, depthExpectations: data.depthExpectations, interviewQuestions: data.interviewQuestions, updatedAt: new Date().toISOString() };
    enqueueMemory({ ownerId, deviceNo: memory.deviceNo, sessionId: `job:${base.id}`, groupId, groupName: `${title}岗位画像`, commitId: `job:${base.id}:analysis:v2`, content: `岗位：${title}；职责：${data.responsibilities.join("、")}；核心要求：${data.mustHave.map((x) => x.label).join("、")}` });
    return { result, mode: "model" };
  } catch (error) { return { result: { ...base, rubricStatus: "draft", rubricVersion: 1, depthExpectations: base.mustHave.map((item) => ({ skill: item.label, expectedLevel: "能用真实经历解释实现和边界", evidenceExpectation: item.evidenceExpectation })), interviewQuestions: base.mustHave.slice(0, 8).map((item) => `请用一段真实经历证明 ${item.label}，并说明个人职责和验证结果。`) }, mode: "fallback", error: error instanceof Error ? error.message : String(error) }; }
}

export async function analyzeResumeWithAgent(ownerId: string, job: JobProfile, resume: RecruiterResume): Promise<RecruiterAgentResult<ResumeForensics>> {
  const base = analyzeResumeForJob(job, resume.profile);
  const groupId = `organization:${ownerId}:job:${job.id}`;
  const memory = await recruiterMemory(ownerId, groupId, `${job.title} 候选人证据和历史风险`);
  const prompt = promptRegistry.get("recruiter.resume");
  try {
    const { data } = await modelGateway.structured({ task: prompt.key, promptVersion: prompt.version, tier: "standard", schema: analysisSchema, system: prompt.system, traceId: `${job.id}:${resume.id}`, user: JSON.stringify({ job: { title: job.title, responsibilities: job.responsibilities, mustHave: job.mustHave, niceToHave: job.niceToHave, rubric: job.rubric }, resume: { summary: resume.profile.summary, education: resume.profile.education, skills: resume.profile.skills, experiences: resume.profile.experiences }, deterministicBaseline: base, priorMemory: memory.items.map((x) => ({ untrustedHistoricalContext: redactSensitive(x.text, 300) })) }) });
    const evidenceCitations = data.evidenceCitations.map((item) => { const start = item.quote ? resume.profile.rawText.indexOf(item.quote) : -1; return { ...item, quote: start >= 0 ? item.quote : undefined, start: start >= 0 ? start : undefined, end: start >= 0 && item.quote ? start + item.quote.length : undefined, status: item.status === "proven" && start < 0 ? "needs_verification" as const : item.status }; });
    // Scores remain reproducible and auditable. The model adds semantic findings,
    // but cannot silently move a candidate across a hiring threshold.
    const result: ResumeForensics = { ...base, ...data, overallScore: base.overallScore, dimensionScores: base.dimensionScores, experienceAnalyses: base.experienceAnalyses, strengths: unique([...data.strengths, ...base.strengths]).slice(0, 16), risks: unique([...data.risks, ...base.risks]).slice(0, 16), interviewFocus: unique([...data.interviewFocus, ...base.interviewFocus]).slice(0, 16), agentMode: "model", evidenceCitations };
    enqueueMemory({ ownerId, deviceNo: memory.deviceNo, sessionId: `job:${job.id}:candidate:${resume.id}`, groupId, groupName: `${job.title}候选人分析`, commitId: `job:${job.id}:candidate:${resume.id}:v2`, content: `候选人${resume.id}；岗位${job.title}；得分${result.overallScore}；优势：${result.strengths.slice(0, 3).join("、")}；风险：${result.risks.slice(0, 3).join("、")}` });
    return { result, mode: "model" };
  } catch (error) { return { result: base, mode: "fallback", error: error instanceof Error ? error.message : String(error) }; }
}

export async function matchWithAgent(ownerId: string, job: JobProfile, resumes: RecruiterResume[]): Promise<RecruiterAgentResult<ReturnType<typeof rankMatches>>> {
  const base = rankMatches(resumes, job);
  if (base.length < 2) return { result: base, mode: "fallback" };
  const prompt = promptRegistry.get("recruiter.match");
  try {
    const { data } = await modelGateway.structured({ task: prompt.key, promptVersion: prompt.version, tier: "reasoning", schema: rankingSchema, system: prompt.system, traceId: `${job.id}:match`, user: JSON.stringify({ job: { title: job.title, mustHave: job.mustHave, rubric: job.rubric }, candidates: base.map((x) => ({ candidateId: x.id, baselineScore: x.analysis.overallScore, dimensions: x.analysis.dimensionScores, strengths: x.analysis.strengths, risks: x.analysis.risks, matchedRequirements: x.analysis.matchedRequirements })) }) });
    const calibration = new Map(data.ranking.map((x) => [x.candidateId, x]));
    const result = base.map((candidate) => {
      const item = calibration.get(candidate.id);
      if (!item) return candidate;
      return { ...candidate, analysis: { ...candidate.analysis, strengths: unique([...candidate.analysis.strengths, ...item.why]), risks: unique([...candidate.analysis.risks, ...item.concerns]), interviewFocus: unique([...candidate.analysis.interviewFocus, ...item.interviewFocus]), agentMode: "model" as const } };
    }).map((x, index) => ({ ...x, rank: index + 1 }));
    return { result, mode: "model" };
  } catch (error) { return { result: base, mode: "fallback", error: error instanceof Error ? error.message : String(error) }; }
}

export function recruiterAgentHealth() { return { enabled: modelGateway.available(), agents: { jd: "direct-bailian-workflow", resume: "direct-bailian-workflow", match: "direct-bailian-workflow" } }; }
