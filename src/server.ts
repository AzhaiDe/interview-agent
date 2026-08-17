import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config, runtimeCapabilities } from "./config.js";
import { database } from "./database.js";
import { deleteStoredResource, readStoredResource, storeUpload } from "./file-storage.js";
import { attachGraphState, createGraphSession, createGrowthReport, createInterviewOpening, evaluateInterviewAnswer, graphStateOf, sessionCritic } from "./agent-runtime.js";
import { enqueueMemory, flushMemoryOutbox, pollMemoryIngestJobs } from "./omnimemory.js";
import { analyzeJobWithAgent, analyzeResumeWithAgent, matchWithAgent, recruiterAgentHealth } from "./recruiter-agent.js";
import { createRecruiterResume } from "./recruiter.js";
import { analyzeResume, extractText } from "./resume.js";
import { analyzeResumeWorkflow } from "./resume-workflow.js";
import { getKnowledgeRows, knowledgeHealth, retrieveEvidencePack } from "./knowledge-service.js";
import { graphManifest } from "./agent-graph.js";
import { interviewGraph } from "./agent/interview-graph.js";
import { ExecutableGraph } from "./graph-runtime.js";
import type { InterviewSession, JobProfile, RecruiterResume } from "./types.js";
import { verifyAccessToken, AUTH_COOKIE_NAME, hashPassword, comparePassword, generateAccessToken, getCookieOptions } from "./auth.js";

// Keep the transport limit slightly above the advertised 10 MB file limit so
// multipart overhead does not turn a valid upload into a 413 response.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const app = Fastify({ logger: true, trustProxy: config.publicDemo, bodyLimit: 12 * 1024 * 1024 });
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 50, parts: 60 } });
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost', 'http://localhost:80', 'http://localhost:3000'];
await app.register(cors, { origin: corsOrigins, credentials: true });
await app.register(cookie);
const publicDir = path.resolve(process.cwd(), "public");

// Startup-only owner reference: used by interrupt recovery at module load time.
// Route handlers use request.userId instead.
const __startupOwnerId = config.localUserId;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function allowedResume(filename: string) { return /\.(pdf|docx|txt|md)$/i.test(filename); }
function modelMode(mode: "model" | "fallback") { return mode; }

/** Internal helper that captures user context via parameter. Used by route handlers. */
function enqueueResumeMemory(userId: string, resumeId: string, profile: Awaited<ReturnType<typeof analyzeResumeWorkflow>>, eventVersion = profile.analysisVersion || "v1") {
  const proven = (profile.evidenceClaims || []).filter((claim) => claim.status === "proven").slice(0, 6).map((claim) => claim.claim);
  enqueueMemory({ ownerId: userId, deviceNo: database.memoryDeviceNo(userId), sessionId: `resume:${resumeId}`, groupId: `candidate:${userId}:profile`, groupName: "候选人脱敏能力画像", commitId: `resume:${resumeId}:analysis:${eventVersion}`, content: `目标岗位：${profile.targetRole}；已证明能力：${proven.join("、") || profile.skills.slice(0, 6).join("、") || "待验证"}；主要风险：${profile.risks.slice(0, 4).join("、") || "暂无"}；建议岗位：${profile.recommendedRoles.slice(0, 3).map((item) => item.role).join("、")}` });
}

function publicClientKey(request: { headers: Record<string, string | string[] | undefined>; ip: string }) {
  const forwarded = request.headers["cf-connecting-ip"] ?? request.headers["x-forwarded-for"];
  return Array.isArray(forwarded) ? forwarded[0] : String(forwarded || request.ip || "unknown").split(",")[0].trim();
}

app.addHook("onRequest", async (request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "same-origin");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  reply.header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'");

  // Auth check (skip for public paths and auth endpoints)
  // The shell and all of its static assets must be reachable before login.
  // Previously only index.html/app.js were public, so every stylesheet got a
  // 401 and the browser rendered an unstyled (plain HTML) interface.
  const isPublicPath = request.url === "/" || request.url.startsWith("/app.js") || request.url.startsWith("/styles-") || request.url.startsWith("/favicon") || request.url.startsWith("/public/") || request.url.startsWith("/fonts/");
  const isAuthEndpoint = request.url.startsWith("/api/auth/register") || request.url.startsWith("/api/auth/login");
  // The versioned auth paths belonged to the pre-React client. Do not route
  // or authenticate them: return an explicit deprecation response so stale
  // browser bundles fail clearly and cannot accidentally create a session.
  if (request.url.startsWith("/api/v1/auth/")) {
    return reply.code(410).send({ error: "旧版认证接口已下线，请刷新页面后使用 /api/auth/*" });
  }
  // Health probes are internal liveness checks, not user API calls. They must
  // remain unauthenticated so Docker/systemd can determine container health.
  const isHealthCheck = request.url.split("?", 1)[0] === "/api/v1/health";
  if (config.requireAuth && !isPublicPath && !isAuthEndpoint && !isHealthCheck) {
    const header = String(request.headers.authorization || "");
    const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const rawToken = (request.cookies as Record<string, string | undefined>)[AUTH_COOKIE_NAME] || bearer;
    if (!rawToken) return reply.code(401).send({ error: "请先登录" });
    const payload = verifyAccessToken(rawToken);
    if (!payload) return reply.code(401).send({ error: "登录已过期，请重新登录" });
    request.userId = payload.userId;
    request.displayName = payload.displayName;
  }

  if (isHealthCheck || !config.publicDemo || !request.url.startsWith("/api/")) return;
  const accessCode = process.env.PUBLIC_ACCESS_CODE?.trim();
  if (accessCode && request.headers["x-public-access-code"] !== accessCode) return reply.code(401).send({ error: "此演示站点需要访问码" });
  const now = Date.now();
  const key = publicClientKey(request);
  const bucket = rateBuckets.get(key);
  const limit = request.method === "GET" ? 90 : 18;
  if (!bucket || bucket.resetAt <= now) { rateBuckets.set(key, { count: 1, resetAt: now + 60_000 }); return; }
  bucket.count++;
  if (bucket.count > limit) return reply.code(429).send({ error: "请求过于频繁，请一分钟后重试" });
});

 function serializeInterview(session: InterviewSession) {
  const runtime = (session as any).agentRuntime;
  const graphState = (session as any)._graphState;
  return { sessionId: session.id, status: session.result ? "finished" : "active", targetRole: session.profile.targetRole, pressure: session.pressure, interviewType: session.interviewType || "comprehensive", phase: session.phase, question: session.currentQuestion, topic: session.currentTopic, questionType: session.currentQuestionType, mappedSkill: session.currentMappedSkill, progress: session.questionIndex, mode: session.modelMode, result: session.result, transcript: session.transcript, diagnoses: session.diagnoses, roleRubric: session.roleRubric, skillRoundCounts: session.skillRoundCounts, graph: { version: runtime?.graphVersion, node: runtime?.node, traceId: runtime?.traceId, evidenceCount: runtime?.evidenceLedger?.length || 0, beliefCount: Object.keys(runtime?.beliefs || {}).length, personalMemoryCount: runtime?.lastEvidencePack?.personalMemory?.length || 0, memoryEventIds: runtime?.lastEvidencePack?.provenance?.memoryEventIds || [], subgraph: graphState?.subgraphName, subgraphStep: graphState?.subgraphStep, nextAction: graphState?.nextAction, latencyMs: graphState?.trace?.latencyMs || 0, tokensUsed: graphState?.trace?.tokensUsed || 0, modelCalls: graphState?.trace?.modelCalls || 0, nodeMetrics: graphState?.trace?.nodeMetrics || {}, contradictions: graphState?.contradictions?.length || 0 } };
}

