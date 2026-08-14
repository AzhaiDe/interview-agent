import pdf from "pdf-parse";
import { fileTypeFromBuffer } from "file-type";
import mammoth from "mammoth";
import { pdf as renderPdf } from "pdf-to-img";
import { createWorker } from "tesseract.js";
import { config } from "./config.js";
import type { Experience, ResumeProfile } from "./types.js";

const techPatterns: { label: string; pattern: RegExp }[] = [
  { label: "Python", pattern: /\bpython\b/i }, { label: "Go", pattern: /\bgo\b/i }, { label: "Java", pattern: /\bjava\b/i },
  { label: "C++", pattern: /c\+\+/i }, { label: "JavaScript", pattern: /javascript/i }, { label: "TypeScript", pattern: /typescript/i },
  { label: "React", pattern: /\breact\b/i }, { label: "Vue", pattern: /\bvue(?:\.js)?\b/i }, { label: "Node.js", pattern: /node(?:\.js)?/i },
  { label: "Django", pattern: /django/i }, { label: "Flask", pattern: /flask/i }, { label: "FastAPI", pattern: /fastapi/i }, { label: "uni-app", pattern: /uni-?app/i },
  { label: "Redis", pattern: /redis/i }, { label: "MongoDB", pattern: /mongodb/i }, { label: "MySQL", pattern: /mysql/i }, { label: "PostgreSQL", pattern: /postgres(?:ql)?/i },
  { label: "SQLite", pattern: /sqlite/i }, { label: "Milvus", pattern: /milvus/i }, { label: "Elasticsearch", pattern: /elasticsearch|\bes\b/i }, { label: "Kafka", pattern: /kafka/i },
  { label: "Docker", pattern: /docker/i }, { label: "Kubernetes", pattern: /kubernetes|\bk8s\b/i }, { label: "LangChain", pattern: /langchain/i }, { label: "AutoGen", pattern: /autogen/i },
  { label: "Dify", pattern: /\bdify\b/i }, { label: "RAG", pattern: /\brag\b|检索增强/i }, { label: "Mamba", pattern: /mamba/i }, { label: "Qwen", pattern: /qwen/i },
  { label: "QLoRA", pattern: /qlora/i }, { label: "ReAct", pattern: /react\s*式|\breact\b.*工具调用/i }, { label: "BERT", pattern: /bert/i }, { label: "GPT", pattern: /\bgpt\b/i },
  { label: "Transformer", pattern: /transformer/i }, { label: "Linux", pattern: /linux/i }, { label: "SQL", pattern: /\bsql\b/i }, { label: "分布式", pattern: /分布式/i }
  ,{ label: "接口幂等", pattern: /幂等键|接口幂等|重复入账/i }, { label: "前端性能", pattern: /首屏|lighthouse|渲染性能|前端性能/i }, { label: "状态管理", pattern: /状态管理|数据流|redux|pinia|vuex/i }
];

const sectionNames: Record<string, string> = {
  "教育背景": "教育背景", "教育经历": "教育背景", education: "教育背景",
  "实习经历": "实习经历", "工作经历": "实习经历", internship: "实习经历", experience: "实习经历",
  "项目经历": "项目经历", "项目经验": "项目经历", projects: "项目经历",
  "研究经历": "研究经历", "科研经历": "研究经历", research: "研究经历",
  "工作技能": "工作技能", "专业技能": "工作技能", skills: "工作技能"
};

function cleanLine(line: string): string {
  return line.replace(/[\u0000\uE000-\uF8FF▤▥▦▧]/g, "").replace(/[ \t]+/g, " ").trim();
}

function stripBullet(line: string): string {
  return line.replace(/^[•●▪◦‣·\-–—*]+\s*/, "").trim();
}

function isContactLine(line: string): boolean {
  return /https?:\/\/|www\.|github\.com|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:电话|手机|tel)\s*[:：]/i.test(line);
}

