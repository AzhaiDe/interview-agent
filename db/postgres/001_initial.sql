CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, memory_device_no TEXT UNIQUE, email TEXT UNIQUE, password_hash TEXT NOT NULL DEFAULT '', is_active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS resumes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), file_name TEXT NOT NULL, raw_text TEXT NOT NULL, profile_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS interview_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, state_json JSONB NOT NULL, graph_state_json JSONB, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), organization_id TEXT NOT NULL DEFAULT 'local-org', profile_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS recruiter_resumes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), organization_id TEXT NOT NULL DEFAULT 'local-org', job_id TEXT NOT NULL REFERENCES jobs(id), resume_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS recruiter_matches (job_id TEXT PRIMARY KEY REFERENCES jobs(id), owner_id TEXT NOT NULL REFERENCES users(id), organization_id TEXT NOT NULL DEFAULT 'local-org', matches_json JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL, resource_id TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL, total INTEGER NOT NULL, stage TEXT NOT NULL, mode TEXT NOT NULL, error TEXT, result_json JSONB, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS memory_outbox (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, device_no TEXT NOT NULL, session_id TEXT NOT NULL, group_id TEXT NOT NULL, group_name TEXT NOT NULL, commit_id TEXT NOT NULL UNIQUE, content TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, job_id TEXT, error TEXT, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS model_runs (id TEXT PRIMARY KEY, task TEXT NOT NULL, model TEXT NOT NULL, prompt_version TEXT NOT NULL, latency_ms INTEGER NOT NULL, schema_valid BOOLEAN NOT NULL, retry_count INTEGER NOT NULL, error TEXT, created_at TIMESTAMPTZ NOT NULL, trace_id TEXT, request_id TEXT, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, fallback_used BOOLEAN NOT NULL DEFAULT FALSE, error_code TEXT);
CREATE TABLE IF NOT EXISTS uploaded_files (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), purpose TEXT NOT NULL, resource_id TEXT NOT NULL, original_name TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL, sha256 TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ, expires_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS organization_members (organization_id TEXT NOT NULL REFERENCES organizations(id), user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(organization_id,user_id));
CREATE TABLE IF NOT EXISTS resume_analysis_versions (id TEXT PRIMARY KEY, resume_id TEXT NOT NULL REFERENCES resumes(id), version_no INTEGER NOT NULL, prompt_version TEXT NOT NULL, mode TEXT NOT NULL, analysis_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, UNIQUE(resume_id,version_no));
CREATE TABLE IF NOT EXISTS resume_experiences (id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL REFERENCES resume_analysis_versions(id), experience_index INTEGER NOT NULL, experience_json JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS resume_evidence_claims (id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL REFERENCES resume_analysis_versions(id), experience_id TEXT, claim TEXT NOT NULL, status TEXT NOT NULL, confidence DOUBLE PRECISION NOT NULL, evidence_json JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS job_rubric_versions (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), version_no INTEGER NOT NULL, status TEXT NOT NULL, rubric_json JSONB NOT NULL, confirmed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL, UNIQUE(job_id,version_no));
CREATE TABLE IF NOT EXISTS interview_questions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES interview_sessions(id), round_no INTEGER NOT NULL, text TEXT NOT NULL, topic TEXT, mapped_skill TEXT, question_type TEXT, depth INTEGER, created_at TIMESTAMPTZ NOT NULL, UNIQUE(session_id,round_no));
CREATE TABLE IF NOT EXISTS interview_answers (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES interview_sessions(id), round_no INTEGER NOT NULL, question_id TEXT, answer_text TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, UNIQUE(session_id,round_no));
CREATE TABLE IF NOT EXISTS interview_evaluations (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES interview_sessions(id), round_no INTEGER NOT NULL, evaluation_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, UNIQUE(session_id,round_no));
CREATE TABLE IF NOT EXISTS interview_reports (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES interview_sessions(id), version_no INTEGER NOT NULL, report_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, UNIQUE(session_id,version_no));
CREATE TABLE IF NOT EXISTS graph_checkpoints (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES interview_sessions(id), owner_id TEXT NOT NULL REFERENCES users(id), thread_id TEXT NOT NULL, checkpoint_id TEXT NOT NULL, node TEXT NOT NULL, trace_id TEXT NOT NULL, state_json JSONB NOT NULL, graph_state_json JSONB, created_at TIMESTAMPTZ NOT NULL, UNIQUE(thread_id,checkpoint_id));
CREATE TABLE IF NOT EXISTS memory_ingest_jobs (job_id TEXT PRIMARY KEY, outbox_id TEXT NOT NULL, status TEXT NOT NULL, last_error TEXT, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, metadata_json JSONB, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency_keys (owner_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, response_json JSONB NOT NULL, status_code INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(owner_id,idempotency_key));

CREATE INDEX IF NOT EXISTS idx_interviews_owner ON interview_sessions(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_resource ON tasks(resource_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON memory_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_uploaded_resource ON uploaded_files(owner_id, purpose, resource_id);