async function runRecruiterTask(taskId: string, job: JobProfile, userId: string) {
  const task = database.getTask(taskId, userId);
  if (!task) return;
  try {
    const resumes = database.listRecruiterResumes(job.id, userId);
    task.status = "analyzing"; task.stage = "正在逐份提取技术证据"; task.total = resumes.length; task.progress = 0; task.updatedAt = new Date().toISOString(); database.saveTask(task);
    const modes = new Set<string>();
    let cursor = 0; let completed = 0;
    const worker = async () => {
      while (cursor < resumes.length) {
        const resume = resumes[cursor++];
        resume.analysisStatus = "analyzing"; database.saveRecruiterResume(userId, resume);
        const analyzed = await analyzeResumeWithAgent(userId, job, resume);
        modes.add(analyzed.mode); resume.analysis = analyzed.result; resume.analysisStatus = analyzed.mode === "model" ? "completed" : "fallback"; resume.analysisError = analyzed.error;
        completed++; task.progress = completed; task.mode = modes.size > 1 ? "mixed" : modelMode(analyzed.mode); task.updatedAt = new Date().toISOString(); database.saveRecruiterResume(userId, resume); database.saveTask(task);
      }
    };
    await Promise.all(Array.from({ length: Math.min(config.workerConcurrency, resumes.length) }, () => worker()));
    task.status = "matching"; task.stage = "正在进行候选人横向校准"; task.updatedAt = new Date().toISOString(); database.saveTask(task);
    const matched = await matchWithAgent(userId, job, resumes); modes.add(matched.mode); task.mode = modes.size > 1 ? "mixed" : modelMode(matched.mode);
    database.saveMatches(job.id, userId, matched.result);
    matched.result.forEach((x) => database.saveRecruiterResume(userId, x));
    task.status = "completed"; task.stage = matched.mode === "model" ? "百炼工作流分析完成" : "本地规则降级分析完成"; task.result = { count: matched.result.length }; task.updatedAt = new Date().toISOString(); database.saveTask(task);
    void flushMemoryOutbox(20);
  } catch (error) {
    task.status = "failed"; task.stage = "分析失败"; task.error = error instanceof Error ? error.message : String(error); task.updatedAt = new Date().toISOString(); database.saveTask(task);
  }
}

async function runResumeAnalysisTask(taskId: string, resumeId: string, userId: string) {
  const task = database.getTask(taskId, userId);
  const resume = database.getResume(resumeId, userId);
  if (!task || !resume) return;
  try {
    task.status = "analyzing"; task.stage = "正在执行证据化简历分析"; task.updatedAt = new Date().toISOString(); database.saveTask(task);
    const profile = await analyzeResumeWorkflow(resume.rawText, resume.profile.targetRole);
    database.saveResume(resume.id, userId, resume.fileName, resume.rawText, profile);
    enqueueResumeMemory(userId, resume.id, profile, taskId); void flushMemoryOutbox();
    task.status = "completed"; task.progress = 1; task.stage = "简历分析完成"; task.mode = profile.analysisMode || "fallback"; task.result = { resumeId, analysisVersion: profile.analysisVersion }; task.updatedAt = new Date().toISOString(); database.saveTask(task);
    database.audit({ ownerId: userId, action: "resume.analyzed", resourceType: "resume", resourceId: resumeId, metadata: { analysisVersion: profile.analysisVersion, mode: profile.analysisMode } });
  } catch (error) {
    task.status = "failed"; task.stage = "简历分析失败"; task.error = error instanceof Error ? error.message : String(error); task.updatedAt = new Date().toISOString(); database.saveTask(task);
  }
}

for (const interrupted of database.interruptedTasks(__startupOwnerId)) {
  app.log.warn({ taskId: interrupted.id, kind: interrupted.kind }, "resuming interrupted local task");
  if (interrupted.kind === "resume-analysis") void runResumeAnalysisTask(interrupted.id, interrupted.resourceId, __startupOwnerId);
  if (interrupted.kind === "recruiter-match") { const job = database.getJob(interrupted.resourceId, __startupOwnerId); if (job) void runRecruiterTask(interrupted.id, job, __startupOwnerId); }
}

