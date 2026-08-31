/**
 * 异常处理和降级策略模块
 *
 * 功能：
 * 1. 多层降级策略（主模型 → 备用模型 → 规则引擎）
 * 2. 错误分类和重试机制
 * 3. 超时处理
 * 4. 与模型调用集成
 */

import { z } from "zod";
import { config } from "../../config.js";

// ============ 错误类型定义 ============

export type ErrorType =
  | "timeout"           // 超时
  | "rate_limit"        // 限流
  | "auth_error"        // 认证错误
  | "validation_error"  // 校验错误
  | "network_error"     // 网络错误
  | "model_error"       // 模型错误
  | "unknown_error";    // 未知错误

export type SeverityLevel =
  | "low"       // 可忽略
  | "medium"    // 需要记录
  | "high"      // 需要重试
  | "critical"; // 需要降级

export type ClassifiedError = {
  type: ErrorType;
  severity: SeverityLevel;
  message: string;
  retryable: boolean;
  maxRetries: number;
  suggestedAction: "retry" | "fallback" | "abort";
};

// ============ 错误分类函数 ============

/**
 * 分类错误
 */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // 超时错误
    if (message.includes("timeout") || message.includes("超时")) {
      return {
        type: "timeout",
        severity: "high",
        message: error.message,
        retryable: true,
        maxRetries: 2,
        suggestedAction: "retry",
      };
    }

    // 限流错误
    if (message.includes("rate limit") || message.includes("429")) {
      return {
        type: "rate_limit",
        severity: "high",
        message: error.message,
        retryable: true,
        maxRetries: 3,
        suggestedAction: "retry",
      };
    }

    // 认证错误
    if (message.includes("auth") || message.includes("401") || message.includes("403")) {
      return {
        type: "auth_error",
        severity: "critical",
        message: error.message,
        retryable: false,
        maxRetries: 0,
        suggestedAction: "fallback",
      };
    }

    // 校验错误
    if (message.includes("validation") || message.includes("schema")) {
      return {
        type: "validation_error",
        severity: "medium",
        message: error.message,
        retryable: true,
        maxRetries: 1,
        suggestedAction: "retry",
      };
    }

    // 网络错误
    if (message.includes("network") || message.includes("fetch") || message.includes("connection")) {
      return {
        type: "network_error",
        severity: "high",
        message: error.message,
        retryable: true,
        maxRetries: 3,
        suggestedAction: "retry",
      };
    }

    // 模型错误
    if (message.includes("model") || message.includes("api")) {
      return {
        type: "model_error",
        severity: "high",
        message: error.message,
        retryable: true,
        maxRetries: 2,
        suggestedAction: "fallback",
      };
    }
  }

  // 未知错误
  return {
    type: "unknown_error",
    severity: "medium",
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
    maxRetries: 1,
    suggestedAction: "retry",
  };
}

// ============ 重试配置 ============

export type RetryConfig = {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterMs: 500,
};

// ============ 重试函数 ============

/**
 * 计算重试延迟（指数退避 + 抖动）
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = Math.random() * config.jitterMs;
  return cappedDelay + jitter;
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带重试的执行函数
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const classified = classifyError(error);

      // 不可重试的错误，直接抛出
      if (!classified.retryable || attempt >= config.maxRetries) {
        throw error;
      }

      // 计算延迟
      const delayMs = calculateRetryDelay(attempt, config);

      // 回调
      if (onRetry) {
        onRetry(attempt + 1, error, delayMs);
      }

      // 等待
      await delay(delayMs);
    }
  }

  throw lastError;
}

// ============ 超时处理 ============

/**
 * 带超时的执行函数
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = "Operation timed out"
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ============ 降级策略 ============

export type ModelTier = "fast" | "standard" | "reasoning";

export type FallbackChain = {
  tiers: ModelTier[];
  current: number;
};

/**
 * 创建降级链
 */
