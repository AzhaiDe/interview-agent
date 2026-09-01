# LangGraph P0（七节点）落地说明

## 运行方式

默认仍是 Legacy，保证线上可回滚。灰度启用原生图：

```env
INTERVIEW_GRAPH_ENGINE=langgraph
DATABASE_DRIVER=postgres
POSTGRES_URL=postgresql://user:password@host:5432/offerpilot
```

配置 PostgreSQL 时，`LangGraphInterviewEngine` 启动 `PostgresSaver` 并执行 `setup()`；每个面试 `sessionId` 映射为 LangGraph `thread_id`。未配置 PostgreSQL 时开发环境使用 `MemorySaver`。

## 七节点职责

```text
START → bootstrap → decide_next ──(finish)──> finalize → END
                         │
                         └── formulate_question → await_answer
                                                  │ interrupt(Command.resume)
                                                  v
                    decide_next ← commit_turn ← evaluate_answer
                                      ▲              │
                                      └── human_review interrupt（必要时）
```

- `bootstrap`：加载上下文、初始化候选人证据图和岗位 rubric。
- `decide_next`：信息增益/不确定性/疲劳与预算共同决定技能和路线。
- `formulate_question`：计划、RAG、问题生成、9 项 Question Guard 合并为一次可审计节点执行。
- `await_answer`：调用 LangGraph 原生 `interrupt()`，HTTP 答案通过 `Command({resume})` 恢复。
- `evaluate_answer`：复用生产 claim extractor、Technical/Evidence/Consistency/Communication/Base Judge 及聚合器；分歧过大时再次 `interrupt()` 等待人工复核。
- `commit_turn`：在同一图状态中提交证据账本、能力 belief、压力/疲劳、session critic，并写入 Memory Outbox。
- `finalize`：生成成长报告并将会话置为 completed。

## 事实源与兼容层

LangGraph `runtime` channel 是运行时唯一事实源；SQLite 的 `interview_sessions` 只保存 API 查询所需的投影，PostgreSQL Checkpointer 保存可恢复的完整图状态。Legacy 18 节点没有删除，而是由七个节点按职责组合调用，因此可通过 `INTERVIEW_GRAPH_ENGINE=legacy` 一键回滚。

## API

- `POST /api/v1/interviews`：创建会话，返回第一个问题和 `graph.interrupt=candidate_answer`。
- `POST /api/v1/interviews/:id/answers`：提交答案，恢复 `await_answer`。
- `POST /api/v1/interviews/:id/review`：提交 `approve/reject`，恢复 `human_review`。
- `POST /api/v1/interviews/:id/finish`：生成最终报告。
- `GET /api/v1/graph/v2/manifest`：返回 v3 七节点和当前 checkpointer 类型。
