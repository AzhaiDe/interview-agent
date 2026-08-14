import crypto from "node:crypto";
import { z } from "zod";
import { modelGateway } from "./model-gateway.js";
import { redactSensitive } from "./pii.js";
import { promptRegistry } from "./prompt-registry.js";
import { analyzeResume } from "./resume.js";
import type { EvidenceClaim, ResumeProfile } from "./types.js";

const schema = z.object({
  candidateSummary: z.string().min(1).max(1200),
  experiences: z.array(z.object({
    index: z.number().int().min(0), summary: z.string().max(800), technologies: z.array(z.string()).max(30),
    claims: z.array(z.string()).max(12), highlights: z.array(z.string()).max(10), risks: z.array(z.string()).max(10),
    contributionLevel: z.enum(["mentioned", "used", "independently_owned", "designed_and_delivered", "production_owner"]),
    evidenceQuality: z.number().min(0).max(100),
  })).max(20),
  roleRecommendations: z.array(z.object({ role: z.string().min(1).max(120), reasons: z.array(z.string()).min(1).max(5), dimensions: z.object({ technicalEvidence: z.number().min(0).max(100), experienceRelevance: z.number().min(0).max(100), independentContribution: z.number().min(0).max(100), resultEvidence: z.number().min(0).max(100), engineeringMaturity: z.number().min(0).max(100) }) })).max(8),
  strengths: z.array(z.string()).max(12), risks: z.array(z.string()).max(12),
  evidenceCitations: z.array(z.object({ claim: z.string(), quote: z.string(), section: z.string().optional(), experienceIndex: z.number().int().min(0).optional(), confidence: z.number().min(0).max(1), status: z.enum(["proven", "unknown", "not_proven", "needs_verification"]) })).max(40),
});

function roleScore(dimensions: { technicalEvidence: number; experienceRelevance: number; independentContribution: number; resultEvidence: number; engineeringMaturity: number }) {
  return Math.round(dimensions.technicalEvidence * .30 + dimensions.experienceRelevance * .25 + dimensions.independentContribution * .20 + dimensions.resultEvidence * .15 + dimensions.engineeringMaturity * .10);
}

function deterministicEvidence(profile: ResumeProfile, rawText: string): { citations: NonNullable<ResumeProfile["evidenceCitations"]>; claims: EvidenceClaim[] } {
  const citations: NonNullable<ResumeProfile["evidenceCitations"]> = [];
  const claims: EvidenceClaim[] = [];
  for (const skill of profile.skills) {
    const start = rawText.toLowerCase().indexOf(skill.toLowerCase());
    if (start < 0) continue;
    const quote = rawText.slice(start, start + skill.length);
    const experience = profile.experiences.find((item) => `${item.title} ${item.bullets.join(" ")} ${item.technologies.join(" ")}`.toLowerCase().includes(skill.toLowerCase()));
    const claim = `简历原文出现 ${skill} 技术证据`;
    citations.push({ claim, quote, section: experience?.section, experienceId: experience?.id, start, end: start + quote.length, confidence: .72, status: "proven" });
    claims.push({ id: `claim-${crypto.randomUUID().slice(0, 12)}`, experienceId: experience?.id, claim, evidence: [{ text: quote, section: experience?.section, start, end: start + quote.length }], confidence: .72, status: "proven" });
  }
  return { citations, claims };
}

export async function analyzeResumeWorkflow(rawText: string, targetRole = "待选择岗位", traceId = crypto.randomUUID()): Promise<ResumeProfile> {
  const base = analyzeResume(rawText, targetRole);
  base.experiences = base.experiences.map((experience, index) => ({ ...experience, id: `exp-${index + 1}` }));
  const prompt = promptRegistry.get("resume.analysis");
  try {
    const result = await modelGateway.structured({
      task: prompt.key, promptVersion: prompt.version, tier: "standard", schema,
      system: prompt.system,
      traceId,
      user: JSON.stringify({ targetRole, resumeText: redactSensitive(rawText, 24_000), deterministicParse: { education: base.education, skills: base.skills, experiences: base.experiences.map((x, index) => ({ index, title: x.title, section: x.section, bullets: x.bullets, technologies: x.technologies })) }, rules: ["区分团队成果和个人贡献", "没有原文证据就标记风险", "岗位推荐基于完整经历而非关键词"] }),
    });
    const data = result.data;
    const experiences = base.experiences.map((experience, index) => {
      const enriched = data.experiences.find((x) => x.index === index);
      return enriched ? { ...experience, summary: enriched.summary || experience.summary, technologies: [...new Set([...experience.technologies, ...enriched.technologies])], claims: enriched.claims, highlights: [...new Set([...experience.highlights, ...enriched.highlights])].slice(0, 10), risks: [...new Set([...experience.risks, ...enriched.risks])].slice(0, 10), contributionLevel: enriched.contributionLevel, evidenceQuality: enriched.evidenceQuality } : experience;
    });
    const citations = data.evidenceCitations.map((item) => {
      const start = item.quote ? rawText.indexOf(item.quote) : -1;
      const experienceId = item.experienceIndex === undefined ? undefined : experiences[item.experienceIndex]?.id;
      const proven = start >= 0 && item.status === "proven";
      return { claim: item.claim, quote: proven ? item.quote : "", section: item.section, experienceId, start: proven ? start : undefined, end: proven ? start + item.quote.length : undefined, confidence: item.confidence, status: proven ? "proven" as const : item.status === "proven" ? "needs_verification" as const : item.status };
    }).slice(0, 40);
    const evidenceClaims: EvidenceClaim[] = citations.map((item) => ({ id: `claim-${crypto.randomUUID().slice(0, 12)}`, experienceId: item.experienceId, claim: item.claim, evidence: item.start === undefined ? [] : [{ text: item.quote, section: item.section, start: item.start, end: item.end! }], confidence: item.confidence, status: item.status }));
    const recommendations = data.roleRecommendations.map((item) => ({ role: item.role, score: roleScore(item.dimensions), reasons: item.reasons })).sort((a, b) => b.score - a.score);
    return { ...base, summary: data.candidateSummary, experiences, recommendedRoles: recommendations.length ? recommendations : base.recommendedRoles, strengths: [...new Set([...data.strengths, ...base.strengths])].slice(0, 12), risks: [...new Set([...data.risks, ...base.risks])].slice(0, 12), evidenceCitations: citations.filter((item) => item.status === "proven" && item.start !== undefined), evidenceClaims, analysisMode: "model", analysisVersion: prompt.version };
  } catch {
    const evidence = deterministicEvidence(base, rawText);
    return { ...base, evidenceCitations: evidence.citations, evidenceClaims: evidence.claims, analysisMode: "fallback", analysisVersion: prompt.version };
  }
}
