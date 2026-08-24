import { Annotation, END, MemorySaver, START, StateGraph, type CompiledStateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { config } from "../config.js";

/**
 * Stable V2 state. Nodes communicate through this object only; they do not
 * mutate InterviewSession, which removes the old three-state synchronization
 * problem (session + graph state + agentRuntime).
 */
export const InterviewGraphState = Annotation.Root({
  sessionId: Annotation<string>(),
  targetRole: Annotation<string>(),
  pressure: Annotation<string>(),
  answer: channel(""),
  question: channel(""),
  mappedSkill: channel(""),
  evidence: channel<string[]>([]),
  belief: channel<Record<string, number>>({}),
  evidenceClaims: channel<Array<{ claim: string; polarity: "supports" | "contradicts" | "unknown"; confidence: number }>>([]),
  review: channel<{ required: boolean; reason?: string }>({ required: false }),
  memoryEventIds: channel<string[]>([]),
  node: channel("start"),
  nextAction: channel<"answer" | "finished">("answer"),
  round: channel(0),
  trace: channel<string[]>([]),
});

function channel<T>(fallback: T) {
  return Annotation<T>({ reducer: (_left: T, right: T) => right, default: () => fallback });
}

export type InterviewGraphStateType = typeof InterviewGraphState.State;

const appendTrace = (state: InterviewGraphStateType, node: string) => ({ node, trace: [...state.trace, node] });

const loadContext = (state: InterviewGraphStateType) => ({ ...appendTrace(state, "load_context"), evidence: state.evidence.length ? state.evidence : [`${state.targetRole}:核心能力待验证`] }) as any;
const selectStrategy = (state: InterviewGraphStateType) => ({ ...appendTrace(state, "select_strategy"), mappedSkill: state.mappedSkill || "problem_solving" }) as any;
const composeQuestion = (state: InterviewGraphStateType) => ({ ...appendTrace(state, "compose_question"), question: state.question || `请结合${state.targetRole}经历，说明你如何解决一个复杂问题？` }) as any;
const questionGuard = (state: InterviewGraphStateType) => ({ ...appendTrace(state, "question_guard"), question: state.question.trim() || "请描述一个最具挑战性的项目。" }) as any;
const waitForAnswer = (state: InterviewGraphStateType) => ({ ...appendTrace(state, "wait_for_answer"), nextAction: "answer" as const }) as any;
const evaluateAnswer = (state: InterviewGraphStateType) => {
  const score = Math.min(1, Math.max(0, state.answer.trim().length / 240));
  const reviewRequired = score < 0.2;
  const eventId = `v2:${state.sessionId}:${state.round + 1}`;
  return { ...appendTrace(state, "evaluate_answer"), answer: "", evidenceClaims: [{ claim: `${state.mappedSkill || "problem_solving"} 回答证据`, polarity: score >= 0.2 ? "supports" as const : "unknown" as const, confidence: score }], review: { required: reviewRequired, reason: reviewRequired ? "回答证据不足，需要人工复核" : undefined }, memoryEventIds: [...state.memoryEventIds, eventId], belief: { ...state.belief, [state.mappedSkill || "problem_solving"]: score }, round: state.round + 1 } as any;
};
const converge = (state: InterviewGraphStateType) => ({ ...appendTrace(state, "converge"), nextAction: state.round >= 3 ? "finished" as const : "answer" as const }) as any;

function routeAfterConverge(state: InterviewGraphStateType) {
  return state.nextAction === "finished" ? END : "compose_question";
}

export function buildInterviewGraph(checkpointer: any = new MemorySaver()): any {
  return new StateGraph(InterviewGraphState)
    .addNode("load_context", loadContext)
    .addNode("select_strategy", selectStrategy)
    .addNode("compose_question", composeQuestion)
    .addNode("question_guard", questionGuard)
    .addNode("wait_for_answer", waitForAnswer)
    .addNode("evaluate_answer", evaluateAnswer)
    .addNode("converge", converge)
    .addEdge(START, "load_context")
    .addEdge("load_context", "select_strategy")
    .addEdge("select_strategy", "compose_question")
    .addEdge("compose_question", "question_guard")
    .addEdge("question_guard", "wait_for_answer")
    .addConditionalEdges("wait_for_answer", (state) => state.answer.trim() ? "evaluate_answer" : END, { evaluate_answer: "evaluate_answer", [END]: END })
    .addEdge("evaluate_answer", "converge")
    .addConditionalEdges("converge", routeAfterConverge, { compose_question: "compose_question", [END]: END })
    .compile({ checkpointer });
}

export async function buildPostgresInterviewGraph() {
  if (!config.postgresUrl) throw new Error("DATABASE_URL/POSTGRES_URL is required for the PostgreSQL graph");
  const saver = PostgresSaver.fromConnString(config.postgresUrl);
  await saver.setup();
  return { saver, graph: buildInterviewGraph(saver) };
}

export const interviewGraphV2 = buildInterviewGraph();
