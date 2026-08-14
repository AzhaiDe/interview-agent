import crypto from "node:crypto";
import { z, type ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { config } from "./config.js";
import { database } from "./database.js";

export type ModelTier = "fast" | "standard" | "reasoning";
export type ModelResult<T> = { data: T; mode: "model"; model: string; latencyMs: number; requestId?: string; inputTokens: number; outputTokens: number };

function extractJson(text: string): unknown {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回 JSON 对象");
  return JSON.parse(clean.slice(start, end + 1));
}

export class ModelGateway {
  available() { return config.model.enabled && Boolean(config.model.apiKey); }

  async structured<T>(input: {
    task: string;
    promptVersion: string;
    tier?: ModelTier;
    system: string;
    user: string;
    schema: ZodType<T>;
    temperature?: number;
    traceId?: string;
  }): Promise<ModelResult<T>> {
    if (!this.available()) throw new Error("模型服务未配置：请设置 BAILIAN_API_KEY 或 DASHSCOPE_API_KEY");
    const primaryModel = input.tier === "reasoning" ? config.model.reasoning : input.tier === "standard" ? config.model.standard : config.model.fast;
    let usedModel = primaryModel;
    const runId = crypto.randomUUID();
    const started = Date.now();
    let retryCount = 0;
    let lastError: unknown;
    let requestId: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;
    let lastText: string | undefined;
    const jsonSchema = zodToJsonSchema(input.schema, "response");
    let messages = [{ role: "system", content: `${input.system}\n输出必须严格匹配以下 JSON Schema，不得改名、遗漏必填字段或增加包装层：\n${JSON.stringify(jsonSchema)}` }, { role: "user", content: input.user }];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        usedModel = attempt === 0 ? primaryModel : config.model.fast;
        const response = await fetch(`${config.model.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${config.model.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: usedModel, messages, temperature: input.temperature ?? 0.15, enable_thinking: false, response_format: { type: "json_object" } }),
          signal: AbortSignal.timeout(config.model.timeoutMs),
        });
        const body = await response.json() as any;
        requestId = response.headers.get("x-request-id") || body?.request_id || body?.id || requestId;
        inputTokens += Number(body?.usage?.prompt_tokens || body?.usage?.input_tokens || 0);
        outputTokens += Number(body?.usage?.completion_tokens || body?.usage?.output_tokens || 0);
        if (!response.ok) throw new Error(body?.error?.message || `百炼请求失败 HTTP ${response.status}`);
        const text = body?.choices?.[0]?.message?.content;
        if (typeof text !== "string") throw new Error("百炼响应缺少 message.content");
        lastText = text;
        const data = input.schema.parse(extractJson(text));
        const latencyMs = Date.now() - started;
        database.recordModelRun({ id: runId, task: input.task, model: retryCount ? `${primaryModel}->${usedModel}` : usedModel, promptVersion: input.promptVersion, latencyMs, schemaValid: true, retryCount, traceId: input.traceId, requestId, inputTokens, outputTokens });
        return { data, mode: "model", model: usedModel, latencyMs, requestId, inputTokens, outputTokens };
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          retryCount++;
          messages = [...messages, ...(lastText ? [{ role: "assistant", content: lastText }] : []), { role: "user", content: `上一次输出未通过 JSON Schema 校验。依据上面的完整 Schema 修复原输出，只重新输出合法 JSON，不要解释。错误：${error instanceof z.ZodError ? error.issues.map((x) => `${x.path.join(".")}:${x.message}`).join("；") : String(error)}` }];
        }
      }
    }
    const latencyMs = Date.now() - started;
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    const errorCode = lastError instanceof z.ZodError ? "SCHEMA_INVALID" : /timeout|aborted/i.test(errorMessage) ? "TIMEOUT" : /HTTP|请求失败/.test(errorMessage) ? "UPSTREAM_HTTP" : "MODEL_ERROR";
    database.recordModelRun({ id: runId, task: input.task, model: retryCount ? `${primaryModel}->${usedModel}` : usedModel, promptVersion: input.promptVersion, latencyMs, schemaValid: false, retryCount, traceId: input.traceId, requestId, inputTokens, outputTokens, fallbackUsed: true, errorCode, error: errorMessage });
    throw lastError;
  }
}

export const modelGateway = new ModelGateway();