const BUILD_TS = Date.now().toString();
const staticFiles: Record<string, string> = { "/": "index.html", "/app.js": "app.js", "/styles-v2.css": "styles-v2.css", "/styles-overrides.css": "styles-overrides.css", "/styles-composer.css": "styles-composer.css", "/styles-recruiter.css": "styles-recruiter.css", "/styles-recruiter-fix.css": "styles-recruiter-fix.css", "/styles-interview-chat.css": "styles-interview-chat.css" };
for (const [route, file] of Object.entries(staticFiles)) app.get(route, async (_request, reply) => {
    let content = await fs.readFile(path.join(publicDir, file));
    if (file === "index.html") {
      let html = content.toString();
      html = html.replace("__BUILD_TIMESTAMP__", BUILD_TS);
      html = html.replace('name="offerpilot-require-auth" content="false"', `name="offerpilot-require-auth" content="${config.requireAuth}"`);
      content = Buffer.from(html);
    }
    reply.header("cache-control", "no-store").type(file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html").send(content);
});

app.get("/api/v1/health", async () => ({ ok: true, version: "3.0.0-graph-local", capabilities: { ...runtimeCapabilities(), graph: graphManifest().version, knowledge: knowledgeHealth() } }));
app.get("/api/v1/graph/manifest", async () => graphManifest());
app.get("/api/v1/knowledge/health", async () => knowledgeHealth());
app.get<{ Querystring: { roleId?: string; type?: string; status?: any; limit?: string } }>("/api/v1/knowledge/entities", async (request, reply) => {
  const type = request.query.type || "questions";
  if (!["competencies", "concepts", "questions", "followups", "misconceptions", "failure_modes", "scoring_anchors"].includes(type)) return reply.code(400).send({ error: "知识实体类型无效" });
  return { entities: getKnowledgeRows(type as any, { roleId: request.query.roleId, status: request.query.status, limit: Math.min(500, Math.max(1, Number(request.query.limit || 100))) }) };
});
app.get<{ Querystring: { roleId: string; q: string; skill?: string; limit?: string } }>("/api/v1/knowledge/retrieve", async (request, reply) => {
  if (!request.query.roleId || !request.query.q) return reply.code(400).send({ error: "roleId 和 q 必填" });
  return retrieveEvidencePack({ roleId: request.query.roleId, query: request.query.q, skill: request.query.skill, limit: Math.min(20, Math.max(1, Number(request.query.limit || 8))) });
});
app.get("/api/recruiter/agent-health", async () => ({ ...recruiterAgentHealth(), runtime: runtimeCapabilities() }));

// ---- Auth Routes ----

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
}).strict();

const registerHandler = async (request: any, reply: any) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "用户名、显示名称和密码格式无效" });

  const { username, displayName, password } = parsed.data;
  const userId = `user-${username.toLowerCase()}`;

  const existing = database.db.prepare("SELECT id FROM users WHERE id=? OR email=?").get(userId, `${username}@internal`) as { id?: string } | undefined;
  if (existing) return reply.code(409).send({ error: "该用户名已被注册" });

  const passwordHash = await hashPassword(password);
  const timestamp = new Date().toISOString();

  database.db.prepare("INSERT INTO users(id, display_name, email, password_hash, created_at) VALUES(?,?,?,?,?)")
    .run(userId, displayName, `${username}@internal`, passwordHash, timestamp);

  database.db.prepare("INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,?,?)")
    .run("local-org", userId, "member", timestamp);

  const token = generateAccessToken({ userId, displayName });
  reply.setCookie(AUTH_COOKIE_NAME, token, getCookieOptions());

  return reply.code(201).send({ message: "注册成功", token, userId, displayName, user: { id: userId, displayName, createdAt: timestamp } });
};
app.post("/api/auth/register", { preHandler: (_req, _reply, done) => done() }, registerHandler);

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1),
}).strict();

const loginHandler = async (request: any, reply: any) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "用户名和密码不能为空" });

  const { username, password } = parsed.data;
  const userId = username.startsWith("user-") ? username : `user-${username.toLowerCase()}`;

  const userRow = database.db.prepare(
    "SELECT id, display_name, password_hash, is_active FROM users WHERE id=? AND is_active=1"
  ).get(userId) as { id: string; display_name: string; password_hash: string; is_active: number } | undefined;

  if (!userRow || !(await comparePassword(password, userRow.password_hash))) {
    return reply.code(401).send({ error: "用户名或密码错误" });
  }

  const token = generateAccessToken({ userId: userRow.id, displayName: userRow.display_name });
  reply.setCookie(AUTH_COOKIE_NAME, token, getCookieOptions());

  return reply.send({ message: "登录成功", token, userId: userRow.id, displayName: userRow.display_name, user: { id: userRow.id, displayName: userRow.display_name } });
};
app.post("/api/auth/login", { preHandler: (_req, _reply, done) => done() }, loginHandler);

app.post("/api/auth/logout", async (request, reply) => {
  reply.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  return reply.send({ message: "已退出登录" });
});

app.get("/api/auth/me", async (request) => {
  return { id: request.userId, displayName: request.displayName };
});

// ---- Resume Routes ----

app.post("/api/resume/analyze", async (request, reply) => {
  const data = await request.file();
  if (!data || !allowedResume(data.filename)) return reply.code(400).send({ error: "请上传 PDF、DOCX、TXT 或 Markdown 简历" });
  const buffer = await data.toBuffer();

  let text: string;
  try {
    text = await extractText(data.filename, buffer);
  } catch (error) {
    const statusCode = (error as any).statusCode || 500;
    const message = error instanceof Error ? error.message : String(error);
    request.log.error({ error: message, filename: data.filename }, "Failed to extract text from resume");
    return reply.code(statusCode).send({ error: message });
  }

  if (!text || text.length > 100_000) return reply.code(400).send({ error: "简历为空或文本过长" });
  const resumeId = `resume-${crypto.randomUUID().slice(0, 12)}`;
  await storeUpload({ ownerId: request.userId, purpose: "candidate-resume", resourceId: resumeId, originalName: data.filename, mimeType: data.mimetype, buffer });
  const profile = { ...analyzeResume(text), analysisMode: "fallback" as const, analysisVersion: "deterministic-upload-v1" };
  database.saveResume(resumeId, request.userId, data.filename, text, profile);
  const timestamp = new Date().toISOString();
  const task = { id: `task-${crypto.randomUUID().slice(0, 12)}`, ownerId: request.userId, kind: "resume-analysis", resourceId: resumeId, status: "queued" as const, progress: 0, total: 1, stage: "等待启动", mode: "fallback" as const, createdAt: timestamp, updatedAt: timestamp };
  database.saveTask(task);
  database.audit({ ownerId: request.userId, action: "resume.uploaded", resourceType: "resume", resourceId: resumeId, metadata: { taskId: task.id } });
  void runResumeAnalysisTask(task.id, resumeId, request.userId);
  return reply.code(202).send({ resumeId, taskId: task.id, status: task.status, profile });
});

