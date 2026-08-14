import crypto from "node:crypto";
import type { Experience, ExperienceForensics, JobProfile, JobRequirement, MatchResult, RecruiterResume, ResumeForensics } from "./types.js";
import { analyzeResume } from "./resume.js";

const techAliases: Record<string, string[]> = {
  python: ["python"], java: ["java"], go: ["go", "golang"], typescript: ["typescript", "ts"], javascript: ["javascript", "js"], react: ["react"], vue: ["vue"], node: ["node", "node.js"], django: ["django"], fastapi: ["fastapi"], flask: ["flask"], redis: ["redis"], mysql: ["mysql"], postgresql: ["postgresql", "postgres"], mongodb: ["mongodb", "mongo"], sqlite: ["sqlite"], milvus: ["milvus"], elasticsearch: ["elasticsearch", "es"], kafka: ["kafka"], docker: ["docker"], kubernetes: ["kubernetes", "k8s"], rag: ["rag", "检索增强"], qwen: ["qwen"], qlora: ["qlora"], transformer: ["transformer"], mamba: ["mamba"], 分布式: ["分布式", "distributed"], sql: ["sql"]
};

const labelMap: Record<string, string> = { python: "Python", java: "Java", go: "Go", typescript: "TypeScript", javascript: "JavaScript", react: "React", vue: "Vue", node: "Node.js", django: "Django", fastapi: "FastAPI", flask: "Flask", redis: "Redis", mysql: "MySQL", postgresql: "PostgreSQL", mongodb: "MongoDB", sqlite: "SQLite", milvus: "Milvus", elasticsearch: "Elasticsearch", kafka: "Kafka", docker: "Docker", kubernetes: "Kubernetes", rag: "RAG", qwen: "Qwen", qlora: "QLoRA", transformer: "Transformer", mamba: "Mamba", 分布式: "分布式", sql: "SQL" };

const unique = <T>(items: T[]) => Array.from(new Set(items));
const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
const textOf = (experience: Experience) => [experience.title, experience.organization, experience.role, experience.summary, ...experience.bullets, ...experience.technologies].filter(Boolean).join(" ");
const hasNumber = (text: string) => /\d+(?:\.\d+)?\s*(?:%|倍|ms|秒|万|亿|次|个|条|x\b)|P\d+|Top-\d/i.test(text);
const hasAction = (text: string) => /负责|设计|实现|构建|开发|优化|训练|集成|搭建|提出|改造|维护|落地|排查|治理/.test(text);

function detectTerms(text: string) { const lower = text.toLowerCase(); return Object.keys(techAliases).filter((key) => techAliases[key].some((term) => lower.includes(term.toLowerCase()))).map((key) => labelMap[key]); }

