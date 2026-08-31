/**
 * 可观测性模块
 *
 * 功能：
 * 1. 结构化日志系统
 * 2. 调用链追踪（Trace ID）
 * 3. 性能指标监控
 * 4. 错误追踪
 * 5. 与 LangGraph V2 集成
 */

import crypto from "node:crypto";

// ============ 日志级别定义 ============

export type LogLevel =
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

// ============ 结构化日志条目 ============

export type LogEntry = {
  timestamp: number;
  level: LogLevel;
  message: string;
  traceId?: string;
  sessionId?: string;
  nodeId?: string;
  duration?: number;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

// ============ 结构化日志器 ============

export class StructuredLogger {
  private minLevel: LogLevel;
  private sessionId?: string;
  private traceId?: string;
  private nodeId?: string;
  private outputFn: (entry: LogEntry) => void;

  constructor(options: {
    minLevel?: LogLevel;
    sessionId?: string;
    traceId?: string;
    nodeId?: string;
    outputFn?: (entry: LogEntry) => void;
  } = {}) {
    this.minLevel = options.minLevel || "info";
    this.sessionId = options.sessionId;
    this.traceId = options.traceId;
    this.nodeId = options.nodeId;
    this.outputFn = options.outputFn || this.defaultOutput;
  }

  private defaultOutput(entry: LogEntry): void {
    const json = JSON.stringify(entry);
    if (entry.level === "error" || entry.level === "fatal") {
      console.error(json);
    } else {
      console.log(json);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      traceId: this.traceId,
      sessionId: this.sessionId,
      nodeId: this.nodeId,
      metadata,
    };

    this.outputFn(entry);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log("warn", message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: "error",
      message,
      traceId: this.traceId,
      sessionId: this.sessionId,
      nodeId: this.nodeId,
      metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };

    if (this.shouldLog("error")) {
      this.outputFn(entry);
    }
  }

  fatal(message: string, error?: Error, metadata?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: "fatal",
      message,
      traceId: this.traceId,
      sessionId: this.sessionId,
      nodeId: this.nodeId,
      metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };

    if (this.shouldLog("fatal")) {
      this.outputFn(entry);
    }
  }

  // 创建子日志器（继承上下文）
  child(context: {
    sessionId?: string;
    traceId?: string;
    nodeId?: string;
  }): StructuredLogger {
    return new StructuredLogger({
      minLevel: this.minLevel,
      sessionId: context.sessionId || this.sessionId,
      traceId: context.traceId || this.traceId,
      nodeId: context.nodeId || this.nodeId,
      outputFn: this.outputFn,
    });
  }
}

// ============ Trace ID 生成 ============

/**
 * 生成 Trace ID
 */
export function generateTraceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * 生成 Session ID
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

// ============ 性能指标 ============

export type PerformanceMetric = {
  name: string;
  value: number;
  unit: "ms" | "s" | "count" | "bytes";
  tags?: Record<string, string>;
  timestamp: number;
};

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private timers: Map<string, number> = new Map();

  /**
   * 记录指标
   */
  record(metric: PerformanceMetric): void {
    this.metrics.push(metric);
  }

  /**
   * 开始计时
   */
  startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }

  /**
   * 结束计时并记录
   */
  endTimer(name: string, tags?: Record<string, string>): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      throw new Error(`Timer ${name} not started`);
    }

    const duration = Date.now() - startTime;
    this.timers.delete(name);

    this.record({
      name,
      value: duration,
      unit: "ms",
      tags,
      timestamp: Date.now(),
    });

    return duration;
  }

  /**
   * 获取所有指标
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * 获取特定指标的统计
   */
  getStats(name: string): {
    count: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const values = this.metrics
      .filter((m) => m.name === name)
      .map((m) => m.value)
      .sort((a, b) => a - b);

    if (values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;

    return {
      count: values.length,
      avg,
      min: values[0],
      max: values[values.length - 1],
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
    };
  }

  /**
   * 清空指标
   */
  clear(): void {
    this.metrics = [];
    this.timers.clear();
  }
}

// ============ 调用链追踪 ============

export type Span = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "ok" | "error";
  tags?: Record<string, string>;
  logs?: Array<{
    timestamp: number;
    message: string;
    level: LogLevel;
  }>;
};

export class Tracer {
  private spans: Span[] = [];
  private activeSpans: Map<string, Span> = new Map();