app.post("/api/v1/resumes", async (request, reply) => {
  const data = await request.file();
  if (!data || !allowedResume(data.filename)) return reply.code(400).send({ error: "请上传 PDF、DOCX、TXT 或 Markdown 简历" });
  const buffer = await data.toBuffer();

  let text: string;
  try {
    text = await extractText(data.filename, buffer);
  } catch (error) {
    const statusCode = (error as any).statusCode || 500;
    const message = error instanceof Error ? error.message : String(error);
    request.log.error({ error: message, filename: data.filename }, "Failed to extract text from resume");
    return reply.code(statusCode).send({ error: message });
  }

  if (!text || text.length > 100_000) return reply.code(400).send({ error: "简历为空或文本过长" });
  const resumeId = `resume-${crypto.randomUUID().slice(0, 12)}`;
  const profile = { ...analyzeResume(text), analysisMode: "fallback" as const, analysisVersion: "deterministic-upload-v1" };
  await storeUpload({ ownerId: request.userId, purpose: "candidate-resume", resourceId: resumeId, originalName: data.filename, mimeType: data.mimetype, buffer });
  database.saveResume(resumeId, request.userId, data.filename, text, profile);
  database.audit({ ownerId: request.userId, action: "resume.uploaded", resourceType: "resume", resourceId: resumeId });
  return reply.code(201).send({ resumeId, fileName: data.filename, profile });
});

app.get("/api/v1/resumes", async (request) => ({ resumes: database.listResumes(request.userId) }));
app.get<{ Params: { id: string } }>("/api/v1/resumes/:id", async (request, reply) => {
  const resume = database.getResume(request.params.id, request.userId); return resume || reply.code(404).send({ error: "简历不存在" });
});
app.get<{ Params: { id: string } }>("/api/v1/resumes/:id/analysis", async (request, reply) => {
  const resume = database.getResume(request.params.id, request.userId); return resume ? { resumeId: resume.id, profile: resume.profile } : reply.code(404).send({ error: "简历不存在" });
});
app.post<{ Params: { id: string } }>("/api/v1/resumes/:id/analyze", async (request, reply) => {
  const resume = database.getResume(request.params.id, request.userId); if (!resume) return reply.code(404).send({ error: "简历不存在" });
  const timestamp = new Date().toISOString();
  const task = { id: `task-${crypto.randomUUID().slice(0, 12)}`, ownerId: request.userId, kind: "resume-analysis", resourceId: resume.id, status: "queued", progress: 0, total: 1, stage: "等待启动", mode: "fallback", createdAt: timestamp, updatedAt: timestamp };
  database.saveTask(task); void runResumeAnalysisTask(task.id, resume.id, request.userId);
  return reply.code(202).send({ taskId: task.id, status: task.status });
});
app.delete<{ Params: { id: string } }>("/api/v1/resumes/:id", async (request, reply) => {
  if (!database.softDeleteResume(request.params.id, request.userId)) return reply.code(404).send({ error: "简历不存在" });
  const deletedFiles = await deleteStoredResource(request.userId, request.params.id);
  database.audit({ ownerId: request.userId, action: "resume.deleted", resourceType: "resume", resourceId: request.params.id, metadata: { deletedFiles } });
  return { ok: true, deletedFiles };
});

app.get<{ Params: { resourceId: string } }>("/api/v1/files/:resourceId/download", async (request, reply) => {
  const stored = await readStoredResource(request.userId, request.params.resourceId);
  if (!stored) return reply.code(404).send({ error: "简历附件不存在或已删除" });
  const safeAscii = stored.originalName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) || "resume";
  const encoded = encodeURIComponent(stored.originalName);
  database.audit({ ownerId: request.userId, action: "resume.attachment_downloaded", resourceType: "upload", resourceId: request.params.resourceId });
  return reply
    .header("Content-Type", stored.mimeType || "application/octet-stream")
    .header("Content-Length", String(stored.buffer.byteLength))
    .header("Content-Disposition", `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`)
    .send(stored.buffer);
});

app.get<{ Params: { taskId: string } }>("/api/v1/tasks/:taskId", async (request, reply) => {
  const task = database.getTask(request.params.taskId, request.userId); return task ? { task: { ...task, completed: task.progress } } : reply.code(404).send({ error: "任务不存在" });
});

// ---- Job / Recruiter Routes ----

async function handleCreateJob(request: any, reply: any) {
  const parsed = z.object({
    title: z.string().trim().min(1).max(160),
    jd: z.string().trim().min(20).max(40_000),
    publicId: z.number().int().positive().optional(),
    team: z.string().trim().max(120).optional(),
    city: z.string().trim().max(80).optional(),
    recruitmentType: z.string().trim().max(80).optional(),
    category: z.string().trim().max(80).optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
    intro: z.string().trim().max(1000).optional(),
    createdByRecruiter: z.boolean().optional(),
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "请填写有效的岗位名称和 JD" });
  const analyzed = await analyzeJobWithAgent(request.userId, parsed.data.title, parsed.data.jd);
  Object.assign(analyzed.result, {
    publicId: parsed.data.publicId,
    team: parsed.data.team,
    city: parsed.data.city,
    recruitmentType: parsed.data.recruitmentType,
    category: parsed.data.category,
    tags: parsed.data.tags,
    intro: parsed.data.intro,
    createdByRecruiter: parsed.data.createdByRecruiter,
  });
  analyzed.result.agentMode = modelMode(analyzed.mode); database.saveJob(request.userId, analyzed.result);
  database.audit({ ownerId: request.userId, action: "job.rubric_drafted", resourceType: "job", resourceId: analyzed.result.id, metadata: { mode: analyzed.mode, rubricVersion: analyzed.result.rubricVersion } });
  void flushMemoryOutbox();
  return { job: analyzed.result, agentMode: modelMode(analyzed.mode), warning: analyzed.error };
}

