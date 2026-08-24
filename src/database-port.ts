import crypto from "node:crypto";
import type { Pool } from "pg";
import { database as sqliteDatabase } from "./database.js";
import type { InterviewSession } from "./types.js";

export type IdempotentRecord = { requestHash: string; response: unknown; statusCode: number };

export interface InterviewPersistencePort {
  ensureOwner(ownerId: string): void | Promise<void>;
  getInterview(id: string, ownerId: string): InterviewSession | undefined | Promise<InterviewSession | undefined>;
  saveInterview(ownerId: string, session: InterviewSession): void | Promise<void>;
  saveGraphCheckpoint(ownerId: string, session: InterviewSession): void | Promise<void>;
  audit(input: { ownerId: string; action: string; resourceType: string; resourceId: string; metadata?: unknown }): void | Promise<void>;
  getIdempotent(ownerId: string, key: string): IdempotentRecord | undefined | Promise<IdempotentRecord | undefined>;
  saveIdempotent(ownerId: string, key: string, requestHash: string, response: unknown, statusCode?: number): void | Promise<void>;
}

export class SqliteInterviewPersistence implements InterviewPersistencePort {
  ensureOwner(ownerId: string) { sqliteDatabase.ensureOwner(ownerId); }
  getInterview(id: string, ownerId: string) { return sqliteDatabase.getInterview(id, ownerId); }
  saveInterview(ownerId: string, session: InterviewSession) { sqliteDatabase.saveInterview(ownerId, session); }
  saveGraphCheckpoint(ownerId: string, session: InterviewSession) { sqliteDatabase.saveGraphCheckpoint(ownerId, session); }
  audit(input: Parameters<InterviewPersistencePort["audit"]>[0]) { sqliteDatabase.audit(input); }
  getIdempotent(ownerId: string, key: string) { return sqliteDatabase.getIdempotent(ownerId, key); }
  saveIdempotent(ownerId: string, key: string, requestHash: string, response: unknown, statusCode = 200) { sqliteDatabase.saveIdempotent(ownerId, key, requestHash, response, statusCode); }
}

function json(value: unknown) { return JSON.stringify(value); }
function parse<T>(value: unknown): T { return JSON.parse(String(value)) as T; }

/** Async PostgreSQL persistence for the interview/session slice. Other domains
 * remain behind their own adapters until the canary proves parity. */
export class PostgresInterviewPersistence implements InterviewPersistencePort {
  constructor(private readonly pool: Pool) {}

  async ensureOwner(ownerId: string) {
    await this.pool.query("INSERT INTO users(id,display_name,created_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO NOTHING", [ownerId, "本地用户"]);
  }

  async getInterview(id: string, ownerId: string) {
    const result = await this.pool.query<{ state_json: unknown }>("SELECT state_json FROM interview_sessions WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL", [id, ownerId]);
    const row = result.rows[0];
    return row ? parse<InterviewSession>(row.state_json) : undefined;
  }

  async saveInterview(ownerId: string, session: InterviewSession) {
    await this.ensureOwner(ownerId);
    await this.pool.query(
      "INSERT INTO interview_sessions(id,owner_id,status,state_json,graph_state_json,created_at,updated_at) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,COALESCE((SELECT created_at FROM interview_sessions WHERE id=$1),NOW()),NOW()) ON CONFLICT(id) DO UPDATE SET status=excluded.status,state_json=excluded.state_json,graph_state_json=excluded.graph_state_json,updated_at=NOW(),deleted_at=NULL",
      [session.id, ownerId, session.result ? "finished" : session.state, json(session), json((session as any)._graphState || null)],
    );
  }

  async saveGraphCheckpoint(ownerId: string, session: InterviewSession) {
    await this.ensureOwner(ownerId);
    const runtime = (session as any).agentRuntime || {};
    const graphState = (session as any)._graphState || null;
    const id = crypto.randomUUID();
    await this.pool.query(
      "INSERT INTO graph_checkpoints(id,session_id,owner_id,thread_id,checkpoint_id,node,trace_id,state_json,graph_state_json,created_at) VALUES($1,$2,$3,$2,$1,$4,$5,$6::jsonb,$7::jsonb,NOW()) ON CONFLICT DO NOTHING",
      [id, session.id, ownerId, runtime.node || "created", runtime.traceId || id, json(session), json(graphState)],
    );
  }

  async audit(input: { ownerId: string; action: string; resourceType: string; resourceId: string; metadata?: unknown }) {
    await this.pool.query("INSERT INTO audit_logs(id,owner_id,action,resource_type,resource_id,metadata_json,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,NOW())", [crypto.randomUUID(), input.ownerId, input.action, input.resourceType, input.resourceId, json(input.metadata ?? null)]);
  }

  async getIdempotent(ownerId: string, key: string) {
    const result = await this.pool.query<{ request_hash: string; response_json: unknown; status_code: number }>("SELECT request_hash,response_json,status_code FROM idempotency_keys WHERE owner_id=$1 AND idempotency_key=$2", [ownerId, key]);
    const row = result.rows[0];
    return row ? { requestHash: row.request_hash, response: typeof row.response_json === "string" ? parse(row.response_json) : row.response_json, statusCode: row.status_code } : undefined;
  }

  async saveIdempotent(ownerId: string, key: string, requestHash: string, response: unknown, statusCode = 200) {
    await this.pool.query("INSERT INTO idempotency_keys(owner_id,idempotency_key,request_hash,response_json,status_code,created_at) VALUES($1,$2,$3,$4::jsonb,$5,NOW()) ON CONFLICT(owner_id,idempotency_key) DO NOTHING", [ownerId, key, requestHash, json(response), statusCode]);
  }
}