  /**
   * 开始新的 Span
   */
  startSpan(
    operationName: string,
    options: {
      traceId?: string;
      parentSpanId?: string;
      tags?: Record<string, string>;
    } = {}
  ): string {
    const traceId = options.traceId || generateTraceId();
    const spanId = crypto.randomBytes(8).toString("hex");

    const span: Span = {
      traceId,
      spanId,
      parentSpanId: options.parentSpanId,
      operationName,
      startTime: Date.now(),
      status: "ok",
      tags: options.tags,
      logs: [],
    };

    this.activeSpans.set(spanId, span);
    return spanId;
  }

  /**
   * 结束 Span
   */
  finishSpan(spanId: string, status: "ok" | "error" = "ok"): void {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      throw new Error(`Span ${spanId} not found`);
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    this.activeSpans.delete(spanId);
    this.spans.push(span);
  }

  /**
   * 添加 Span 日志
   */
  logToSpan(spanId: string, message: string, level: LogLevel = "info"): void {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      throw new Error(`Span ${spanId} not found`);
    }

    (span.logs ??= []).push({
      timestamp: Date.now(),
      message,
      level,
    });
  }

  /**
   * 获取所有 Span
   */
  getSpans(): Span[] {
    return [...this.spans];
  }

  /**
   * 获取 Trace 的所有 Span
   */
  getTrace(traceId: string): Span[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  /**
   * 清空
   */
  clear(): void {
    this.spans = [];
    this.activeSpans.clear();
  }
}

// ============ 可观测性集成 ============

export class Observability {
  public logger: StructuredLogger;
  public monitor: PerformanceMonitor;
  public tracer: Tracer;

  constructor(options: {
    minLevel?: LogLevel;
    sessionId?: string;
  } = {}) {
    this.logger = new StructuredLogger({
      minLevel: options.minLevel,
      sessionId: options.sessionId,
    });
    this.monitor = new PerformanceMonitor();
    this.tracer = new Tracer();
  }

  /**
   * 记录节点执行
   */
  async traceNode<T>(
    nodeId: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const spanId = this.tracer.startSpan(nodeId, {
      tags: { nodeId },
    });

    this.monitor.startTimer(nodeId);
    this.logger.info(`${nodeId}_start`, metadata);

    try {
      const result = await fn();
      const duration = this.monitor.endTimer(nodeId);
      this.tracer.finishSpan(spanId, "ok");
      this.logger.info(`${nodeId}_complete`, { duration, ...metadata });
      return result;
    } catch (error) {
      const duration = this.monitor.endTimer(nodeId);
      this.tracer.finishSpan(spanId, "error");
      this.tracer.logToSpan(spanId, error instanceof Error ? error.message : String(error), "error");
      this.logger.error(`${nodeId}_error`, error instanceof Error ? error : undefined, { duration, ...metadata });
      throw error;
    }
  }

  /**
   * 记录模型调用
   */
  async traceModelCall<T>(
    modelTier: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const spanId = this.tracer.startSpan("model_call", {
      tags: { modelTier },
    });

    this.monitor.startTimer("model_call");
    this.logger.info("model_call_start", { modelTier, ...metadata });

    try {
      const result = await fn();
      const duration = this.monitor.endTimer("model_call");
      this.tracer.finishSpan(spanId, "ok");
      this.logger.info("model_call_complete", { modelTier, duration, ...metadata });
      return result;
    } catch (error) {
      const duration = this.monitor.endTimer("model_call");
      this.tracer.finishSpan(spanId, "error");
      this.tracer.logToSpan(spanId, error instanceof Error ? error.message : String(error), "error");
      this.logger.error("model_call_error", error instanceof Error ? error : undefined, { modelTier, duration, ...metadata });
      throw error;
    }
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport(): Record<string, any> {
    const metrics = this.monitor.getMetrics();
    const spans = this.tracer.getSpans();

    return {
      totalSpans: spans.length,
      errorSpans: spans.filter((s) => s.status === "error").length,
      metrics: metrics.map((m) => ({
        name: m.name,
        value: m.value,
        unit: m.unit,
        timestamp: m.timestamp,
      })),
      stats: {
        modelCall: this.monitor.getStats("model_call"),
        nodeExecution: this.monitor.getStats("node_execution"),
      },
    };
  }

  /**
   * 清空
   */
  clear(): void {
    this.monitor.clear();
    this.tracer.clear();
  }
}

// ============ 单例导出 ============

export const observability = new Observability({
  minLevel: "info",
});
