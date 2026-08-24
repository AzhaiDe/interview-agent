import { createPostgresPool, postgresHealth } from "../src/postgres.js";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { config } from "../src/config.js";

if (!config.postgresUrl) throw new Error("DATABASE_URL/POSTGRES_URL is required");
const pool = createPostgresPool();
try {
  console.log(await postgresHealth(pool));
  const saver = new PostgresSaver(pool);
  await saver.setup();
  console.log("PostgresSaver setup completed");
} finally {
  await pool.end();
}