function detectSection(line: string): string | undefined {
  const simplified = line.replace(/^[^\p{L}\p{N}]*/u, "").trim().toLowerCase();
  const key = Object.keys(sectionNames).find((name) => simplified === name.toLowerCase() || simplified.includes(name.toLowerCase()));
  return key ? sectionNames[key] : undefined;
}

function dateMatch(line: string): RegExpMatchArray | null {
  return line.match(/20\d{2}[./-]\d{1,2}\s*(?:[-–—~至]\s*(?:20\d{2}[./-]\d{1,2}|至今))?/);
}

function extractContact(lines: string[]) {
  const joined = lines.join(" ");
  const email = joined.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
  const phone = joined.match(/(?:\+?86[- ]?)?1[3-9]\d{9}/)?.[0];
  const links = Array.from(joined.matchAll(/https?:\/\/[^\s|，,]+|www\.[^\s|，,]+/gi), (match) => match[0].replace(/[)）。，]+$/, ""));
  return { email, phone, links };
}

function detectSkills(text: string): string[] {
  return techPatterns.filter((item) => item.pattern.test(text)).map((item) => item.label);
}

function parseHead(line: string, section: string, type: Experience["type"]): Partial<Experience> {
  const match = dateMatch(line);
  const period = match?.[0];
  const head = (period ? line.slice(0, line.indexOf(period)) : line).replace(/[|｜,，]\s*$/, "").trim();
  const location = period ? line.slice((line.indexOf(period) + period.length)).replace(/^[,，|｜\s]+/, "").trim() : undefined;
  const parts = head.split(/[，,|｜]/).map((part) => part.trim()).filter(Boolean);
  const organization = parts.length > 1 ? parts[0] : undefined;
  const role = parts.length > 1 ? parts.slice(1).join("，") : undefined;
  return { title: head || "未命名经历", organization, role, period, location, section, type };
}

function parseExperiences(lines: string[]): Experience[] {
  const experiences: Experience[] = [];
  let section = "";
  let current: Experience | undefined;
  const finish = () => { if (current && current.bullets.length) experiences.push(current); current = undefined; };
  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line || isContactLine(line)) continue;
    const nextSection = detectSection(line);
    if (nextSection) { finish(); section = nextSection; continue; }
    if (!["实习经历", "项目经历", "研究经历"].includes(section)) continue;
    const isEntry = Boolean(dateMatch(line)) && !/^[•●▪◦‣·\-–—*]/.test(line);
    if (isEntry) {
      finish();
      const type = section === "实习经历" ? "internship" : section === "研究经历" ? "research" : "project";
      current = { ...parseHead(line, section, type), title: parseHead(line, section, type).title ?? "未命名经历", summary: "", bullets: [], technologies: [], claims: [], highlights: [], risks: [] } as Experience;
      continue;
    }
    if (current) current.bullets.push(stripBullet(line));
  }
  finish();
  return experiences.map((experience) => {
    const content = [experience.title, experience.role, ...experience.bullets].filter(Boolean).join(" ");
    experience.summary = experience.bullets.slice(0, 2).join(" ");
    experience.technologies = detectSkills(content);
    experience.claims = experience.bullets.filter((bullet) => /负责|设计|实现|提出|构建|开发|优化|训练|完成|集成|搭建/.test(bullet));
    if (/\d+(?:\.\d+)?\s*(?:%|倍|ms|秒|万|亿|次|个|条|x\b)|P\d+|Top-\d/i.test(content)) experience.highlights.push("有可核验的量化结果或性能指标");
    if (experience.claims.length) experience.highlights.push("能看出具体的技术动作，而不是只有技术名词");
    if (experience.technologies.length >= 2) experience.highlights.push(`技术方案有一定完整度：${experience.technologies.slice(0, 5).join("、")}`);
    if (!experience.claims.length) experience.risks.push("个人负责内容不够明确，容易被追问‘你具体做了什么’");
    if (!experience.bullets.some((bullet) => /\d+(?:\.\d+)?\s*(?:%|倍|ms|秒|万|亿|次|个|条|x\b)|P\d+|Top-\d/i.test(bullet))) experience.risks.push("缺少结果、规模或对比基线，项目价值不够容易验证");
    if (experience.bullets.length < 2) experience.risks.push("经历描述较短，背景、方案和结果之间的链路不完整");
    return experience;
  });
}