function requirementsFromJd(jd: string, category: JobRequirement["category"], weight: number): JobRequirement[] {
  const terms = unique([...detectTerms(jd), ...jd.match(/[A-Za-z][A-Za-z0-9+#.-]{2,}/g) || []]).slice(0, 18);
  return terms.map((label) => ({ label, category, evidenceExpectation: category === "mustHave" ? `简历中应有使用 ${label} 解决实际问题的经历、职责和结果证据` : `有 ${label} 的项目或实践可以作为加分证据`, weight }));
}

export function analyzeJob(title: string, jdRaw: string): JobProfile {
  const jd = jdRaw.trim();
  const mustHave = requirementsFromJd(jd, "mustHave", 3);
  const niceToHave = requirementsFromJd(`${jd} ${title}`, "niceToHave", 1).filter((item) => !mustHave.some((x) => x.label.toLowerCase() === item.label.toLowerCase())).slice(0, 8);
  const responsibilities = jd.split(/[。；;\n]/).map((x) => x.trim()).filter((x) => x.length > 8).slice(0, 8);
  const competencies = unique([/架构|系统设计|分布式/i.test(jd) ? "系统设计与工程权衡" : "问题拆解与工程实现", /协作|沟通|团队/i.test(jd) ? "团队协作与沟通" : "技术表达与复盘", /性能|稳定|高并发|低延迟/i.test(jd) ? "性能与稳定性" : "结果意识"]);
  return { id: id("job"), title: title.trim() || "未命名岗位", jdRaw: jd, level: /实习|校招|应届/i.test(`${title} ${jd}`) ? "校招 / 实习" : "社会招聘", mustHave, niceToHave, responsibilities, competencies, rubric: { technicalMatch: 25, experienceRelevance: 20, technicalDepth: 20, evidenceQuality: 15, engineeringMaturity: 10, communicationClarity: 10 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

function depthOf(experience: Experience): ExperienceForensics["technicalDepth"] { const content = textOf(experience); if (!hasAction(content)) return "L1"; if (hasAction(content) && experience.technologies.length < 2) return "L2"; if (experience.technologies.length >= 2 && (hasNumber(content) || /架构|算法|链路|模块|接口|索引|模型/.test(content))) return "L3"; if (/为什么|权衡|替代|基线|边界|一致性|并发|故障|延迟|召回/.test(content)) return "L4"; if (/线上|生产|监控|容灾|演进|治理|规模化/.test(content)) return "L5"; return "L3"; }

function forensics(experience: Experience): ExperienceForensics {
  const content = textOf(experience); const actions = experience.bullets.filter(hasAction); const outputs = experience.bullets.filter((x) => /文档|系统|服务|模块|方案|模型|接口|平台|代码|论文|落地|上线/.test(x)); const evidence = experience.bullets.filter((x) => hasNumber(x)); const risks: string[] = []; const highlights: string[] = [];
  if (actions.length) highlights.push("能识别出具体技术动作，而不是只有技术名词"); else risks.push("个人负责内容不够明确，面试时需要核实候选人实际参与范围");
  if (evidence.length) highlights.push("包含可进一步核验的规模或结果指标"); else risks.push("缺少规模、结果或对比基线，项目价值暂时难以验证");
  if (outputs.length) highlights.push(`能看出交付物：${unique(outputs.flatMap((x) => x.match(/文档|系统|服务|模块|方案|模型|接口|平台|代码|论文|落地|上线/g) || [])).slice(0, 4).join("、")}`); else risks.push("项目产出不清晰，难以判断是否完成了可交付成果");
  if (experience.bullets.length < 2) risks.push("经历描述较短，背景、方案和结果链路不完整");
  const depth = depthOf(experience); const questions = [`请明确你亲自负责的模块、代码或设计决策。`, `请说明${experience.technologies.slice(0, 2).join("、") || "核心技术方案"}的输入、输出和关键边界。`]; if (evidence.length) questions.push("请说明该指标的测试环境、样本规模、基线和测量方法。"); else questions.push("如果把规模扩大 10 倍，你会先改动哪一部分？");
  return { title: experience.title, background: experience.summary || experience.bullets[0] || "未提取到背景", responsibilities: actions.slice(0, 4), technicalActions: experience.technologies.slice(0, 8), outputs: outputs.slice(0, 4), evidence: evidence.slice(0, 4), technicalDepth: depth, evidenceStrength: evidence.length && actions.length ? "strong" : actions.length ? "medium" : "weak", highlights, risks, verificationQuestions: questions };
}

export function analyzeResumeForJob(job: JobProfile, profile: ReturnType<typeof analyzeResume>): ResumeForensics {
  const analyses = profile.experiences.map(forensics); const corpus = profile.experiences.map(textOf).join(" ").toLowerCase(); const matchedRequirements = job.mustHave.concat(job.niceToHave).map((requirement) => { const found = corpus.includes(requirement.label.toLowerCase()); const related = profile.experiences.filter((x) => textOf(x).toLowerCase().includes(requirement.label.toLowerCase())).map((x) => x.title); return { requirement: requirement.label, evidence: related, strength: found && related.length && related.some((title) => analyses.find((x) => x.title === title)?.evidenceStrength === "strong") ? "strong" : found ? "medium" : "weak" } as const; });
  const missingRequirements = matchedRequirements.filter((x) => x.strength === "weak").slice(0, 8).map((x) => x.requirement); const dimensions = { technicalMatch: Math.round(matchedRequirements.filter((x) => x.strength !== "weak").length / Math.max(1, job.mustHave.length) * 100), experienceRelevance: Math.min(100, 45 + Math.min(40, analyses.length * 10) + (profile.recommendedRoles[0]?.score || 0) / 8), technicalDepth: Math.round(analyses.reduce((n, x) => n + ({ L1: 30, L2: 48, L3: 66, L4: 82, L5: 94 }[x.technicalDepth]), 0) / Math.max(1, analyses.length)), evidenceQuality: Math.round(analyses.reduce((n, x) => n + ({ strong: 90, medium: 65, weak: 35 }[x.evidenceStrength]), 0) / Math.max(1, analyses.length)), engineeringMaturity: Math.min(100, 45 + analyses.filter((x) => /性能|异常|稳定|并发|线上|监控/.test(x.background + x.responsibilities.join(" "))).length * 15), communicationClarity: Math.min(100, 45 + profile.experiences.reduce((n, x) => n + Math.min(2, x.bullets.length), 0) * 4) };
  const overallScore = Math.round(dimensions.technicalMatch * .25 + dimensions.experienceRelevance * .2 + dimensions.technicalDepth * .2 + dimensions.evidenceQuality * .15 + dimensions.engineeringMaturity * .1 + dimensions.communicationClarity * .1); const risks = unique([...analyses.flatMap((x) => x.risks), ...profile.risks]).slice(0, 10); const strengths = unique([...analyses.flatMap((x) => x.highlights), ...profile.strengths]).slice(0, 8); const interviewFocus = unique([...analyses.flatMap((x) => x.verificationQuestions), ...missingRequirements.map((x) => `请结合实际经历说明 ${x} 的使用深度。`)]).slice(0, 10); const recommendation = overallScore >= 82 ? "strong_interview" : overallScore >= 72 ? "interview" : overallScore >= 60 ? "manual_review" : "hold";
  return { overallScore, dimensionScores: dimensions, experienceAnalyses: analyses, matchedRequirements, missingRequirements, risks, strengths, interviewFocus, recommendation, confidence: Math.max(.45, Math.min(.94, .55 + analyses.filter((x) => x.evidenceStrength === "strong").length * .08)) };
}

export function createRecruiterResume(jobId: string, fileName: string, text: string): RecruiterResume { const profile = analyzeResume(text); return { id: id("resume"), jobId, fileName, profile, createdAt: new Date().toISOString() }; }
export function rankMatches(resumes: RecruiterResume[], job: JobProfile): MatchResult[] { return resumes.map((resume) => ({ ...resume, analysis: resume.analysis || analyzeResumeForJob(job, resume.profile), rank: 0 })).sort((a, b) => b.analysis.overallScore - a.analysis.overallScore).map((item, index) => ({ ...item, rank: index + 1 })); }
