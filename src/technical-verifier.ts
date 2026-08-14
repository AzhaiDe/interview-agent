/**
 * Technical Verifier
 *
 * Verifies candidate claims against the knowledge base.
 *
 * Two modes:
 * 1. Model-based verification (primary) — uses reasoning model + Zod schema
 * 2. Token-overlap verification (fallback) — deterministic, fast
 *
 * Aligned with PRD §6.8 (Technical Verifier) and architecture §3.1.
 */

import { z } from "zod";
import type { ModelGateway } from "./model-gateway.js";

// ---- Public types (PRD §6.8) ----

export type VerifierFact = {
  entityId: string;
  statement: string;
  sourceIds: string[];
  confidence: number;
};

export type ClaimVerdict =
  | "supported"
  | "partially_supported"
  | "incorrect"
  | "context_dependent"
  | "not_verifiable";

export type ClaimVerification = {
  claim: string;
  verdict: ClaimVerdict;
  matchedFactIds: string[];
  citationIds: string[];
  misconception?: string;
  confidence: number;
};

// ---- Model extraction schema ----

const modelVerdictSchema = z.object({
  verdict: z.enum([
    "supported",
    "partially_supported",
    "incorrect",
    "context_dependent",
    "not_verifiable",
  ]),
  matchedEntityIds: z.array(z.string()).max(8),
  citationSourceIds: z.array(z.string()).max(12),
  misconception: z.string().max(300).optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(400).optional(),
});

const modelBatchVerdictSchema = z.object({
  verdicts: z
    .array(
      z.object({
        claimIndex: z.number().int().min(0),
        verdict: modelVerdictSchema,
      })
    )
    .max(24),
});

// ---- Token-based fallback (kept for offline / no-model mode) ----

function tokens(text: string): string[] {
  const normalized = text.toLowerCase();
  const words = normalized.match(/[a-z0-9]{2,}/g) || [];
  const cjk = [...normalized].filter((char) => /[㐀-鿿]/u.test(char));
  const grams = cjk.flatMap((_, index, chars) =>
    index < chars.length - 1 ? [chars[index] + chars[index + 1]] : []
  );
  return new Set(
    [...words, ...grams].filter(
      (token) => !/^(请问|什么|如何|为什么|以及|一个|这个|那个|可以|能够|他们|我们|你们|自己)$/.test(token)
    )
  ) as unknown as string[];
}

function tokenSet(text: string): Set<string> {
  return new Set(tokens(text));
}

export function verifyClaimsFallback(
  answer: string,
  facts: VerifierFact[]
): ClaimVerification[] {
  const claims = answer
    .split(/[。！？\n；;]/)
    .map((claim) => claim.trim())
    .filter((claim) => claim.length >= 8)
    .slice(0, 12);

  return claims.map((claim) => {
    const claimTokens = tokenSet(claim);
    const matches = facts
      .map((fact) => {
        const factTokens = tokenSet(fact.statement);
        const overlap = [...claimTokens].filter((token) => factTokens.has(token)).length;
        return { fact, overlap: overlap / Math.max(1, claimTokens.size) };
      })
      .filter((item) => item.overlap >= 0.35)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3);

    if (!matches.length) {
      return {
        claim,
        verdict: "not_verifiable",
        matchedFactIds: [],
        citationIds: [],
        confidence: 0.2,
      };
    }

    const confidence = Math.min(
      0.95,
      Math.max(...matches.map((item) => item.fact.confidence)) * matches[0].overlap
    );

    return {
      claim,
      verdict: confidence >= 0.45 ? "supported" : "not_verifiable",
      matchedFactIds: matches.map((item) => item.fact.entityId),
      citationIds: [...new Set(matches.flatMap((item) => item.fact.sourceIds))],
      confidence: Number(confidence.toFixed(3)),
    };
  });
}

// ---- Model-based verification (primary path) ----

export async function verifyClaimsWithModel(
  answer: string,
  facts: VerifierFact[],
  options: {
    modelGateway: ModelGateway;
    traceId: string;
    skill?: string;
    project?: string;
    onModelCall?: (info: { model: string; latencyMs: number; inputTokens: number; outputTokens: number }) => void;
  }
): Promise<ClaimVerification[]> {
  // Extract claims from answer
  const claims = answer
    .split(/[。！？\n；;]/)
    .map((claim) => claim.trim())
    .filter((claim) => claim.length >= 8)
    .slice(0, 16);

  if (!claims.length) return [];
  if (!options.modelGateway.available() || !facts.length) {
    return verifyClaimsFallback(answer, facts);
  }

  // Prepare fact context (only top-K verified facts)
  const factContext = facts
    .slice(0, 16)
    .map((f) => ({
      id: f.entityId,
      statement: f.statement.slice(0, 240),
      confidence: f.confidence,
    }));

  try {
    const result = await options.modelGateway.structured({
      task: "agent.technical_verify",
      promptVersion: "agent-technical-verify-v2",
      tier: "reasoning",
      system: `你是一名严谨的技术核验器。你的任务是判断候选人的技术声明是否与知识库中的事实一致。

核验原则：
1. supported: 声明与知识库事实完全一致，或有知识库事实直接支持
2. partially_supported: 声明部分正确，但有遗漏或细节错误
3. incorrect: 声明与知识库事实矛盾，或存在技术误区（必须给出 misconception 字段）
4. context_dependent: 声明在特定条件下成立，但候选人未说明条件
5. not_verifiable: 知识库中没有相关事实，无法判断

注意：
- 只基于给定的知识库事实判断，不要依赖自己的训练知识
- 如果声明涉及的内容不在知识库范围内，标记为 not_verifiable
- 如果发现技术误区，必须在 misconception 字段中清晰说明正确原理
- confidence 反映你对判断的把握程度`,
      user: JSON.stringify({
        claims: claims.map((c, i) => ({ index: i, claim: c })),
        knowledgeBaseFacts: factContext,
        skill: options.skill || "",
        project: options.project || "",
      }),
      schema: modelBatchVerdictSchema,
      temperature: 0.05,
      traceId: `${options.traceId}:technical_verify`,
    });

    options.onModelCall?.({
      model: result.model,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    // Map model results back to claims
    const verdictMap = new Map(
      result.data.verdicts.map((v) => [v.claimIndex, v.verdict])
    );

    return claims.map((claim, index) => {
      const verdict = verdictMap.get(index);
      if (!verdict) {
        return {
          claim,
          verdict: "not_verifiable" as const,
          matchedFactIds: [],
          citationIds: [],
          confidence: 0.2,
        };
      }
      return {
        claim,
        verdict: verdict.verdict,
        matchedFactIds: verdict.matchedEntityIds,
        citationIds: verdict.citationSourceIds,
        misconception: verdict.misconception,
        confidence: verdict.confidence,
      };
    });
  } catch {
    return verifyClaimsFallback(answer, facts);
  }
}

// ---- Backward-compatible export (used by parallel-judge.ts) ----

export function verifyClaims(answer: string, facts: VerifierFact[]): ClaimVerification[] {
  return verifyClaimsFallback(answer, facts);
}