function roleRecommendations(experiences: Experience[], fullText: string) {
  const corpus = experiences.map((experience) => `${experience.section} ${experience.title} ${experience.role} ${experience.bullets.join(" ")}`).join(" ");
  const roleRules: { role: string; signals: { pattern: RegExp; weight: number; label: string }[] }[] = [
    { role: "算法 / 人工智能", signals: [{ pattern: /模型|算法|训练|微调|分类|召回|向量|RAG|Mamba|Qwen|LoRA|深度学习/i, weight: 18, label: "多段经历直接围绕模型、算法或检索系统展开" }, { pattern: /准确率|召回率|F1|损失|数据集|推理/i, weight: 12, label: "有模型效果、数据集或推理指标" }] },
    { role: "后端开发", signals: [{ pattern: /服务|系统|API|接口|数据库|缓存|并发|Django|Flask|FastAPI|后端|架构/i, weight: 16, label: "有服务端系统的设计、接口或数据处理工作" }, { pattern: /延迟|QPS|资源|稳定性|异常|监控|集成/i, weight: 13, label: "关注性能、稳定性或线上工程约束" }] },
    { role: "全栈开发", signals: [{ pattern: /前端|小程序|uni-app|React|Vue|页面/i, weight: 14, label: "有用户界面或前端应用交付" }, { pattern: /API|后端|Django|Flask|数据库|服务/i, weight: 14, label: "同时具备服务端和数据层实现" }] },
    { role: "数据开发", signals: [{ pattern: /数据|SQL|数据集|数据库|ETL|数据处理|数据仓库/i, weight: 16, label: "经历中持续出现数据处理与数据系统工作" }, { pattern: /清洗|统计|分析|批处理|检索/i, weight: 10, label: "有清洗、分析或批处理链路" }] },
    { role: "测试开发", signals: [{ pattern: /测试|质量|自动化|异常检测|监控|故障|验证/i, weight: 17, label: "有测试、异常处理或质量保障场景" }, { pattern: /接口|回归|覆盖率|稳定性/i, weight: 10, label: "涉及接口、稳定性或验证指标" }] }
  ];
  return roleRules.map((rule) => {
    const matched = rule.signals.filter((signal) => signal.pattern.test(corpus));
    const experienceCount = experiences.filter((experience) => matched.some((signal) => signal.pattern.test(`${experience.title} ${experience.bullets.join(" ")}`))).length;
    const score = matched.length ? Math.min(96, 30 + matched.reduce((total, item) => total + item.weight, 0) + Math.min(experienceCount * 5, 15)) : 22;
    return { role: rule.role, score, reasons: matched.length ? matched.map((item) => item.label).slice(0, 2).concat(experienceCount ? [`来自 ${experienceCount} 段具体经历，而非单独的技能栏`] : []) : ["完整经历中暂未形成足够的岗位证据"] };
  }).sort((a, b) => b.score - a.score);
}

class ResumeFileError extends Error { statusCode = 400; }
class ResumeTimeoutError extends Error { statusCode = 504; }

