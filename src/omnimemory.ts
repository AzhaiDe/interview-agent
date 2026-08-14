import crypto from "node:crypto";
import { config } from "./config.js";
import { database } from "./database.js";
import { redactSensitive } from "./pii.js";

export type Evidence = { id?: string; event_id?: string; source?: "memory" | "pending_message" | string; text: string; group_id?: string | null; timestamp?: string | null };

export class OmniMemoryClient {
  constructor(private readonly options: { fetchImpl?: typeof fetch; apiKey?: string; baseUrl?: string; enabled?: boolean } = {}) {}
  private get apiKey() { return this.options.apiKey ?? config.memory.apiKey; }
  private get baseUrl() { return (this.options.baseUrl ?? config.memory.baseUrl).replace(/\/$/, ""); }
  available() { return (this.options.enabled ?? config.memory.enabled) && Boolean(this.apiKey); }

  private async request<T>(path: string, init: RequestInit, deviceNo?: string): Promise<T> {
    if (!this.available()) throw new Error("OmniMemory API 未配置");
    const response = await (this.options.fetchImpl ?? fetch)(`${this.baseUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", ...(deviceNo ? { "x-device-no": deviceNo } : {}) },
      signal: AbortSignal.timeout(config.memory.timeoutMs),
    });
    const envelope = await response.json() as any;
    if (!response.ok || envelope?.success === false) throw new Error(envelope?.message || `OmniMemory HTTP ${response.status}`);
    if (envelope?.data === undefined) throw new Error("OmniMemory 响应缺少 data");
    return envelope.data as T;
  }

  async search(input: { query: string; deviceNo: string; groupId: string; topK?: number }): Promise<Evidence[]> {
    if (!this.available()) return [];
    const data = await this.request<{ evidence_details: Evidence[] }>("/memory/retrieval/hybrid", {
      method: "POST",
      body: JSON.stringify({ query: input.query, top_k: input.topK ?? 5, group_id: input.groupId, client_meta: { device_no: input.deviceNo } }),
    }, input.deviceNo);
    const seen = new Set<string>();
    return (data.evidence_details || []).filter((x) => !x.group_id || x.group_id === input.groupId).map((x) => ({ ...x, text: redactSensitive(x.text, 500) })).filter((x) => { const key = x.event_id || x.id || x.text; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, Math.min(5, input.topK ?? 5));
  }

  async ingest(input: { turns: { role: "user" | "assistant" | "system"; content: string; turn_id?: string; timestamp?: string }[]; deviceNo: string; sessionId: string; groupId: string; groupName: string; commitId: string }) {
    return this.request<{ job_id: string; status: string }>("/memory/ingest", {
      method: "POST",
      // OmniMemory's current production implementation stores session_id as
      // the returned evidence group even when group_id is also present. Keeping
      // both equal preserves strict retrieval isolation across API versions.
      body: JSON.stringify({ turns: input.turns.map((x) => ({ ...x, content: redactSensitive(x.content, 1600) })), session_id: input.groupId, group_id: input.groupId, group_name: input.groupName, commit_id: input.commitId, client_meta: { device_no: input.deviceNo } }),
    }, input.deviceNo);
  }

  async getIngestJob(jobId: string) {
    return this.request<{ job_id?: string; id?: string; status: string }>(`/memory/ingest/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
  }
}

export const omniMemory = new OmniMemoryClient();

export function enqueueMemory(input: { ownerId: string; deviceNo: string; sessionId: string; groupId: string; groupName: string; commitId: string; content: string }) {
  if (!config.memory.writeEnabled) return;
  database.enqueueMemory({ id: crypto.randomUUID(), ...input, content: redactSensitive(input.content, 1600) });
}

export async function flushMemoryOutbox(limit = 10): Promise<{ processed: number; failed: number }> {
  if (!omniMemory.available()) return { processed: 0, failed: 0 };
  let processed = 0, failed = 0;
  for (const event of database.pendingMemory(limit)) {
    try {
      const result = await omniMemory.ingest({ turns: [{ role: "assistant", content: event.content, turn_id: event.id, timestamp: event.created_at }], deviceNo: event.device_no, sessionId: event.session_id, groupId: event.group_id, groupName: event.group_name, commitId: event.commit_id });
      database.updateMemory(event.id, { status: "submitted", jobId: result.job_id });
      processed++;
    } catch (error) {
      database.failMemoryAttempt(event.id, error instanceof Error ? error.message : String(error));
      failed++;
    }
  }
  return { processed, failed };
}

export async function pollMemoryIngestJobs(limit = 20): Promise<{ succeeded: number; pending: number; failed: number }> {
  if (!omniMemory.available()) return { succeeded: 0, pending: 0, failed: 0 };
  let succeeded = 0, pending = 0, failed = 0;
  for (const event of database.submittedMemory(limit)) {
    try {
      const job = await omniMemory.getIngestJob(event.job_id);
      const status = job.status.toLowerCase();
      if (["succeeded", "success", "completed", "done"].includes(status)) { database.updateMemory(event.id, { status: "succeeded" }); database.updateMemoryJob(event.job_id, "succeeded"); succeeded++; }
      else if (["failed", "error", "cancelled", "canceled"].includes(status)) { database.failMemoryAttempt(event.id, `OmniMemory ingest job ${status}`); database.updateMemoryJob(event.job_id, "failed", status); failed++; }
      else { database.updateMemoryJob(event.job_id, status); pending++; }
    } catch (error) {
      database.failMemoryAttempt(event.id, error instanceof Error ? error.message : String(error));
      failed++;
    }
  }
  return { succeeded, pending, failed };
}
