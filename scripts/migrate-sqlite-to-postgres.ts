import BetterSqlite3 from "better-sqlite3";
import { Pool } from "pg";
import path from "node:path";

const sqlitePath = process.env.SQLITE_DATABASE_PATH || path.resolve(process.cwd(), "data-v2/offerpilot.sqlite");
const postgresUrl = process.env.DATABASE_URL || "";
if (!postgresUrl) throw new Error("DATABASE_URL/POSTGRES_URL is required");

const tables = [
  "users", "organizations", "organization_members", "resumes", "jobs", "interview_sessions",
  "recruiter_resumes", "recruiter_matches", "tasks", "memory_outbox", "model_runs", "uploaded_files",
  "resume_analysis_versions", "resume_experiences", "resume_evidence_claims", "job_rubric_versions",
  "interview_questions", "interview_answers", "interview_evaluations", "interview_reports",
  "graph_checkpoints", "memory_ingest_jobs", "audit_logs", "idempotency_keys",
];
const booleanColumns = new Set(["is_active", "schema_valid", "fallback_used"]);
const jsonColumns = new Set(["profile_json", "state_json", "graph_state_json", "resume_json", "matches_json", "result_json", "analysis_json", "experience_json", "evidence_json", "rubric_json", "evaluation_json", "report_json", "metadata_json", "response_json"]);
function jsonValue(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") return JSON.parse(parsed);
    return parsed;
  } catch {
    return {};
  }
}
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

const sqlite = new BetterSqlite3(sqlitePath, { readonly: true });
const pool = new Pool({ connectionString: postgresUrl, max: 2 });
const client = await pool.connect();
let copied = 0;
try {
  await client.query("BEGIN");
  for (const table of tables) {
    const targetColumnsResult = await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table]);
    const targetColumns = targetColumnsResult.rows.map((row) => row.column_name);
    if (!targetColumns.length) continue;
    const sourceColumns = (sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string }>).map((row) => row.name);
    if (!sourceColumns.length) continue;
    const columns = targetColumns.filter((column) => sourceColumns.includes(column));
    if (table === "graph_checkpoints") {
      for (const required of ["thread_id", "checkpoint_id"]) if (!columns.includes(required)) columns.push(required);
    }
    const rows = sqlite.prepare(`SELECT ${sourceColumns.map(quote).join(",")} FROM ${quote(table)}`).all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const values = columns.map((column) => {
        let value = row[column];
        if (table === "graph_checkpoints" && column === "thread_id") value = row.session_id || row.id;
        if (table === "graph_checkpoints" && column === "checkpoint_id") value = row.id;
        if (value === undefined) return null;
        if (booleanColumns.has(column)) return Boolean(Number(value));
        if (jsonColumns.has(column) && typeof value === "string") return JSON.stringify(jsonValue(value));
        return value;
      });
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
      await client.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
      copied++;
    }
    console.log(`${table}: ${rows.length} source rows`);
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ sqlitePath, copied }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
  sqlite.close();
}
