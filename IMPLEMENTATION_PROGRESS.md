# OfferPilot Agent 3：本轮落地进度

更新时间：2026-08-12

本轮目标是把旧的单体 workflow 继续推进为可观测、可审计、知识库约束的 Graph Runtime；语音面试按当前产品决策暂不实现。

## 已落地

- 新的 `agent-runtime` 负责面试会话、检索、模型评估、belief 更新、checkpoint 与结束报告。
- `agent-graph` 明确定义节点、条件边和版本，并通过 `/api/v1/graph/manifest` 暴露，便于前端、测试和运维核对实际图结构。
- 知识服务实现角色过滤、verified 状态门禁、词法检索、标签关系邻居、Evidence Pack、来源 URL 和 retrieval trace。
- 技术正确性、证据充分性、沟通表达三个模型 Judge 并行评估；分歧过大或置信度不足时进入 `human_review`。
- belief 更新携带知识来源引用；状态接口暴露 graph node、trace、证据数和 belief 数。
- 知识库晋级脚本要求至少两名独立审核者、全部 approve 且必须提供 `evidence_source_ids`，当前没有审核记录时不会把候选数据伪装成 verified。
- 新增知识健康、实体列表和 Evidence Pack 检索接口。
- 面试回答已进入 SQLite memory outbox，并异步提交到 OmniMemory；评估前尝试召回个人记忆，失败时自动降级为本地 verified KB。
- Evidence Pack 增加 `personalMemory`、`provenance.localEntityIds` 和 `provenance.memoryEventIds`；状态接口暴露个人记忆命中数和事件 ID。
- 高分歧/低置信度评价现在由 API 层强制暂停会话，回答接口返回 409；新增 `/api/v1/interviews/:id/review`，支持 approve 后恢复追问或 reject 终止复核。
- 新增可解释 `interviewUtility()`（不确定度、岗位权重、经历相关性、可验证性、难度适配、疲劳/重复惩罚）和 `sessionCritic()`，并加入专项测试。
- `Session Critic` 已接入回答 API：预算/疲劳达到阈值时会结束本场，不再生成下一题；响应返回 critic 原因和覆盖率信息。
- Opening 已实际通过 `ExecutableGraph` 执行 `load_context → select_target_skill → retrieve_evidence → compose_question → question_guard → wait_for_answer`，并在 interrupt 点暂停；不是仅保存 Graph manifest。
- OmniMemory 检索已贯通 opening 和回答后的下一题生成，个人记忆只以带 provenance 的线索进入 Judge，pending_message 不可直接作为事实。
- 多 Judge 聚合改为按固定角色权重、按实际可用 Judge 归一化，避免模型不可用时数组位置错配；新增聚合单元测试。
- 新增 `/api/v1/interviews/:id/checkpoints/latest`，可按租户读取最近图检查点完整状态，用于人工复核和回放；修复 human review 暂停后被错误推进为 generating_next 的状态覆盖问题。

## 验收结果

```text
npm run check       PASS
npm run build       PASS
npm test            PASS (18 tests)
npm run kb:validate PASS
npm run kb:promote  PASS (0 promoted; no reviewer decisions)
```

## 当前仍不是“生产成熟版”的明确边界

1. 当前检索是本地词法 + 标签关系邻居，不是向量库/BM25/RRF/reranker 的生产级混合检索。
2. 4616 条知识实体仍处于待审核状态，未达到可宣称的专家 Gold；需要真实专家审核数据。
3. Judge 目前支持模型模式和确定性 fallback，但还没有独立模型供应商路由、离线标注集和校准后的质量门槛。
4. 默认存储仍是本地 SQLite；Postgres、Redis、队列、对象存储和多租户 RBAC 尚未完成生产部署化。
5. 已删除旧的 `engine.ts`、`interview-planner.ts`、`growth.ts` 及对应历史编译产物，测试已迁移到新 `agent-runtime`。
6. 语音 ASR/TTS/打断链路明确排除在本阶段范围之外。

这些边界是验收结论，不代表将候选知识或 fallback 结果伪造为已完成能力。
