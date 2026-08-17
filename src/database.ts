import BetterSqlite3 from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { InterviewSession, JobProfile, MatchResult, RecruiterResume, ResumeProfile } from "./types.js";

type TaskRecord = {
  id: string;
  ownerId: string;
  kind: string;
  resourceId: string;
  status: string;
  progress: number;
  total: number;
  stage: string;
  mode: string;
  error?: string;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
};

export function now() { return new Date().toISOString(); }
function json(value: unknown) { return JSON.stringify(value); }
function parse<T>(value: unknown): T { return JSON.parse(String(value)) as T; }

export class AppDatabase {
  readonly db: BetterSqlite3.Database;

  constructor(filename = config.databasePath) {
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new BetterSqlite3(filename);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at TEXT NOT NULL,
        memory_device_no TEXT
      );
      CREATE TABLE IF NOT EXISTS resumes (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, file_name TEXT NOT NULL,
        raw_text TEXT NOT NULL, profile_json TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(owner_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, status TEXT NOT NULL,
        state_json TEXT NOT NULL, graph_state_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY(owner_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY(owner_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS recruiter_resumes (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, job_id TEXT NOT NULL,
        resume_json TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(owner_id) REFERENCES users(id), FOREIGN KEY(job_id) REFERENCES jobs(id)
      );
      CREATE TABLE IF NOT EXISTS recruiter_matches (
        job_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, matches_json TEXT NOT NULL,
        updated_at TEXT NOT NULL, FOREIGN KEY(job_id) REFERENCES jobs(id)
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL,
        resource_id TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL,
        total INTEGER NOT NULL, stage TEXT NOT NULL, mode TEXT NOT NULL,
        error TEXT, result_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_outbox (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, device_no TEXT NOT NULL,
        session_id TEXT NOT NULL, group_id TEXT NOT NULL, group_name TEXT NOT NULL,
        commit_id TEXT NOT NULL UNIQUE, content TEXT NOT NULL, status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, job_id TEXT, error TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS model_runs (
        id TEXT PRIMARY KEY, task TEXT NOT NULL, model TEXT NOT NULL,
        prompt_version TEXT NOT NULL, latency_ms INTEGER NOT NULL,
        schema_valid INTEGER NOT NULL, retry_count INTEGER NOT NULL,
        error TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, purpose TEXT NOT NULL,
        resource_id TEXT NOT NULL, original_name TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL, FOREIGN KEY(owner_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS organization_members (
        organization_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY(organization_id,user_id),
        FOREIGN KEY(organization_id) REFERENCES organizations(id), FOREIGN KEY(user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS resume_analysis_versions (
        id TEXT PRIMARY KEY, resume_id TEXT NOT NULL, version_no INTEGER NOT NULL,
        prompt_version TEXT NOT NULL, mode TEXT NOT NULL, analysis_json TEXT NOT NULL,
        created_at TEXT NOT NULL, UNIQUE(resume_id,version_no), FOREIGN KEY(resume_id) REFERENCES resumes(id)
      );
      CREATE TABLE IF NOT EXISTS resume_experiences (
        id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, experience_index INTEGER NOT NULL,
        experience_json TEXT NOT NULL, FOREIGN KEY(analysis_id) REFERENCES resume_analysis_versions(id)
      );
      CREATE TABLE IF NOT EXISTS resume_evidence_claims (
        id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, experience_id TEXT, claim TEXT NOT NULL,
        status TEXT NOT NULL, confidence REAL NOT NULL, evidence_json TEXT NOT NULL,
        FOREIGN KEY(analysis_id) REFERENCES resume_analysis_versions(id)
      );
      CREATE TABLE IF NOT EXISTS job_rubric_versions (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, version_no INTEGER NOT NULL,
        status TEXT NOT NULL, rubric_json TEXT NOT NULL, confirmed_at TEXT,
        created_at TEXT NOT NULL, UNIQUE(job_id,version_no), FOREIGN KEY(job_id) REFERENCES jobs(id)
      );
      CREATE TABLE IF NOT EXISTS interview_questions (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, round_no INTEGER NOT NULL,
        text TEXT NOT NULL, topic TEXT, mapped_skill TEXT, question_type TEXT, depth INTEGER,
        created_at TEXT NOT NULL, UNIQUE(session_id,round_no), FOREIGN KEY(session_id) REFERENCES interview_sessions(id)
      );
      CREATE TABLE IF NOT EXISTS interview_answers (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, round_no INTEGER NOT NULL,
        question_id TEXT, answer_text TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(session_id,round_no), FOREIGN KEY(session_id) REFERENCES interview_sessions(id)
      );
      CREATE TABLE IF NOT EXISTS interview_evaluations (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, round_no INTEGER NOT NULL,
        evaluation_json TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(session_id,round_no), FOREIGN KEY(session_id) REFERENCES interview_sessions(id)
      );
      CREATE TABLE IF NOT EXISTS interview_reports (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, version_no INTEGER NOT NULL,
        report_json TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(session_id,version_no), FOREIGN KEY(session_id) REFERENCES interview_sessions(id)
      );
      CREATE TABLE IF NOT EXISTS graph_checkpoints (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, owner_id TEXT NOT NULL,
        node TEXT NOT NULL, trace_id TEXT NOT NULL, state_json TEXT NOT NULL, graph_state_json TEXT,
        created_at TEXT NOT NULL, FOREIGN KEY(session_id) REFERENCES interview_sessions(id),
        FOREIGN KEY(owner_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS candidate_job_analyses (
        id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, job_id TEXT NOT NULL,
        analysis_json TEXT NOT NULL, model_mode TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS candidate_match_results (
        id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, job_id TEXT NOT NULL,
        rank INTEGER NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(job_id,candidate_id)
      );
      CREATE TABLE IF NOT EXISTS memory_ingest_jobs (
        job_id TEXT PRIMARY KEY, outbox_id TEXT NOT NULL, status TEXT NOT NULL,
        last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, action TEXT NOT NULL,
        resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, metadata_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        owner_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
        response_json TEXT NOT NULL, status_code INTEGER NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY(owner_id,idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_interviews_owner ON interview_sessions(owner_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_recruiter_job ON recruiter_resumes(job_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_resource ON tasks(resource_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_outbox_status ON memory_outbox(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_uploaded_resource ON uploaded_files(owner_id, purpose, resource_id);
    `);
    this.migrateUsers();
  }

  private migrateUsers() {
    // Seed local user
    this.db.prepare("INSERT OR IGNORE INTO users(id, display_name, created_at) VALUES(?,?,?)")
      .run(config.localUserId, "本地用户", now());
    this.db.prepare("INSERT OR IGNORE INTO organizations(id,name,created_at) VALUES(?,?,?)").run("local-org", "本地组织", now());
    this.db.prepare("INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,?,?)").run("local-org", config.localUserId, "owner", now());

    // Schema migrations — all wrapped individually for resilience
    const migrations = [
      () => this.addColumn("resumes", "deleted_at", "TEXT"),
      () => this.addColumn("interview_sessions", "deleted_at", "TEXT"),
      () => this.addColumn("jobs", "deleted_at", "TEXT"),
      () => this.addColumn("uploaded_files", "deleted_at", "TEXT"),
      () => this.addColumn("uploaded_files", "expires_at", "TEXT"),
      () => this.addColumn("jobs", "organization_id", "TEXT NOT NULL DEFAULT 'local-org'"),
      () => this.addColumn("recruiter_resumes", "organization_id", "TEXT NOT NULL DEFAULT 'local-org'"),
      () => this.addColumn("recruiter_matches", "organization_id", "TEXT NOT NULL DEFAULT 'local-org'"),
      () => this.addColumn("model_runs", "trace_id", "TEXT"),
      () => this.addColumn("model_runs", "request_id", "TEXT"),
      () => this.addColumn("model_runs", "input_tokens", "INTEGER NOT NULL DEFAULT 0"),
      () => this.addColumn("model_runs", "output_tokens", "INTEGER NOT NULL DEFAULT 0"),
      () => this.addColumn("model_runs", "fallback_used", "INTEGER NOT NULL DEFAULT 0"),
      () => this.addColumn("model_runs", "error_code", "TEXT"),
      () => this.addColumn("interview_sessions", "graph_state_json", "TEXT"),
      () => this.addColumn("graph_checkpoints", "graph_state_json", "TEXT"),
      // Auth migration: add password-based login support to users table
      // Note: SQLite cannot ADD COLUMN with UNIQUE constraint on non-empty tables.
      // We use TEXT without UNIQUE (uniqueness enforced at query layer).
      () => this.addColumn("users", "email", "TEXT"),
      () => this.addColumn("users", "password_hash", "TEXT NOT NULL DEFAULT ''"),
      () => this.addColumn("users", "is_active", "INTEGER NOT NULL DEFAULT 1"),
      () => this.addColumn("users", "memory_device_no", "TEXT"),
      () => {
        // Create unique index if the column exists and index does not yet exist
        try { this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)"); } catch { /* skip */ }
      },
      () => {
        try { this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_memory_device_no ON users(memory_device_no) WHERE memory_device_no IS NOT NULL"); } catch { /* skip */ }
      },
    ];
    for (const m of migrations) {
      try { m(); } catch (_err) { /* schema may differ across deployments — skip */ }
    }
    const usersWithoutDevice = this.db.prepare("SELECT id FROM users WHERE memory_device_no IS NULL OR memory_device_no='' ").all() as { id: string }[];
    const assignDevice = this.db.prepare("UPDATE users SET memory_device_no=? WHERE id=? AND (memory_device_no IS NULL OR memory_device_no='')");
    for (const user of usersWithoutDevice) assignDevice.run(`user-device-${crypto.randomUUID()}`, user.id);
    // Pending local events may have been queued by an older build. Rebind
    // them before submission so one user never emits under two device IDs.
    this.db.exec("UPDATE memory_outbox SET device_no=(SELECT memory_device_no FROM users WHERE users.id=memory_outbox.owner_id) WHERE owner_id IN (SELECT id FROM users) AND status IN ('pending','retry')");
  }

  private addColumn(table: string, column: string, definition: string) {
    try {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!columns.some((item) => item.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (_err) {
      // Column may already exist or schema incompatible — skip silently
    }
  }

  saveResume(id: string, ownerId: string, fileName: string, rawText: string, profile: ResumeProfile) {
    this.db.prepare("INSERT INTO resumes(id,owner_id,file_name,raw_text,profile_json,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET file_name=excluded.file_name,raw_text=excluded.raw_text,profile_json=excluded.profile_json,deleted_at=NULL")
      .run(id, ownerId, fileName, rawText, json(profile), now());
    const versionNo = Number((this.db.prepare("SELECT COALESCE(MAX(version_no),0)+1 value FROM resume_analysis_versions WHERE resume_id=?").get(id) as any).value);
    const analysisId = crypto.randomUUID();
    this.db.prepare("INSERT INTO resume_analysis_versions(id,resume_id,version_no,prompt_version,mode,analysis_json,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(analysisId, id, versionNo, profile.analysisVersion || "deterministic-v1", profile.analysisMode || "fallback", json(profile), now());
    const upsertExperience = this.db.prepare(
      "INSERT INTO resume_experiences(id,analysis_id,experience_index,experience_json) VALUES(?,?,?,?) " +
      "ON CONFLICT(id) DO UPDATE SET analysis_id=excluded.analysis_id, experience_index=excluded.experience_index, experience_json=excluded.experience_json"
    );
    profile.experiences.forEach((experience, index) => upsertExperience.run(experience.id || `${analysisId}:exp:${index}`, analysisId, index, json(experience)));
    const upsertClaim = this.db.prepare(
      "INSERT INTO resume_evidence_claims(id,analysis_id,experience_id,claim,status,confidence,evidence_json) VALUES(?,?,?,?,?,?,?) " +
      "ON CONFLICT(id) DO UPDATE SET analysis_id=excluded.analysis_id, experience_id=excluded.experience_id, claim=excluded.claim, status=excluded.status, confidence=excluded.confidence, evidence_json=excluded.evidence_json"
    );
    (profile.evidenceClaims || []).forEach((claim) => upsertClaim.run(claim.id, analysisId, claim.experienceId || null, claim.claim, claim.status, claim.confidence, json(claim.evidence)));
  }

  getResume(id: string, ownerId: string): { id: string; fileName: string; rawText: string; profile: ResumeProfile; createdAt: string } | undefined {
    const row = this.db.prepare("SELECT * FROM resumes WHERE id=? AND owner_id=? AND deleted_at IS NULL").get(id, ownerId) as any;
    return row ? { id: row.id, fileName: row.file_name, rawText: row.raw_text, profile: parse(row.profile_json), createdAt: row.created_at } : undefined;
  }

  listResumes(ownerId: string) {
    return (this.db.prepare("SELECT id,file_name,profile_json,created_at FROM resumes WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at DESC").all(ownerId) as any[])
      .map((row) => ({ id: row.id, fileName: row.file_name, profile: parse<ResumeProfile>(row.profile_json), createdAt: row.created_at }));
  }

  softDeleteResume(id: string, ownerId: string) { return this.db.prepare("UPDATE resumes SET deleted_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL").run(now(), id, ownerId).changes > 0; }

  saveInterview(ownerId: string, session: InterviewSession) {
    const status = session.result ? "completed" : "active";
    const graphState = (session as any)._graphState;
    this.db.prepare("INSERT INTO interview_sessions(id,owner_id,status,state_json,graph_state_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,state_json=excluded.state_json,graph_state_json=excluded.graph_state_json,updated_at=excluded.updated_at")
      .run(session.id, ownerId, status, json(session), graphState ? json(graphState) : null, now(), now());
    const interviewerTurns = session.transcript.filter((turn) => turn.role === "interviewer");
    const candidateTurns = session.transcript.filter((turn) => turn.role === "candidate");
    const insertQuestion = this.db.prepare("INSERT OR IGNORE INTO interview_questions(id,session_id,round_no,text,topic,mapped_skill,question_type,depth,created_at) VALUES(?,?,?,?,?,?,?,?,?)");
    interviewerTurns.forEach((turn, index) => { const diagnosis = session.diagnoses[index]; insertQuestion.run(`${session.id}:q:${index + 1}`, session.id, index + 1, turn.text, diagnosis?.topic || session.currentTopic || null, diagnosis?.mappedSkill || session.currentMappedSkill || null, diagnosis?.questionType || session.currentQuestionType || null, index + 1, now()); });
    const insertAnswer = this.db.prepare("INSERT OR IGNORE INTO interview_answers(id,session_id,round_no,question_id,answer_text,created_at) VALUES(?,?,?,?,?,?)");
    candidateTurns.forEach((turn, index) => insertAnswer.run(`${session.id}:a:${index + 1}`, session.id, index + 1, `${session.id}:q:${index + 1}`, turn.text, now()));
    const insertEvaluation = this.db.prepare("INSERT OR REPLACE INTO interview_evaluations(id,session_id,round_no,evaluation_json,created_at) VALUES(?,?,?,?,?)");
    session.diagnoses.forEach((diagnosis, index) => insertEvaluation.run(`${session.id}:e:${index + 1}`, session.id, index + 1, json(diagnosis), now()));
    if (session.growthReport) this.db.prepare("INSERT OR IGNORE INTO interview_reports(id,session_id,version_no,report_json,created_at) VALUES(?,?,?,?,?)").run(`${session.id}:report:1`, session.id, 1, json(session.growthReport), now());
  }

  /** Ensure programmatic/runtime callers can persist with a non-HTTP owner. */
  ensureOwner(ownerId: string) {
    this.db.prepare("INSERT OR IGNORE INTO users(id, display_name, created_at) VALUES(?,?,?)").run(ownerId, ownerId, now());
    this.db.prepare("INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,?,?)").run("local-org", ownerId, "member", now());
  }

  /** Stable opaque OmniMemory identity assigned once per application user. */
  memoryDeviceNo(userId: string): string {
    const row = this.db.prepare("SELECT memory_device_no FROM users WHERE id=?").get(userId) as { memory_device_no?: string } | undefined;
    if (row?.memory_device_no) return row.memory_device_no;
    this.ensureOwner(userId);
    const generated = `user-device-${crypto.randomUUID()}`;
    this.db.prepare("UPDATE users SET memory_device_no=? WHERE id=? AND (memory_device_no IS NULL OR memory_device_no='')").run(generated, userId);
    const assigned = this.db.prepare("SELECT memory_device_no FROM users WHERE id=?").get(userId) as { memory_device_no?: string } | undefined;
    return assigned?.memory_device_no || generated;
  }

  saveGraphCheckpoint(ownerId: string, session: InterviewSession, graphState?: unknown) {
    const runtime = (session as any).agentRuntime || {};
    const durableGraphState = graphState ?? (session as any)._graphState;
    this.db.prepare("INSERT INTO graph_checkpoints(id,session_id,owner_id,node,trace_id,state_json,graph_state_json,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(`${session.id}:checkpoint:${crypto.randomUUID()}`, session.id, ownerId, String(runtime.node || session.state || "unknown"), String(runtime.traceId || "unknown"), json(session), durableGraphState ? json(durableGraphState) : null, now());
  }

  listGraphCheckpoints(id: string, ownerId: string) {
    return (this.db.prepare("SELECT id,node,trace_id,state_json,graph_state_json,created_at FROM graph_checkpoints WHERE session_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 20").all(id, ownerId) as any[])
      .map((row) => ({ id: row.id, node: row.node, traceId: row.trace_id, state: parse<InterviewSession>(row.state_json), graphState: row.graph_state_json ? parse(row.graph_state_json) : undefined, createdAt: row.created_at }));
  }

  getInterview(id: string, ownerId: string): InterviewSession | undefined {
    const row = this.db.prepare("SELECT state_json,graph_state_json FROM interview_sessions WHERE id=? AND owner_id=?").get(id, ownerId) as any;
    if (!row) return undefined;
    const session = parse<InterviewSession>(row.state_json);
    // New rows store the graph state alongside the session. For rows written
    // during the migration window, recover from the newest durable checkpoint
    // before falling back to a cold graph build in the runtime.
    const graphStateJson = row.graph_state_json || (this.db.prepare("SELECT graph_state_json FROM graph_checkpoints WHERE session_id=? AND owner_id=? AND graph_state_json IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(id, ownerId) as any)?.graph_state_json;
    if (graphStateJson) Object.defineProperty(session, "_graphState", { value: parse(graphStateJson), writable: true, enumerable: false, configurable: true });
    return session;
  }

  listInterviews(ownerId: string): InterviewSession[] {
    return (this.db.prepare("SELECT state_json,graph_state_json FROM interview_sessions WHERE owner_id=? AND deleted_at IS NULL ORDER BY updated_at DESC").all(ownerId) as any[]).map((row) => {
      const session = parse<InterviewSession>(row.state_json);
      if (row.graph_state_json) Object.defineProperty(session, "_graphState", { value: parse(row.graph_state_json), writable: true, enumerable: false, configurable: true });
      return session;
    });
  }

  abandonInterview(id: string, ownerId: string) {
    const session = this.getInterview(id, ownerId); if (session) { session.state = "abandoned"; this.db.prepare("UPDATE interview_sessions SET status='abandoned',state_json=?,updated_at=? WHERE id=? AND owner_id=?").run(json(session), now(), id, ownerId); }
  }

  saveJob(ownerId: string, job: JobProfile) {
    this.db.prepare("INSERT INTO jobs(id,owner_id,profile_json,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET profile_json=excluded.profile_json,updated_at=excluded.updated_at")
      .run(job.id, ownerId, json(job), job.createdAt, job.updatedAt);
    const version = job.rubricVersion || 1;
    this.db.prepare("INSERT INTO job_rubric_versions(id,job_id,version_no,status,rubric_json,confirmed_at,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(job_id,version_no) DO UPDATE SET status=excluded.status,rubric_json=excluded.rubric_json,confirmed_at=excluded.confirmed_at")
      .run(`${job.id}:rubric:${version}`, job.id, version, job.rubricStatus || "draft", json({ mustHave: job.mustHave, niceToHave: job.niceToHave, responsibilities: job.responsibilities, competencies: job.competencies, rubric: job.rubric, depthExpectations: job.depthExpectations, interviewQuestions: job.interviewQuestions }), job.rubricStatus === "confirmed" ? now() : null, now());
  }

  getJob(id: string, ownerId: string): JobProfile | undefined {
    const row = this.db.prepare("SELECT profile_json FROM jobs WHERE id=? AND owner_id=?").get(id, ownerId) as any;
    return row ? parse<JobProfile>(row.profile_json) : undefined;
  }

  listJobs(ownerId: string): JobProfile[] {
    return (this.db.prepare("SELECT profile_json FROM jobs WHERE owner_id=? AND deleted_at IS NULL ORDER BY updated_at DESC").all(ownerId) as any[]).map((row) => parse(row.profile_json));
  }

  saveRecruiterResume(ownerId: string, resume: RecruiterResume) {
    this.db.prepare("INSERT INTO recruiter_resumes(id,owner_id,job_id,resume_json,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET resume_json=excluded.resume_json")
      .run(resume.id, ownerId, resume.jobId, json(resume), resume.createdAt);
    if (resume.analysis) this.db.prepare("INSERT INTO candidate_job_analyses(id,candidate_id,job_id,analysis_json,model_mode,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET analysis_json=excluded.analysis_json,model_mode=excluded.model_mode")
      .run(`${resume.jobId}:${resume.id}:analysis`, resume.id, resume.jobId, json(resume.analysis), resume.analysis.agentMode || "fallback", now());
  }

  listRecruiterResumes(jobId: string, ownerId: string): RecruiterResume[] {
    return (this.db.prepare("SELECT resume_json FROM recruiter_resumes WHERE job_id=? AND owner_id=? ORDER BY created_at").all(jobId, ownerId) as any[]).map((row) => parse(row.resume_json));
  }

  saveMatches(jobId: string, ownerId: string, matches: MatchResult[]) {
    this.db.prepare("INSERT INTO recruiter_matches(job_id,owner_id,matches_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET matches_json=excluded.matches_json,updated_at=excluded.updated_at")
      .run(jobId, ownerId, json(matches), now());
    const insert = this.db.prepare("INSERT INTO candidate_match_results(id,candidate_id,job_id,rank,result_json,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(job_id,candidate_id) DO UPDATE SET rank=excluded.rank,result_json=excluded.result_json");
    matches.forEach((match) => insert.run(`${jobId}:${match.id}:match`, match.id, jobId, match.rank, json(match), now()));
  }

  getMatches(jobId: string, ownerId: string): MatchResult[] {
    const row = this.db.prepare("SELECT matches_json FROM recruiter_matches WHERE job_id=? AND owner_id=?").get(jobId, ownerId) as any;
    return row ? parse<MatchResult[]>(row.matches_json) : [];
  }

  saveTask(task: TaskRecord) {
    this.db.prepare("INSERT INTO tasks(id,owner_id,kind,resource_id,status,progress,total,stage,mode,error,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,progress=excluded.progress,total=excluded.total,stage=excluded.stage,mode=excluded.mode,error=excluded.error,result_json=excluded.result_json,updated_at=excluded.updated_at")
      .run(task.id, task.ownerId, task.kind, task.resourceId, task.status, task.progress, task.total, task.stage, task.mode, task.error ?? null, task.result === undefined ? null : json(task.result), task.createdAt, task.updatedAt);
  }

  getTask(id: string, ownerId: string): TaskRecord | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id=? AND owner_id=?").get(id, ownerId) as any;
    if (!row) return undefined;
    return { id: row.id, ownerId: row.owner_id, kind: row.kind, resourceId: row.resource_id, status: row.status, progress: row.progress, total: row.total, stage: row.stage, mode: row.mode, error: row.error ?? undefined, result: row.result_json ? parse(row.result_json) : undefined, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  interruptedTasks(ownerId: string): TaskRecord[] {
    return (this.db.prepare("SELECT id FROM tasks WHERE owner_id=? AND status IN ('queued','analyzing','matching') ORDER BY created_at").all(ownerId) as any[])
      .map((row) => this.getTask(row.id, ownerId)).filter((task): task is TaskRecord => Boolean(task));
  }

  enqueueMemory(event: { id: string; ownerId: string; deviceNo: string; sessionId: string; groupId: string; groupName: string; commitId: string; content: string }) {
    const timestamp = now();
    this.db.prepare("INSERT OR IGNORE INTO memory_outbox(id,owner_id,device_no,session_id,group_id,group_name,commit_id,content,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(event.id, event.ownerId, event.deviceNo, event.sessionId, event.groupId, event.groupName, event.commitId, event.content, "pending", timestamp, timestamp);
  }

  pendingMemory(limit = 20): any[] {
    return this.db.prepare("SELECT * FROM memory_outbox WHERE status IN ('pending','retry') AND attempts < 5 ORDER BY created_at LIMIT ?").all(limit) as any[];
  }

  submittedMemory(limit = 20): any[] {
    return this.db.prepare("SELECT * FROM memory_outbox WHERE status='submitted' AND job_id IS NOT NULL ORDER BY updated_at LIMIT ?").all(limit) as any[];
  }

  updateMemory(id: string, patch: { status: string; jobId?: string; error?: string }) {
    this.db.prepare("UPDATE memory_outbox SET status=?,job_id=COALESCE(?,job_id),error=?,attempts=attempts+1,updated_at=? WHERE id=?")
      .run(patch.status, patch.jobId ?? null, patch.error ?? null, now(), id);
    if (patch.jobId) this.db.prepare("INSERT INTO memory_ingest_jobs(job_id,outbox_id,status,last_error,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET status=excluded.status,last_error=excluded.last_error,updated_at=excluded.updated_at")
      .run(patch.jobId, id, patch.status, patch.error ?? null, now(), now());
  }

  updateMemoryJob(jobId: string, status: string, error?: string) { this.db.prepare("UPDATE memory_ingest_jobs SET status=?,last_error=?,updated_at=? WHERE job_id=?").run(status, error ?? null, now(), jobId); }

  failMemoryAttempt(id: string, error: string) {
    this.db.prepare("UPDATE memory_outbox SET status=CASE WHEN attempts+1>=5 THEN 'dead_letter' ELSE 'retry' END,error=?,attempts=attempts+1,updated_at=? WHERE id=?")
      .run(error, now(), id);
  }

  memoryStatus(sessionId: string, ownerId: string): { total: number; submitted: number; pending: number; failed: number } {
    const row = this.db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status IN ('submitted','succeeded') THEN 1 ELSE 0 END) submitted, SUM(CASE WHEN status IN ('pending','retry','submitted') THEN 1 ELSE 0 END) pending, SUM(CASE WHEN status IN ('failed','dead_letter') OR attempts>=5 THEN 1 ELSE 0 END) failed FROM memory_outbox WHERE session_id=? AND owner_id=?")
      .get(sessionId, ownerId) as any;
    return { total: Number(row?.total || 0), submitted: Number(row?.submitted || 0), pending: Number(row?.pending || 0), failed: Number(row?.failed || 0) };
  }

  recordModelRun(run: { id: string; task: string; model: string; promptVersion: string; latencyMs: number; schemaValid: boolean; retryCount: number; traceId?: string; requestId?: string; inputTokens?: number; outputTokens?: number; fallbackUsed?: boolean; errorCode?: string; error?: string }) {
    this.db.prepare("INSERT INTO model_runs(id,task,model,prompt_version,latency_ms,schema_valid,retry_count,error,created_at,trace_id,request_id,input_tokens,output_tokens,fallback_used,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(run.id, run.task, run.model, run.promptVersion, run.latencyMs, run.schemaValid ? 1 : 0, run.retryCount, run.error ?? null, now(), run.traceId ?? null, run.requestId ?? null, run.inputTokens ?? 0, run.outputTokens ?? 0, run.fallbackUsed ? 1 : 0, run.errorCode ?? null);
  }

  recordUploadedFile(file: { id: string; ownerId: string; purpose: string; resourceId: string; originalName: string; storageKey: string; mimeType: string; sizeBytes: number; sha256: string }) {
    this.db.prepare("INSERT OR IGNORE INTO uploaded_files(id,owner_id,purpose,resource_id,original_name,storage_key,mime_type,size_bytes,sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(file.id, file.ownerId, file.purpose, file.resourceId, file.originalName, file.storageKey, file.mimeType, file.sizeBytes, file.sha256, now());
  }

  uploadedFilesForResource(ownerId: string, resourceId: string): { id: string; storageKey: string }[] {
    return (this.db.prepare("SELECT id,storage_key FROM uploaded_files WHERE owner_id=? AND resource_id=? AND deleted_at IS NULL").all(ownerId, resourceId) as any[]).map((row) => ({ id: row.id, storageKey: row.storage_key }));
  }

  uploadedFileForResource(ownerId: string, resourceId: string): { id: string; storageKey: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: string } | undefined {
    const row = this.db.prepare("SELECT id,storage_key,original_name,mime_type,size_bytes,created_at FROM uploaded_files WHERE owner_id=? AND resource_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1").get(ownerId, resourceId) as any;
    return row ? {
      id: row.id,
      storageKey: row.storage_key,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      createdAt: row.created_at,
    } : undefined;
  }

  markUploadedFileDeleted(id: string) { this.db.prepare("UPDATE uploaded_files SET deleted_at=? WHERE id=?").run(now(), id); }

  audit(input: { ownerId: string; action: string; resourceType: string; resourceId: string; metadata?: unknown }) {
    this.db.prepare("INSERT INTO audit_logs(id,owner_id,action,resource_type,resource_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), input.ownerId, input.action, input.resourceType, input.resourceId, input.metadata === undefined ? null : json(input.metadata), now());
  }

  getIdempotent(ownerId: string, key: string): { requestHash: string; response: unknown; statusCode: number } | undefined {
    const row = this.db.prepare("SELECT * FROM idempotency_keys WHERE owner_id=? AND idempotency_key=?").get(ownerId, key) as any;
    return row ? { requestHash: row.request_hash, response: parse(row.response_json), statusCode: row.status_code } : undefined;
  }

  saveIdempotent(ownerId: string, key: string, requestHash: string, response: unknown, statusCode = 200) {
    this.db.prepare("INSERT OR IGNORE INTO idempotency_keys(owner_id,idempotency_key,request_hash,response_json,status_code,created_at) VALUES(?,?,?,?,?,?)")
      .run(ownerId, key, requestHash, json(response), statusCode, now());
  }

  exportOwnerData(ownerId: string) {
    return {
      user: this.db.prepare("SELECT id,display_name,created_at FROM users WHERE id=?").get(ownerId),
      resumes: this.db.prepare("SELECT id,file_name,profile_json,created_at,deleted_at FROM resumes WHERE owner_id=?").all(ownerId),
      interviews: this.db.prepare("SELECT id,status,state_json,created_at,updated_at,deleted_at FROM interview_sessions WHERE owner_id=?").all(ownerId),
      jobs: this.db.prepare("SELECT id,profile_json,created_at,updated_at,deleted_at FROM jobs WHERE owner_id=?").all(ownerId),
      recruiterResumes: this.db.prepare("SELECT id,job_id,resume_json,created_at FROM recruiter_resumes WHERE owner_id=?").all(ownerId),
      auditLogs: this.db.prepare("SELECT action,resource_type,resource_id,metadata_json,created_at FROM audit_logs WHERE owner_id=? ORDER BY created_at").all(ownerId),
    };
  }

  close() { this.db.close(); }
}

export const database = new AppDatabase();