app.post("/api/recruiter/jobs", handleCreateJob);
app.post("/api/v1/recruiter/jobs", handleCreateJob);
app.post<{ Params: { jobId: string } }>("/api/recruiter/jobs/:jobId/confirm-rubric", async (request, reply) => {
  const job = database.getJob(request.params.jobId, request.userId); if (!job) return reply.code(404).send({ error: "岗位不存在" });
  job.rubricStatus = "confirmed"; job.updatedAt = new Date().toISOString(); database.saveJob(request.userId, job);
  database.audit({ ownerId: request.userId, action: "job.rubric_confirmed", resourceType: "job", resourceId: job.id, metadata: { rubricVersion: job.rubricVersion } });
  return { job };
});
app.post<{ Params: { jobId: string } }>("/api/v1/recruiter/jobs/:jobId/confirm-rubric", async (request, reply) => {
  const job = database.getJob(request.params.jobId, request.userId); if (!job) return reply.code(404).send({ error: "岗位不存在" });
  job.rubricStatus = "confirmed"; job.updatedAt = new Date().toISOString(); database.saveJob(request.userId, job);
  database.audit({ ownerId: request.userId, action: "job.rubric_confirmed", resourceType: "job", resourceId: job.id, metadata: { rubricVersion: job.rubricVersion } });
  return { job };
});

app.get("/api/recruiter/jobs", async (request) => ({ jobs: database.listJobs(request.userId) }));
app.get("/api/v1/recruiter/jobs", async (request) => ({ jobs: database.listJobs(request.userId) }));
app.get<{ Params: { jobId: string } }>("/api/recruiter/jobs/:jobId", async (request, reply) => {
  const job = database.getJob(request.params.jobId, request.userId); if (!job) return reply.code(404).send({ error: "岗位不存在" });
  return { job, resumes: database.listRecruiterResumes(job.id, request.userId), matches: database.getMatches(job.id, request.userId) };
});
app.get<{ Params: { jobId: string } }>("/api/v1/recruiter/jobs/:jobId", async (request, reply) => {
  const job = database.getJob(request.params.jobId, request.userId); if (!job) return reply.code(404).send({ error: "岗位不存在" });
  return { job, candidates: database.listRecruiterResumes(job.id, request.userId), results: database.getMatches(job.id, request.userId) };
});

async function handleRecruiterResumeUpload(request: any, reply: any) {
  const job = database.getJob(request.params.jobId, request.userId); if (!job) return reply.code(404).send({ error: "岗位不存在" });
  const files: RecruiterResume[] = [];
  for await (const part of request.files()) {
    if (part.type !== "file" || !allowedResume(part.filename)) continue;
    const buffer = await part.toBuffer();
    const text = await extractText(part.filename, buffer); if (!text || text.length > 100_000) continue;
    const profile = await analyzeResumeWorkflow(text);
    const resume = createRecruiterResume(job.id, part.filename, text); resume.profile = profile; resume.analysisStatus = "queued"; database.saveRecruiterResume(request.userId, resume); files.push(resume);
    await storeUpload({ ownerId: request.userId, purpose: "recruiter-resume", resourceId: resume.id, originalName: part.filename, mimeType: part.mimetype, buffer });
  }
  if (!files.length) return reply.code(400).send({ error: "没有读取到可解析的简历文件" });
  database.audit({ ownerId: request.userId, action: "job.candidates_uploaded", resourceType: "job", resourceId: job.id, metadata: { count: files.length } });
  return { resumes: files, count: files.length };
}
app.post("/api/recruiter/jobs/:jobId/resumes", handleRecruiterResumeUpload);
app.post("/api/v1/recruiter/jobs/:jobId/candidates", handleRecruiterResumeUpload);

app.post<{ Params: { jobId: string } }>("/api/v1/recruiter/jobs/:jobId/candidates/from-resume", async (request, reply) => {
  const job = database.getJob(request.params.jobId, request.userId);
  if (!job) return reply.code(404).send({ error: "岗位不存在" });
  const parsed = z.object({
    resumeId: z.string().trim().min(1).max(120),
    candidateUserId: z.string().trim().min(1).max(120),
    candidateName: z.string().trim().min(1).max(120),
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "候选人简历参数无效" });
  const source = database.getResume(parsed.data.resumeId, request.userId);
  if (!source) return reply.code(404).send({ error: "候选人上传的原始简历不存在" });
  const existing = database.listRecruiterResumes(job.id, request.userId).find((item) => item.sourceResumeId === source.id && item.candidateUserId === parsed.data.candidateUserId);
  if (existing) return { candidate: existing, reused: true };
  const candidate = createRecruiterResume(job.id, source.fileName, source.rawText);
  candidate.profile = source.profile;
  candidate.analysisStatus = "queued";
  candidate.sourceResumeId = source.id;
  candidate.candidateUserId = parsed.data.candidateUserId;
  candidate.candidateName = parsed.data.candidateName;
  database.saveRecruiterResume(request.userId, candidate);
  database.audit({ ownerId: request.userId, action: "job.candidate_linked", resourceType: "job", resourceId: job.id, metadata: { candidateId: candidate.id, sourceResumeId: source.id } });
  return reply.code(201).send({ candidate, reused: false });
});

async function handleRecruiterMatch(request: any, reply: any) {
  const job = database.getJob(request.params.jobId, request.userId); if (!job) return reply.code(404).send({ error: "岗位不存在" });
  if (job.rubricStatus !== "confirmed") return reply.code(409).send({ error: "请先确认岗位 Rubric，再启动批量匹配", code: "RUBRIC_NOT_CONFIRMED" });
  const resumes = database.listRecruiterResumes(job.id, request.userId); if (!resumes.length) return reply.code(400).send({ error: "请先上传至少一份简历" });
  const timestamp = new Date().toISOString();
  const task = { id: `task-${crypto.randomUUID().slice(0, 12)}`, ownerId: request.userId, kind: "recruiter-match", resourceId: job.id, status: "queued", progress: 0, total: resumes.length, stage: "等待启动", mode: "fallback", createdAt: timestamp, updatedAt: timestamp };
  database.saveTask(task); void runRecruiterTask(task.id, job, request.userId);
  database.audit({ ownerId: request.userId, action: "recruiter.match_started", resourceType: "job", resourceId: job.id, metadata: { taskId: task.id, candidates: resumes.length } });
  return reply.code(202).send({ taskId: task.id, status: task.status, task: { ...task, completed: task.progress } });
}
app.post("/api/recruiter/jobs/:jobId/match", handleRecruiterMatch);
app.post("/api/v1/recruiter/jobs/:jobId/match", handleRecruiterMatch);

