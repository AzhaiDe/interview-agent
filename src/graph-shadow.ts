export type GraphObservation = {
  nextAction?: string;
  question?: string;
  score?: number;
  evidenceCount?: number;
  needsHumanReview?: boolean;
};

export type ShadowComparison = {
  compatible: boolean;
  differences: string[];
  severity: "none" | "warning" | "blocking";
};

/** Compare externally visible semantics, not internal node names. */
export function compareGraphObservations(legacy: GraphObservation, candidate: GraphObservation): ShadowComparison {
  const differences: string[] = [];
  if ((legacy.nextAction || "") !== (candidate.nextAction || "")) differences.push("nextAction");
  if (Boolean(legacy.needsHumanReview) !== Boolean(candidate.needsHumanReview)) differences.push("needsHumanReview");
  if (legacy.question && candidate.question && !candidate.question.trim()) differences.push("question");
  if (legacy.score !== undefined && candidate.score !== undefined && Math.abs(legacy.score - candidate.score) > 2) differences.push("score");
  if (legacy.evidenceCount !== undefined && candidate.evidenceCount !== undefined && candidate.evidenceCount < legacy.evidenceCount) differences.push("evidenceCount");
  return { compatible: differences.length === 0, differences, severity: differences.some((item) => ["nextAction", "needsHumanReview"].includes(item)) ? "blocking" : differences.length ? "warning" : "none" };
}

export function rolloutAllowed(comparisons: ShadowComparison[], minimumSamples = 100) {
  if (comparisons.length < minimumSamples) return { allowed: false, reason: `样本不足：${comparisons.length}/${minimumSamples}` };
  const blockingRate = comparisons.filter((item) => item.severity === "blocking").length / comparisons.length;
  const warningRate = comparisons.filter((item) => item.severity === "warning").length / comparisons.length;
  return { allowed: blockingRate === 0 && warningRate <= 0.05, blockingRate, warningRate };
}
