import crypto from "node:crypto";
import { config } from "./config.js";
import type { GraphEngine } from "./runtime-flags.js";

export type RolloutDecision = { engine: GraphEngine; bucket: number; reason: string };

function percentEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
}

export function rolloutDecision(sessionId: string): RolloutDecision {
  const bucket = crypto.createHash("sha256").update(sessionId).digest().readUInt32BE(0) % 100;
  if (config.graphEngine === "legacy") return { engine: "legacy", bucket, reason: "legacy-default" };
  if (config.graphEngine === "shadow") return { engine: "shadow", bucket, reason: "shadow-configured" };
  const canary = percentEnv("LANGGRAPH_CANARY_PERCENT", 0);
  return bucket < canary ? { engine: "langgraph", bucket, reason: `canary-${canary}%` } : { engine: "legacy", bucket, reason: `canary-excluded-${canary}%` };
}
