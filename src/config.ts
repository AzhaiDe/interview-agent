import fs from "node:fs";
import path from "node:path";

// Lightweight .env loader that respects pre-set env vars (important for
// eval/test runners that disable services via process.env before import).
function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Never override vars that were set before config loads.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

function intEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  env: process.env.NODE_ENV || "development",
  port: intEnv("PORT", 4310),
  host: process.env.HOST || "0.0.0.0",
  publicDemo: process.env.PUBLIC_DEMO === "true",
  dataDir: path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data-v2")),
  databasePath: path.resolve(process.env.DATABASE_PATH || path.join(process.cwd(), "data-v2", "offerpilot.sqlite")),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "data-v2", "uploads")),
  ocr: { enabled: process.env.OCR_ENABLED !== "false", languages: process.env.OCR_LANGUAGES || "chi_sim+eng", maxPages: intEnv("OCR_MAX_PAGES", 8) },
  localUserId: process.env.LOCAL_USER_ID || "local-user",
  requireAuth: process.env.REQUIRE_AUTH !== "false",
  adminUserId: process.env.ADMIN_USER_ID || "admin",
  adminUserPassword: process.env.ADMIN_USER_PASSWORD || "",
  workerConcurrency: Math.max(1, Math.min(8, intEnv("WORKER_CONCURRENCY", 3))),
  model: {
    get enabled() { return process.env.MODEL_ENABLED !== "false"; },
    get apiKey() { return process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY || ""; },
    get baseUrl() { return (process.env.BAILIAN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, ""); },
    get fast() { return process.env.MODEL_FAST || "qwen3.7-plus"; },
    get standard() { return process.env.MODEL_STANDARD || "qwen3.7-plus"; },
    get reasoning() { return process.env.MODEL_REASONING || "qwen3.7-plus"; },
    get timeoutMs() { return intEnv("MODEL_TIMEOUT_MS", 45_000); },
  },
  memory: {
    get enabled() { return process.env.OMNIMEMORY_ENABLED !== "false"; },
    get writeEnabled() { return process.env.OMNIMEMORY_WRITE_ENABLED !== "false"; },
    get apiKey() { return process.env.OMNIMEMORY_API_KEY || ""; },
    get baseUrl() { return (process.env.OMNIMEMORY_API_BASE_URL || "https://api.omnimemory.cn/api/v2").replace(/\/$/, ""); },
    get timeoutMs() { return intEnv("OMNIMEMORY_TIMEOUT_MS", 12_000); },
    get pollMs() { return Math.max(5_000, intEnv("OMNIMEMORY_POLL_MS", 15_000)); },
  },
} as const;

export function runtimeCapabilities() {
  return {
    model: config.model.enabled && Boolean(config.model.apiKey),
    omnimemory: config.memory.enabled && Boolean(config.memory.apiKey),
    database: "sqlite",
    storage: "local",
  };
}
