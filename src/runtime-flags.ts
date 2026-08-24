export const GRAPH_ENGINES = ["legacy", "langgraph", "shadow"] as const;
export type GraphEngine = (typeof GRAPH_ENGINES)[number];

export const DATABASE_DRIVERS = ["sqlite", "postgres"] as const;
export type DatabaseDriver = (typeof DATABASE_DRIVERS)[number];

export function parseGraphEngine(value: string | undefined): GraphEngine {
  return GRAPH_ENGINES.includes(value as GraphEngine) ? value as GraphEngine : "legacy";
}

export function parseDatabaseDriver(value: string | undefined): DatabaseDriver {
  return DATABASE_DRIVERS.includes(value as DatabaseDriver) ? value as DatabaseDriver : "sqlite";
}
