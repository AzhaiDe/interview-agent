import crypto from "node:crypto";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { database } from "../database.js";
import { config } from "../config.js";
import { createGraphSession } from "../agent-runtime.js";
import { createGrowthReport } from "../agent-runtime.js";
import type { InterviewEngine, InterviewEngineAnswerInput, InterviewEngineResult, InterviewEngineStartInput, InterviewEngineReviewInput } from "../interview-engine.js";
import { Command, createInterviewGraphV3 } from "./langgraph-v3.js";
import { buildInitialGraphState, type InterviewGraphState } from "./graph-state.js";

function snapshot(state: InterviewGraphState) {
  return { engine: "langgraph", graphVersion: "offerpilot-interview-graph-v3", node: state.trace.currentNode, traceId: state.trace.traceId, nextAction: state.nextAction, round: state.session.questionIndex, questionBudget: state.budget.questionBudget, interrupt: state.session.state === "human_review" ? "human_review" : state.session.state === "asking" ? "candidate_answer" : undefined };
}

export class LangGraphInterviewEngine implements InterviewEngine {
  private graphPromise: Promise<any>;
  constructor() { this.graphPromise = this.createGraph(); }
  private async createGraph() {
    if (config.databaseDriver === "postgres" && config.postgresUrl) {
      const saver = PostgresSaver.fromConnString(config.postgresUrl);
      await saver.setup();
      return createInterviewGraphV3(saver);
    }
    return createInterviewGraphV3();
  }
  private thread(sessionId: string) { return { configurable: { thread_id: sessionId } }; }
  private async run(input: any, sessionId: string) {
    const graph = await this.graphPromise;
    const result = await graph.invoke(input, this.thread(sessionId));
    const state = (result as any).runtime || (await graph.getState(this.thread(sessionId))).values.runtime;
    return { state, raw: result };
  }
  private persist(ownerId: string, state: InterviewGraphState) {
    database.saveInterview(ownerId, state.session);
    return { session: state.session, graph: snapshot(state) };
  }
  async start(input: InterviewEngineStartInput): Promise<InterviewEngineResult> {
    const session = createGraphSession({ ...input.profile, targetRole: input.targetRole }, input.pressure, input.interviewType);
    const runtime = buildInitialGraphState(session, input.ownerId); runtime.session.state = "created";
    const { state } = await this.run({ runtime }, session.id);
    const p = this.persist(input.ownerId, state);
    return { ...p, sessionId: state.session.id, question: state.pendingQuestion?.text, mode: state.session.modelMode, interrupt: { kind: "candidate_answer", payload: { question: state.pendingQuestion?.text } } } as any;
  }
  async answer(input: InterviewEngineAnswerInput): Promise<InterviewEngineResult> {
    const { state } = await this.run(new Command({ resume: input.answer }), input.sessionId);
    const p = this.persist(input.ownerId, state);
    return { ...p, sessionId: state.session.id, score: state.aggregateResult?.score, feedback: state.latestJudges?.map((x: { feedback: string }) => x.feedback).join(" "), question: state.pendingQuestion?.text, needsHumanReview: state.aggregateResult?.needsHumanReview, evaluation: state.aggregateResult, phase: state.session.phase, transcript: state.session.transcript, diagnosis: state.session.diagnoses.at(-1), action: state.nextAction } as any;
  }
  async review(input: InterviewEngineReviewInput): Promise<InterviewEngineResult> {
    const { state } = await this.run(new Command({ resume: { decision: input.decision, note: input.note } }), input.sessionId);
    const p = this.persist(input.ownerId, state);
    return { ...p, sessionId: state.session.id, question: state.pendingQuestion?.text, needsHumanReview: false } as any;
  }
  async finish(ownerId: string, sessionId: string): Promise<InterviewEngineResult> {
    const session = database.getInterview(sessionId, ownerId); if (!session) throw new Error("interview_not_found");
    const report = session.growthReport || await createGrowthReport(session); session.growthReport = report; session.result = report.result; session.state = "completed"; database.saveInterview(ownerId, session);
    return { session, report, graph: { engine: "langgraph", graphVersion: "offerpilot-interview-graph-v3", node: "finalize" } };
  }
}

let singleton: LangGraphInterviewEngine | undefined;
export function getLangGraphInterviewEngine() { return singleton ||= new LangGraphInterviewEngine(); }

/** Unified engine entry point used by the LangGraph rollout. Legacy remains
 * behind the existing runtime until its adapter is enabled by the flag. */
export function getInterviewEngine() { return getLangGraphInterviewEngine(); }
