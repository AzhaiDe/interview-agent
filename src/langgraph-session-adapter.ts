import { interviewGraphV2, type InterviewGraphStateType } from "./agent/langgraph-v2.js";
import type { InterviewSession } from "./types.js";

export type LangGraphTurn = {
  question?: string;
  score?: number;
  shouldFinish: boolean;
  needsHumanReview: boolean;
  evidenceClaims: InterviewGraphStateType["evidenceClaims"];
  belief: InterviewGraphStateType["belief"];
  trace: string[];
};

function config(sessionId: string) { return { configurable: { thread_id: sessionId } }; }

export async function langGraphOpening(session: InterviewSession): Promise<LangGraphTurn> {
  const state = await interviewGraphV2.invoke({ sessionId: session.id, targetRole: session.profile.targetRole, pressure: String(session.pressure) }, config(session.id));
  return toTurn(state);
}

export async function langGraphAnswer(session: InterviewSession, answer: string): Promise<LangGraphTurn> {
  const state = await interviewGraphV2.invoke({ answer }, config(session.id));
  return toTurn(state);
}

function toTurn(state: InterviewGraphStateType): LangGraphTurn {
  return { question: state.question || undefined, score: state.belief[state.mappedSkill] === undefined ? undefined : state.belief[state.mappedSkill] * 10, shouldFinish: state.nextAction === "finished", needsHumanReview: state.review.required, evidenceClaims: state.evidenceClaims, belief: state.belief, trace: state.trace };
}
