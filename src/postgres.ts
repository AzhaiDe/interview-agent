import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { config } from "./config.js";

export function postgresConfig(): PoolConfig {
  if (!config.postgresUrl) throw new Error("DATABASE_URL/POSTGRES_URL is required for PostgreSQL");
  return { connectionString: config.postgresUrl, max: Math.max(2, config.workerConcurrency * 2), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 };
}

export function createPostgresPool() { return new Pool(postgresConfig()); }

export async function postgresHealth(pool: Pool) {
  const result = await pool.query<{ now: string }>("SELECT NOW()::text AS now");
  return { ok: true, serverTime: result.rows[0]?.now || null };
}

export async function query<T extends QueryResultRow = QueryResultRow>(pool: Pool, text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  return pool.query<T>(text, values);
}