export function createFallbackChain(primaryTier: ModelTier): FallbackChain {
  const tierOrder: ModelTier[] = ["reasoning", "standard", "fast"];
  const startIndex = tierOrder.indexOf(primaryTier);

  return {
    tiers: tierOrder.slice(startIndex),
    current: 0,
  };
}

/**
 * 获取下一个降级层级
 */
export function getNextFallback(chain: FallbackChain): ModelTier | null {
  if (chain.current >= chain.tiers.length - 1) {
    return null;
  }
  chain.current++;
  return chain.tiers[chain.current];
}

/**
 * 带降级的执行函数
 */
export async function withFallback<T>(
  fn: (tier: ModelTier) => Promise<T>,
  primaryTier: ModelTier,
  onFallback?: (fromTier: ModelTier, toTier: ModelTier, error: unknown) => void
): Promise<T> {
  const chain = createFallbackChain(primaryTier);
  let lastError: unknown;

  for (const tier of chain.tiers) {
    try {
      return await fn(tier);
    } catch (error) {
      lastError = error;

      const nextTier = getNextFallback(chain);
      if (!nextTier) {
        break;
      }

      if (onFallback) {
        onFallback(tier, nextTier, error);
      }
    }
  }

  throw lastError;
}

// ============ 完整的降级策略 ============

export type ModelCallResult<T> = {
  data: T;
  tier: ModelTier;
  latencyMs: number;
  retries: number;
  fallbacks: number;
};

/**
 * 完整的模型调用（带重试和降级）
 */
export async function modelCallWithResilience<T>(
  fn: (tier: ModelTier) => Promise<T>,
  primaryTier: ModelTier,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
  timeoutMs: number = 30000,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void,
  onFallback?: (fromTier: ModelTier, toTier: ModelTier, error: unknown) => void
): Promise<ModelCallResult<T>> {
  const started = Date.now();
  let totalRetries = 0;
  let totalFallbacks = 0;

  const chain = createFallbackChain(primaryTier);
  let lastError: unknown;

  for (const tier of chain.tiers) {
    try {
      // 带重试和超时的调用
      const result = await withRetry(
        () => withTimeout(() => fn(tier), timeoutMs, `Model call timed out after ${timeoutMs}ms`),
        retryConfig,
        (attempt, error, delayMs) => {
          totalRetries++;
          if (onRetry) {
            onRetry(attempt, error, delayMs);
          }
        }
      );

      const latencyMs = Date.now() - started;

      return {
        data: result,
        tier,
        latencyMs,
        retries: totalRetries,
        fallbacks: totalFallbacks,
      };
    } catch (error) {
      lastError = error;

      const nextTier = getNextFallback(chain);
      if (!nextTier) {
        break;
      }

      totalFallbacks++;
      if (onFallback) {
        onFallback(tier, nextTier, error);
      }
    }
  }

  throw lastError;
}

// ============ 规则引擎降级 ============

/**
 * 规则引擎降级（当所有模型调用失败时）
 */
export function fallbackToRuleEngine(
  answer: string,
  skill: string
): {
  score: number;
  confidence: number;
  verdict: string;
  feedback: string;
} {
  // 简单的规则引擎评分
  const length = answer.trim().length;
  const score = Math.min(10, Math.max(0, length / 50));

  let verdict: string;
  let feedback: string;

  if (score >= 7) {
    verdict = "supported";
    feedback = "回答较为完整（规则引擎降级评分）。";
  } else if (score >= 4.5) {
    verdict = "partial";
    feedback = "回答不够完整（规则引擎降级评分）。";
  } else {
    verdict = "insufficient";
    feedback = "回答过于简短（规则引擎降级评分）。";
  }

  return {
    score: Number(score.toFixed(1)),
    confidence: 0.5, // 降级模式，置信度较低
    verdict,
    feedback,
  };
}

// ============ 单例导出 ============

export {
  DEFAULT_RETRY_CONFIG,
};