app.get<{ Params: { taskId: string } }>("/api/recruiter/tasks/:taskId", async (request, reply) => {
  const task = database.getTask(request.params.taskId, request.userId); if (!task) return reply.code(404).send({ error: "分析任务不存在" });
  const matches = task.status === "completed" ? database.getMatches(task.resourceId, request.userId) : [];
  return { task: { ...task, completed: task.progress }, matches, top5: matches.slice(0, 5) };
});
app.get<{ Params: { taskId: string } }>("/api/v1/recruiter/tasks/:taskId", async (request, reply) => {
  const task = database.getTask(request.params.taskId, request.userId); if (!task) return reply.code(404).send({ error: "分析任务不存在" });
  const matches = task.status === "completed" ? database.getMatches(task.resourceId, request.userId) : [];
  return { task: { ...task, completed: task.progress }, results: matches, top5: matches.slice(0, 5) };
});

app.get<{ Params: { jobId: string } }>("/api/recruiter/jobs/:jobId/matches", async (request, reply) => {
  const job = database.getJob(request.params.jobId, request.userId); if (!job) return reply.code(404).send({ error: "岗位不存在" });
  return { matches: database.getMatches(job.id, request.userId) };
});
app.get<{ Params: { jobId: string } }>("/api/v1/recruiter/jobs/:jobId/results", async (request, reply) => {
  const job = database.getJob(request.params.jobId, request.userId); if (!job) return reply.code(404).send({ error: "岗位不存在" });
  return { results: database.getMatches(job.id, request.userId) };
});

// ---- Interview Routes ----

async function handleInterviewStart(request: any, reply: any) {
  const parsed = z.object({ profile: z.any(), pressure: z.number().int().min(1).max(5).default(3), interviewType: z.enum(["comprehensive", "project_deep_dive", "technical_fundamentals", "system_design"]).default("comprehensive"), targetRole: z.string().trim().min(1).max(160) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "面试配置无效" });
  const profile = { ...parsed.data.profile, targetRole: parsed.data.targetRole };
  const session = createGraphSession(profile, parsed.data.pressure, parsed.data.interviewType);
  session.state = "opening"; database.saveInterview(request.userId, session);
  const opening = await createInterviewOpening(request.userId, session);
  database.saveInterview(request.userId, session);
  database.saveGraphCheckpoint(request.userId, session);
  database.audit({ ownerId: request.userId, action: "interview.started", resourceType: "interview", resourceId: session.id, metadata: { pressure: session.pressure, interviewType: session.interviewType, targetRole: session.profile.targetRole } });
  return { ...serializeInterview(session), sessionId: session.id, question: session.currentQuestion, mode: session.modelMode, memoryRetrieved: opening.memoryRetrieved };
}

async function handleInterviewAnswer(request: any, reply: any) {
  const session = database.getInterview(request.params.id, request.userId); if (!session || session.result) return reply.code(404).send({ error: "面试不存在或已过期", expired: true });
  if (session.state === "paused" || (session as any).agentRuntime?.node === "human_review") return reply.code(409).send({ error: "本轮评价需要人工复核", needsHumanReview: true });
  const parsed = z.object({ answer: z.string().trim().min(1).max(4000) }).safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "回答不能为空且不能超过4000字" });
  const key = String(request.headers["idempotency-key"] || "").trim();
  if (request.url.startsWith("/api/v1/") && !key) return reply.code(400).send({ error: "回答接口必须提供 Idempotency-Key" });
  const requestHash = crypto.createHash("sha256").update(`${session.id}\n${parsed.data.answer}`).digest("hex");
  if (key) {
    const saved = database.getIdempotent(request.userId, key);
    if (saved && saved.requestHash !== requestHash) return reply.code(409).send({ error: "同一个 Idempotency-Key 不能用于不同回答" });
    if (saved) return reply.code(saved.statusCode).send(saved.response);
  }
  session.state = "evaluating"; database.saveInterview(request.userId, session);
  const outcome = await evaluateInterviewAnswer(request.userId, session, parsed.data.answer);
  const critic = sessionCritic(session, outcome.evaluation.missingEvidence);
  if (critic.shouldFinish && !outcome.needsHumanReview) {
    outcome.transition.action = "finish";
    outcome.transition.reason = `Session Critic: ${critic.reason}`;
    outcome.nextQuestion = undefined;
    session.currentQuestion = undefined;
    session.phase = "总结";
    session.state = "finishing";
    (session as any).agentRuntime.node = "finish";
  }
  const lastJudge = ((session as any).agentRuntime?.judgeRuns || []).at(-1);
  if (lastJudge?.aggregate?.needsHumanReview) {
    session.state = "paused";
    session.phase = "人工复核";
    (session as any).agentRuntime.node = "human_review";
    outcome.nextQuestion = undefined;
    outcome.needsHumanReview = true;
  }
  if (!outcome.needsHumanReview && outcome.transition.action !== "finish" && String(session.state) !== "asking") {
    session.state = "generating_next";
  }
  database.saveInterview(request.userId, session);
  enqueueMemory({ ownerId: request.userId, deviceNo: database.memoryDeviceNo(request.userId), sessionId: `interview:${session.id}`, groupId: `candidate:${request.userId}:interview:${session.id}`, groupName: "候选人面试长期记忆", commitId: `turn:${session.id}:${session.questionIndex}`, content: `面试问题：${outcome.evaluation.answeredQuestion}；候选人回答：${parsed.data.answer}；本轮能力：${outcome.evaluation.answeredSkill}；评分：${outcome.evaluation.score}；已覆盖：${outcome.evaluation.evidenceCovered.join("、") || "无"}；待补证据：${outcome.evaluation.missingEvidence.join("、") || "无"}` });
  void flushMemoryOutbox();
  database.saveGraphCheckpoint(request.userId, session);
  const response = { score: outcome.evaluation.score, feedback: outcome.evaluation.feedback, diagnosis: session.diagnoses.at(-1), shouldFinish: outcome.transition.action === "finish", needsHumanReview: outcome.needsHumanReview || false, evaluation: outcome.evaluation, phase: session.phase, question: session.currentQuestion, progress: session.questionIndex, topic: session.currentTopic, questionType: session.currentQuestionType, mappedSkill: session.currentMappedSkill, mode: session.modelMode, action: outcome.transition.action, relevance: outcome.evaluation.relevance, transcript: session.transcript, diagnoses: session.diagnoses, skillRoundCounts: session.skillRoundCounts, memoryRetrieved: outcome.memoryRetrieved, sessionCritic: critic, graph: serializeInterview(session).graph };
  if (key) database.saveIdempotent(request.userId, key, requestHash, response);
  database.audit({ ownerId: request.userId, action: "interview.answer_evaluated", resourceType: "interview", resourceId: session.id, metadata: { round: session.questionIndex, score: outcome.evaluation.score, action: outcome.transition.action, graphVersion: (session as any).agentRuntime?.graphVersion } });
  return response;
}

