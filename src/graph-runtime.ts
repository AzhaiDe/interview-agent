import crypto from "node:crypto";

export type GraphNodeResult<S> = { state: S; next?: string; interrupt?: { reason: string; payload?: unknown } };
export type GraphNode<S> = (state: S) => Promise<GraphNodeResult<S>> | GraphNodeResult<S>;
export type GraphCheckpoint<S> = { id: string; graphVersion: string; node: string; state: S; traceId: string; createdAt: string; step?: number; durationMs?: number };
export type GraphDefinition<S> = { version: string; start: string; nodes: Record<string, GraphNode<S>>; edges: Record<string, string | ((state: S) => string)>; interrupts?: Set<string> };

export class ExecutableGraph<S> {
  constructor(private readonly definition: GraphDefinition<S>, private readonly saveCheckpoint?: (checkpoint: GraphCheckpoint<S>) => void | Promise<void>) {}

  async run(initial: S, options: { node?: string; traceId?: string; maxSteps?: number } = {}) {
    let state = initial;
    let node = options.node || this.definition.start;
    const traceId = options.traceId || crypto.randomUUID();
    const checkpoints: GraphCheckpoint<S>[] = [];
    const maxSteps = options.maxSteps ?? 100;
    for (let step = 0; step < maxSteps; step++) {
      const handler = this.definition.nodes[node];
      if (!handler) throw new Error(`Graph node not registered: ${node}`);
      const started = Date.now();
      const result = await handler(state);
      const durationMs = Date.now() - started;
      state = result.state;
      const trace = (state as any).trace;
      if (trace) {
        trace.latencyMs = (trace.latencyMs || 0) + durationMs;
        trace.nodeMetrics ||= {};
        const metric = trace.nodeMetrics[node] ||= { calls: 0, totalMs: 0, lastMs: 0 };
        metric.calls += 1; metric.totalMs += durationMs; metric.lastMs = durationMs;
      }
      const checkpoint: GraphCheckpoint<S> = { id: crypto.randomUUID(), graphVersion: this.definition.version, node, state, traceId, createdAt: new Date().toISOString(), step, durationMs };
      checkpoints.push(checkpoint);
      await this.saveCheckpoint?.(checkpoint);
      if (result.interrupt || this.definition.interrupts?.has(node)) return { status: "interrupted" as const, node, state, traceId, checkpoints, interrupt: result.interrupt || { reason: `node:${node}` } };
      const edge = result.next || this.definition.edges[node];
      if (!edge) return { status: "completed" as const, node, state, traceId, checkpoints };
      node = typeof edge === "function" ? edge(state) : edge;
    }
    throw new Error(`Graph exceeded maxSteps=${maxSteps}`);
  }

  async resume(checkpoint: GraphCheckpoint<S>, patch?: (state: S) => S) {
    const state = patch ? patch(checkpoint.state) : checkpoint.state;
    const edge = this.definition.edges[checkpoint.node];
    const nextNode = typeof edge === "function" ? edge(state) : edge || checkpoint.node;
    return this.run(state, { node: nextNode, traceId: checkpoint.traceId });
  }
}
