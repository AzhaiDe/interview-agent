import fs from "node:fs/promises";
import path from "node:path";
import { createPostgresPool } from "../src/postgres.js";

const pool = createPostgresPool();
const version = "001_initial";
try {
  const sql = await fs.readFile(path.resolve(process.cwd(), "db/postgres/001_initial.sql"), "utf8");
  await pool.query("BEGIN");
  await pool.query(sql);
  await pool.query("INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT(version) DO NOTHING", [version]);
  await pool.query("COMMIT");
  console.log(`PostgreSQL migration applied: ${version}`);
} catch (error) {
  await pool.query("ROLLBACK").catch(() => undefined);
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