async function handleInterviewFinish(request: any, reply: any) {
  const session = database.getInterview(request.params.id, request.userId); if (!session) return reply.code(404).send({ error: "面试不存在或已过期", expired: true });
  if (session.growthReport) return { report: session.growthReport, transcript: session.transcript, profile: session.profile, diagnoses: session.diagnoses, memoryStatus: database.memoryStatus(`interview:${session.id}`, request.userId) };
  session.state = "finishing"; database.saveInterview(request.userId, session);
  const report = await createGrowthReport(session); session.growthReport = report; session.result = report.result; session.state = "completed"; session.phase = "总结"; database.saveInterview(request.userId, session); database.saveGraphCheckpoint(request.userId, session);
  const memoryFlush = await flushMemoryOutbox(20);
  const memoryPoll = await pollMemoryIngestJobs(20);
  const memoryStatus = database.memoryStatus(`interview:${session.id}`, request.userId);
  database.audit({ ownerId: request.userId, action: "interview.completed", resourceType: "interview", resourceId: session.id, metadata: { result: report.result, average: report.average } });
  return { report, transcript: session.transcript, profile: session.profile, diagnoses: session.diagnoses, memorySynced: memoryStatus.submitted > 0 && memoryStatus.pending === 0 && memoryStatus.failed === 0, memoryFlush, memoryPoll, memoryStatus };
}

app.get<{ Params: { id: string } }>("/api/interview/:id", async (request, reply) => { const session = database.getInterview(request.params.id, request.userId); if (!session || session.result) return reply.code(404).send({ error: "面试不存在或已结束", expired: true }); return serializeInterview(session); });
app.post<{ Params: { id: string } }>("/api/interview/:id/abandon", async (request) => { database.abandonInterview(request.params.id, request.userId); database.audit({ ownerId: request.userId, action: "interview.abandoned", resourceType: "interview", resourceId: request.params.id }); return { ok: true, abandoned: true }; });
app.post("/api/interview/start", handleInterviewStart);
app.post("/api/interview/:id/answer", handleInterviewAnswer);
app.post("/api/interview/:id/finish", handleInterviewFinish);
app.post<{ Params: { id: string } }>("/api/v1/interviews/:id/review", async (request, reply) => {
  const session = database.getInterview(request.params.id, request.userId);
  if (!session) return reply.code(404).send({ error: "面试不存在" });
  const parsed = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(500).optional() }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "复核决策无效" });
  const runtime = (session as any).agentRuntime;
  if (runtime?.node !== "human_review" && session.state !== "paused") return reply.code(409).send({ error: "当前没有待复核评价" });
  if (parsed.data.decision === "reject") {
    session.state = "failed"; session.phase = "复核终止"; runtime.node = "finished";
  } else {
    const skill = session.currentMappedSkill || session.diagnoses.at(-1)?.mappedSkill || "项目实现";
    session.currentQuestion = `请补充说明「${skill}」中尚未核验的机制、指标和异常边界。`;
    session.currentTopic = session.currentTopic || skill;
    session.currentMappedSkill = skill;
    session.currentQuestionType = "project_followup";
    session.state = "asking"; session.phase = "项目核验"; runtime.node = "wait_for_answer";
    const graphState = graphStateOf(session);
    if (graphState) { graphState.session.state = "asking"; graphState.trace.currentNode = "wait_for_answer"; graphState.nextAction = "ask"; attachGraphState(session, graphState); }
  }
  database.saveInterview(request.userId, session); database.saveGraphCheckpoint(request.userId, session);
  database.audit({ ownerId: request.userId, action: "interview.human_reviewed", resourceType: "interview", resourceId: session.id, metadata: parsed.data });
  return { ok: true, decision: parsed.data.decision, session: serializeInterview(session) };
});