/**
 * Timeout wrapper for async operations.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ResumeTimeoutError(`${operation} 超时（${timeoutMs}ms），请稍后重试或上传文本型 PDF`));
    }, timeoutMs);

    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function ocrPdf(buffer: Buffer): Promise<string> {
  if (!config.ocr.enabled) throw new ResumeFileError("PDF 没有可提取文本；请启用 OCR 或上传文本型 PDF/DOCX");

  // Add timeout for OCR (5 minutes total)
  return withTimeout((async () => {
    const document = await renderPdf(buffer, { scale: 2 });
    if (document.length > config.ocr.maxPages) { document.destroy(); throw new ResumeFileError(`扫描 PDF 最多支持 ${config.ocr.maxPages} 页`); }
    const worker = await createWorker(config.ocr.languages);
    const pages: string[] = [];
    try {
      let count = 0;
      for await (const image of document) {
        if (++count > config.ocr.maxPages) break;
        const result = await worker.recognize(image);
        pages.push(result.data.text.trim());
      }
    } finally {
      await worker.terminate();
      document.destroy();
    }
    const text = pages.filter(Boolean).join("\n");
    if (text.length < 20) throw new ResumeFileError("OCR 未识别到足够的简历文本");
    return text;
  })(), 300_000, "OCR 识别");
}

export async function inspectResumeFile(filename: string, buffer: Buffer): Promise<{ kind: "pdf" | "docx" | "text"; mime: string }> {
  const extension = filename.toLowerCase().match(/\.(pdf|docx|txt|md)$/)?.[1];
  if (!extension) throw new ResumeFileError("仅支持 PDF、DOCX、TXT 或 Markdown 简历");
  const detected = await fileTypeFromBuffer(buffer);
  if (extension === "pdf") {
    if (detected?.ext !== "pdf") throw new ResumeFileError("文件内容不是有效 PDF");
    return { kind: "pdf", mime: "application/pdf" };
  }
  if (extension === "docx") {
    if (detected?.ext !== "docx") throw new ResumeFileError("文件内容不是有效 DOCX");
    return { kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  if (detected || buffer.includes(0)) throw new ResumeFileError("TXT/Markdown 中检测到二进制内容");
  return { kind: "text", mime: "text/plain" };
}

export async function extractText(filename: string, buffer: Buffer): Promise<string> {
  const inspected = await inspectResumeFile(filename, buffer);
  if (inspected.kind === "pdf") {
    // Add timeout for PDF parsing (30 seconds)
    const result = await withTimeout(pdf(buffer), 30_000, "PDF 解析");
    const text = result.text.trim();
    return text.length >= 20 ? text : ocrPdf(buffer);
  }
  if (inspected.kind === "docx") return (await mammoth.extractRawText({ buffer })).value.trim();
  return buffer.toString("utf8").trim();
}

export function analyzeResume(rawText: string, targetRole = "待选择岗位"): ResumeProfile {
  const lines = rawText.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const normalizedText = lines.join("\n");
  const contact = extractContact(lines);
  const experiences = parseExperiences(lines);
  const skills = detectSkills(normalizedText);
  const education = lines.filter((line) => /大学|学院|硕士|本科|博士|GPA|雅思|奖学金|荣誉奖项/.test(line)).filter((line) => !isContactLine(line)).slice(0, 8);
  const recommendedRoles = roleRecommendations(experiences, normalizedText);
  const strengths = experiences.flatMap((experience) => experience.highlights.map((highlight) => `${experience.title}：${highlight}`)).slice(0, 8);
  const risks = experiences.flatMap((experience) => experience.risks.map((risk) => `${experience.title}：${risk}`)).slice(0, 10);
  if (!strengths.length) strengths.push("目前没有足够明确的项目亮点，建议在面试前补充结果和个人贡献");
  const summary = `这是一份以${education.length ? "计算机相关教育背景、" : "技术实践、"} ${experiences.length} 段项目/实习经历为主体的简历。经历主要覆盖 ${recommendedRoles.slice(0, 2).map((role) => role.role).join(" 与 ") || "技术研发"}，系统会优先围绕这些经历验证实际贡献、技术深度和结果证据。`;
  const questions = experiences.flatMap((experience) => [
    `请用一分钟介绍“${experience.title}”，重点说清楚你亲自负责的部分。`,
    experience.technologies[0] ? `在“${experience.title}”中，你为什么选择 ${experience.technologies[0]}？替代方案是什么？` : `“${experience.title}”的核心技术难点是什么？`,
    `如果把“${experience.title}”的规模提高 10 倍，你会先改哪里？`
  ]).slice(0, 15);
  return { rawText, normalizedText, contact, targetRole, summary, education, recommendedRoles, skills, experiences, strengths, risks, questions };
}