app.post("/api/v1/interviews", handleInterviewStart);
app.get("/api/v1/interviews/history", async (request) => ({ interviews: database.listInterviews(request.userId).map(serializeInterview) }));
app.get<{ Params: { id: string } }>("/api/v1/interviews/:id", async (request, reply) => { const session = database.getInterview(request.params.id, request.userId); return session ? serializeInterview(session) : reply.code(404).send({ error: "面试不存在" }); });
app.post("/api/v1/interviews/:id/answers", handleInterviewAnswer);
app.post("/api/v1/interviews/:id/finish", handleInterviewFinish);
app.post<{ Params: { id: string } }>("/api/v1/interviews/:id/abandon", async (request, reply) => { const session = database.getInterview(request.params.id, request.userId); if (!session) return reply.code(404).send({ error: "面试不存在" }); database.abandonInterview(request.params.id, request.userId); return { ok: true }; });
app.get<{ Params: { id: string } }>("/api/v1/interviews/:id/report", async (request, reply) => { const session = database.getInterview(request.params.id, request.userId); return session?.growthReport ? { report: session.growthReport } : reply.code(404).send({ error: "报告尚未生成" }); });
app.get<{ Params: { id: string } }>("/api/v1/interviews/:id/checkpoints", async (request, reply) => { const session = database.getInterview(request.params.id, request.userId); if (!session) return reply.code(404).send({ error: "面试不存在" }); return { checkpoints: database.listGraphCheckpoints(request.params.id, request.userId).map((x) => ({ id: x.id, node: x.node, traceId: x.traceId, createdAt: x.createdAt })) }; });
app.get<{ Params: { id: string } }>("/api/v1/interviews/:id/checkpoints/latest", async (request, reply) => { const session = database.getInterview(request.params.id, request.userId); if (!session) return reply.code(404).send({ error: "面试不存在" }); const checkpoint = database.listGraphCheckpoints(request.params.id, request.userId)[0]; if (!checkpoint) return reply.code(404).send({ error: "尚无图检查点" }); return { checkpoint: { id: checkpoint.id, node: checkpoint.node, traceId: checkpoint.traceId, createdAt: checkpoint.createdAt, state: checkpoint.state, graphState: checkpoint.graphState } }; });
app.get<{ Params: { id: string; checkpointId: string } }>("/api/v1/interviews/:id/checkpoints/:checkpointId", async (request, reply) => {
  const session = database.getInterview(request.params.id, request.userId); if (!session) return reply.code(404).send({ error: "面试不存在" });
  const checkpoint = database.listGraphCheckpoints(request.params.id, request.userId).find((x) => x.id === request.params.checkpointId);
  return checkpoint ? { checkpoint } : reply.code(404).send({ error: "检查点不存在" });
});
app.post<{ Params: { id: string; checkpointId: string } }>("/api/v1/interviews/:id/replay/:checkpointId", async (request, reply) => {
  const session = database.getInterview(request.params.id, request.userId); if (!session) return reply.code(404).send({ error: "面试不存在" });
  const checkpoint = database.listGraphCheckpoints(request.params.id, request.userId).find((x) => x.id === request.params.checkpointId);
  if (!checkpoint?.graphState) return reply.code(404).send({ error: "检查点没有可回放的 Graph State" });
  const result = await new ExecutableGraph<any>(interviewGraph, (cp) => database.saveGraphCheckpoint(request.userId, cp.state.session, cp.state)).resume({ id: checkpoint.id, graphVersion: interviewGraph.version, node: checkpoint.node, state: checkpoint.graphState, traceId: checkpoint.traceId, createdAt: checkpoint.createdAt });
  attachGraphState(session, result.state); database.saveInterview(request.userId, session);
  return { status: result.status, node: result.node, traceId: result.traceId, graph: serializeInterview(session).graph };
});
app.post<{ Params: { id: string; checkpointId: string } }>("/api/v1/interviews/:id/fork/:checkpointId", async (request, reply) => {
  const session = database.getInterview(request.params.id, request.userId); if (!session) return reply.code(404).send({ error: "面试不存在" });
  const checkpoint = database.listGraphCheckpoints(request.params.id, request.userId).find((x) => x.id === request.params.checkpointId);
  if (!checkpoint?.graphState) return reply.code(404).send({ error: "检查点没有可分叉的 Graph State" });
  const cloned: any = structuredClone(checkpoint.graphState); const fork = cloned.session as InterviewSession; fork.id = crypto.randomUUID(); fork.state = "paused"; fork.result = undefined; fork.growthReport = undefined; fork.questionIndex = Math.max(0, fork.questionIndex); cloned.ownerId = request.userId; cloned.trace.traceId = crypto.randomUUID(); cloned.trace.nodeHistory = cloned.trace.nodeHistory || []; cloned.trace.nodeHistory.push({ node: "fork", enteredAt: new Date().toISOString() });
  attachGraphState(fork, cloned); database.saveInterview(request.userId, fork); database.saveGraphCheckpoint(request.userId, fork, cloned);
  return { sessionId: fork.id, checkpointId: checkpoint.id, session: serializeInterview(fork) };
});
app.post<{ Params: { id: string } }>("/api/v1/interviews/:id/pause", async (request, reply) => {
  const session = database.getInterview(request.params.id, request.userId); if (!session) return reply.code(404).send({ error: "面试不存在" }); session.state = "paused"; session.phase = "已暂停"; const state = graphStateOf(session); if (state) { state.session.state = "paused"; state.trace.currentNode = "paused"; attachGraphState(session, state); } database.saveInterview(request.userId, session); database.saveGraphCheckpoint(request.userId, session); return { ok: true, session: serializeInterview(session) };
});
app.post<{ Params: { id: string } }>("/api/v1/interviews/:id/resume", async (request, reply) => {
  const session = database.getInterview(request.params.id, request.userId); if (!session) return reply.code(404).send({ error: "面试不存在" }); if (session.result) return reply.code(409).send({ error: "面试已结束" }); session.state = "asking"; session.phase = "项目核验"; const state = graphStateOf(session); if (state) { state.session.state = "asking"; state.trace.currentNode = "wait_for_answer"; attachGraphState(session, state); } database.saveInterview(request.userId, session); database.saveGraphCheckpoint(request.userId, session); return { ok: true, session: serializeInterview(session) };
});

app.get("/api/v1/me", async (request) => ({ id: request.userId, displayName: request.displayName }));
app.get("/api/v1/me/export", async (request) => database.exportOwnerData(request.userId));

app.setErrorHandler((error, _request, reply) => { const failure = error as Error & { statusCode?: number }; app.log.error(failure); reply.code(failure.statusCode && failure.statusCode < 500 ? failure.statusCode : 500).send({ error: failure.statusCode && failure.statusCode < 500 ? failure.message : "服务暂时不可用，请稍后重试" }); });

// Seed admin user after server starts (if configured)
void flushMemoryOutbox(20).then(() => pollMemoryIngestJobs(20));
setInterval(() => { void flushMemoryOutbox(20).then(() => pollMemoryIngestJobs(20)); }, config.memory.pollMs).unref();

app.listen({ port: config.port, host: config.host }).then(async () => {
  console.log(`OfferPilot V2: http://${config.host}:${config.port}`);
  if (config.adminUserPassword && config.requireAuth) {
    const bcrypt = await import("bcrypt");
    const adminExists = database.db.prepare("SELECT id FROM users WHERE id=?").get(config.adminUserId) as { id?: string } | undefined;
    if (!adminExists) {
      const hashed = bcrypt.hashSync(config.adminUserPassword, 12);
      database.db.prepare("INSERT INTO users(id, display_name, email, password_hash, created_at) VALUES(?,?,?,?,?)")
        .run(config.adminUserId, "管理员", `${config.adminUserId}@internal`, hashed, new Date().toISOString());
      database.db.prepare("INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,?,?)")
        .run("local-org", config.adminUserId, "owner", new Date().toISOString());
      app.log.info({ adminId: config.adminUserId }, "admin user seeded successfully");
    }
  }
});
