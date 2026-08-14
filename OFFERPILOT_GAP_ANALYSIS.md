# OfferPilot 3.0 综合差距分析报告

> 分析日期：2026-08-13
> 分析对象：Agent Graph 模块刚完成（18 节点 / 4 子图 / 条件边 / checkpoint / time travel）
> 参考文档：`OFFERPILOT_AGENT_3_PRD.md`、`OFFERPILOT_TECHNICAL_ARCHITECTURE.md`
> 状态图例：✅ 完整 / 🔨 部分 / ❌ 缺失

---

## 总体结论

**核心判断**：Agent 执行图（PRD 第 1 类 Graph）已基本对齐，是当前实现最扎实的模块。但 PRD 的真正目标是"四类 Graph 协同"——目前只有 Agent 执行图落地，**岗位能力知识图、候选人能力状态图、评测与学习图都还停留在 State 类型定义或空壳节点阶段**。从"带状态的 LLM 应用"升级为"面试智能系统"所需的知识层、评估层、学习层仍有大量工作。

按影响排序：**知识图谱结构化 ≈ Judge Panel 真正四路并行 > 能力状态持久化 > 模型任务路由 > 报告引用证据 > 可观测性/OTel > 招聘合规 > 评测闭环**。

---

## 1. Agent 执行图（Agent Execution Graph）— ✅ 完整

**PRD 参考**：PRD §5.1，架构 §2.1-2.4

**已实现**：
- `src/agent/interview-graph.ts` 定义完整 18 节点图
- 4 个子图全部实现：`project-deep-dive.ts`、`technical-fundamentals.ts`、`system-design.ts`、`behavioral.ts`
- 条件边 `src/agent/edges.ts`：`routeNextAction` 实现了 followup / change_skill / rejudge / finish / human_review 等分支
- Checkpoint：`database.saveGraphCheckpoint` + `listGraphCheckpoints` 持久化到 `graph_checkpoints` 表
- Time Travel：`src/agent/time-travel.ts` 存在
- Human Review 中断：`/api/v1/interviews/:id/review` 端点实现 approve/reject
- Wait-for-answer 中断：`wait_for_answer` 节点

**剩余小缺口**：
- 子图是否真正被 `interviewType` 动态切换（vs. 仅注册但未使用）需验证
- `human_review` 后恢复路径是否真正回到 `retrieve_evidence_pack`（目前看 review 端点只是改 question）

---

## 2. 岗位能力知识图（Job Competency Knowledge Graph）— 🔨 部分

**PRD 参考**：PRD §5.2，架构 §4

**已实现**：
- `knowledge-base/judged/` 下有大量 JSONL：concepts(450), questions(900), followups(1800), misconceptions(600), failure_modes(300), scoring_anchors(450), competencies(90)
- `knowledge-service.ts` 提供词法检索 + 标签关系邻居 + verified 门禁
- Evidence Pack 结构存在

**缺口**：
- ❌ **真正的图结构不存在**：PRD §5.2 描述的 `Role → Competency → Skill → Concept → Misconception → Question → Anchor` 边关系只在 JSONL 的 `tags` 字段隐式存在，没有 `kb_edges` 表（架构 §4.3 已规划但未建表）
- ❌ **邻居检索退化**：当前 `graph` 检索只是按 tags 重叠，不是真正的图遍历（架构 §4.4 要求 BM25 + Vector + Graph → RRF → Reranker）
- ❌ **向量检索未接入**：PRD §9.5 与架构 §4.4 明确要求当词法不足时引入 pgvector，当前未实现
- ❌ **Reranker 未接入**：PRD §6.4 与架构 §4.4 要求的 Cross-Encoder Rerank 完全缺失
- ⚠️ **知识域覆盖**：PRD §9.3 要求 30 能力 + 150 概念 + 300 问题 + 600 追问 + 200 误区 + 100 故障；当前 competencies 仅 90 条，但三个角色是否分布均匀未验证
- ⚠️ **知识运营后台**：PRD §Phase 2 提到的"知识运营后台"不存在
- ⚠️ **下架链路**：`source-policy.ts`、`ingest.ts` 等文件未创建

**影响**：这是"技术强结论必须有引用"（MVP 门槛 ≥98%）能否达标的核心依赖。当前 `technical-verifier.ts` 的 `verifyClaims` 只是基于 token 重叠的相似度匹配，置信度上限 0.95 但实际是词法匹配，**远达不到"技术核验"的严谨度**。

---

## 3. 候选人能力状态图（Candidate Ability State Graph）— 🔨 部分

**PRD 参考**：PRD §5.3，架构 §5

**已实现**：
- `SkillBelief` 类型定义完整（`src/agent/graph-state.ts`）：meanLevel, uncertainty, evidenceCount, maxDifficultyPassed, supportingEvidenceIds, contradictingEvidenceIds, misconceptions, lastTestedAt
- `EvidenceLedgerItem` 类型定义完整
- `update_ability_beliefs.ts` 节点存在
- `update_evidence_ledger.ts` 节点存在
- 内存中的 `agentRuntime.beliefs` 和 `agentRuntime.evidenceLedger` 在运行时维护

**缺口**：
- ❌ **不持久化**：`graph_checkpoints` 表虽然保存了 `state_json`（整个 session），但**没有独立的 `skill_beliefs` 和 `evidence_ledger` 表**（架构 §9.2 已规划索引但未建表）
- ❌ **跨 session 能力趋势**：PRD §5.3 要求的"多场训练趋势"不存在——每次新 session 从空 beliefs 开始
- ❌ **Bayesian 更新**：架构 §5.2 描述的 `newMean = oldMean + learningRate × evidenceWeight × (observedLevel - oldMean)` 更新规则未在 `update_ability_beliefs.ts` 中实现（大概率是简单覆盖）
- ❌ **Question Utility 计算**：架构 §5.3 定义了完整 utility 函数（informationGain × roleImportance × uncertainty × ...），`select-target-skill.ts` 暴露了 `interviewUtility` 但是否实现完整公式存疑
- ⚠️ **矛盾检测**：`contradictions` 数组存在但没有节点负责填充

**影响**：没有持久化的能力状态，"自适应选题"和"跨场训练收敛"都无法实现——这是 PRD 的核心价值主张之一。

---

## 4. 评测与学习图（Eval & Learning Graph）— ❌ 缺失

**PRD 参考**：PRD §5.4，§16，架构 §13

**已实现**：
- `evals/` 目录存在，有 `GOLD_BUILD_PROTOCOL.md`、`schemas/`、`rubrics/`、`datasets/`、`fixtures/`
- `model_runs` 表记录每次模型调用的延迟、token、schema 验证状态

**缺口**：
- ❌ **历史回放**：PRD §5.4 要求的"更换模型重跑"、"Prompt 对比"、"检索策略对比"不存在
- ❌ **专家标注平台**：PRD Phase 5 要求的标注平台不存在
- ❌ **DSPy Sidecar**：PRD §1.1、§10.4 要求的 Python DSPy 优化链路不存在
- ❌ **Gold 数据集**：PRD §16.3 要求 300 份简历 + 100 JD + 1000 题 + 3000 回答 + 500 追问轨迹——`evals/datasets/` 目录存在但内容未验证
- ❌ **Silver 测试**：PRD §2.2.5 提到当前 Silver 测试只能验证规则无回归，未见升级
- ❌ **MVP 门槛度量**：PRD §16.4 的 9 个指标（岗位相关率 ≥95%、重复率 ≤3% 等）没有自动化测量管线
- ⚠️ **人工纠正回写**：不存在

**影响**：没有评测闭环，任何 Agent 升级都是"盲飞"。PRD §19 风险表第一条就是"过度工程化——每个节点必须有独立指标和消融实验"。

---

#### 5. Resume Intelligence Agent — ✅ 基本完整

**PRD 参考**：PRD §6.1

**已实现**：
- `resume-workflow.ts`：完整 LLM + 确定性降级管线
- `CandidateClaim` 等价于 `EvidenceClaim`：claim, experienceId, evidence spans, confidence, status
- 原文证据定位：`start`/`end` 位置在 resume 原文中校验
- 声明可信度分类：proven / unknown / not_proven / needs_verification
- 简历能力图：experience → contributionLevel → evidenceQuality
- 版本化：`resume_analysis_versions` 表

**缺口**：
- ⚠️ PRD §6.1 要求的 `verificationPriority` 字段在 `EvidenceClaim` 中不存在
- ⚠️ PII 脱敏在 `pii.ts` 中存在但未验证是否覆盖所有模型输入路径

---

## 6. Job Intelligence Agent — 🔨 部分

**PRD 参考**：PRD §6.2，架构 §7.2

**已实现**：
- `recruiter-agent.ts` → `analyzeJobWithAgent`：JD → 职责/能力/级别/权重
- `RoleRubric` / `JobProfile` 类型完整
- Rubric 版本化：`job_rubric_versions` 表
- 招聘者确认：`rubricStatus: "draft" | "confirmed"`，`/confirm-rubric` 端点

**缺口**：
- ❌ **连接岗位知识图**：PRD §6.2 要求 JD 分析结果连接到 competency graph，当前只是 LLM 直接抽取
- ❌ **确认后不可静默修改**：虽然 `rubricStatus` 会变为 "confirmed"，但代码未阻止后续修改
- ⚠️ `calibrationDelta` 在 `rankingSchema` 中存在但**未被实际应用到排序**（PRD §13.3 明确指出"当前版本虽然生成 calibrationDelta，但没有真正应用"——**至今未修复**）

---

## 7. Interview Director — ✅ 完整

**PRD 参考**：PRD §6.3，架构 §3.1

**已实现**：
- `plan-question.ts` 节点：输出 `QuestionPlan`
- `QuestionPlan` 类型包含：targetSkillId, objective, difficulty, pressureStrategy, requiredEvidence, retrievalQuery, reason
- Director 使用推理模型（tier: "reasoning"）

---

## 8. Knowledge Retrieval Agent — 🔨 部分

**PRD 参考**：PRD §6.4，§9.5，架构 §4.4

**已实现**：
- `retrieve-evidence-pack.ts` 节点
- `knowledge-service.ts`：词法检索 + 标签图邻居 + verified 门禁
- 双层 Evidence Pack 结构（local KB + personalMemory 字段）
- `retrievalTrace` 记录 lexical / graph / reranked / excluded

**缺口**：
- ❌ **Query Rewrite**：PRD §6.4 第一条，未见实现
- ❌ **BM25 检索**：PRD §9.5 明确要求，当前只有自研词法
- ❌ **Vector Search**：PRD §9.5 当前不部署但要求评测后引入——未评测
- ❌ **Cross-Encoder Rerank**：PRD §6.4 要求，未实现
- ❌ **OmniMemory 在 Evidence Pack 中的融合**：`retrieveEvidencePack` 返回 `personalMemory: []` 始终为空——**个人记忆未真正参与检索管线**（只在 `agent-runtime.ts` 中单独调用 `omniMemory.search`）
- ⚠️ 架构 §4.4 要求的"双层 Evidence Pack + provenance"结构已定义但 personalMemory 为空壳

---

## 9. Question Composer & Guard — ✅ 完整

**PRD 参考**：PRD §6.5, §6.6

**已实现**：
- `compose-question.ts` 节点
- `question-guard.ts` 节点：检查岗位范围、历史重复、多主问题等
- Guard 不合格 → 回到 Compose 的条件边存在
- `pressure-policy.ts` 提供 5 级压力策略

---

## 10. Judge Panel（Technical / Evidence / Consistency / Communication）— 🔨 部分（**关键缺口**）

**PRD 参考**：PRD §6.9，架构 §3.3

**已实现**：
- `parallel-judge.ts` 节点存在
- `aggregate-judges.ts` 实现加权聚合（technical: 0.40, evidence: 0.25, consistency: 0.20, communication: 0.15）
- `JudgeResult` 类型包含 score, confidence, verdict, evidenceIds, issues
- `needsRejudge` 逻辑：spread ≥ 3 或 confidence < 0.55

**缺口**：
- ⚠️ **并行 Judge 可能仍为单模型**：PRD §10.2 要求"Judge 看不到其他 Judge 结论"、"Judge A 和 Judge B 优先使用不同模型族"——需要验证 `parallel-judge.ts` 是否真正并行调用多个独立模型
- ⚠️ **Technical Verifier 过于简陋**：`technical-verifier.ts` 的 `verifyClaims` 只是 token 重叠匹配，**与 PRD §6.8 要求的"将回答中的技术声明与知识库比较"差距巨大**。应使用模型 + 知识库联合核验，而不是 0.35 阈值的 token overlap
- ⚠️ PRD §6.8 定义的 `ClaimVerification` 类型（verdict: supported/partially_supported/incorrect/context_dependent/not_verifiable）与实际 `technical-verifier.ts` 的三值 verdict 不一致

**影响**：这是"严重技术误判率 ≤2%"和"Judge/专家相关性 ≥0.75"两个 MVP 门槛能否达标的核心。

---

## 11. Ability State Updater — 🔨 部分

**PRD 参考**：PRD §6.10，架构 §5.2

**已实现**：
- `update-ability-beliefs.ts` 节点存在

**缺口**：
- ❌ **Bayesian 更新规则未实现**：架构 §5.2 的 `newMean/newUncertainty` 公式疑似未落地
- ❌ **不持久化**（同第 3 项）：无 `skill_beliefs` 表
- ❌ **跨 session 趋势**：PRD §6.10 要求的"历史表现"作为输入，无实现

---

## 12. Session Critic — ✅ 完整

**PRD 参考**：PRD §6.11

**已实现**：
- `session-critic.ts` 节点
- `agent-runtime.ts` 中 `sessionCritic` 函数：评估 budget、fatigue、coverage、severeMissing
- 决定是否 finish / change_skill / continue

---

## 13. Career Coach Agent — 🔨 部分

**PRD 参考**：PRD §6.12，架构 §7.5

**已实现**：
- `createGrowthReport` 在 `agent-runtime.ts` 中
- 报告包含：dimensionScores, weakPoints, next7DaysPlan, recommendedPressure

**缺口**：
- ❌ **无独立 Coach Agent**：PRD §6.12 定义 Coach 为独立 Agent，当前是 `createGrowthReport` 内的模型调用
- ❌ **报告不引用 Evidence Ledger**：PRD §7.5 明确要求"报告必须引用 Evidence Ledger，而不是只引用分数"——当前报告基于 `diagnoses`，不是 `evidenceLedger`
- ⚠️ 架构 §7.5 的 fallback 路径 `buildFallbackGrowthReport` 存在

---

## 14. 压力面试模型（Pressure Interview Model）— ✅ 完整

**PRD 参考**：PRD §7

**已实现**：
- `pressure-policy.ts`：5 级压力策略完整
- L1-L5 行为定义与 PRD §7.2 一致
- 压力策略枚举：specificity, ownership, mechanism, tradeoff, metric, failure, scale, contradiction, time_box
- 禁止策略（嘲讽、羞辱、人格判断）在 prompt 层实现

---

## 15. 记忆系统（OmniMemory）— 🔨 部分

**PRD 参考**：PRD §11，架构 §4.4

**已实现**：
- `omnimemory.ts`：OmniMemoryClient 完整
- 混合检索：`/memory/retrieval/hybrid`
- 异步写入：outbox → flush → poll 三阶段
- PII 脱敏：`redactSensitive`
- Owner/device 隔离：`opaqueDeviceNo`
- `memory_outbox` 表 + `memory_ingest_jobs` 表
- 面试/简历分析后自动 enqueue

**缺口**：
- ⚠️ **双层 RAG 未真正融合**：knowledge-service 的 Evidence Pack 中 `personalMemory: []` 始终为空——OmniMemory 检索结果在 `agent-runtime.ts` 中单独使用，**未与 Local KB 的 Evidence Pack 合并为双层 Pack**（PRD §11.4、架构 §4.4 的核心要求）
- ⚠️ `source=memory` vs `source=pending_message` 区分在 Evidence 类型中存在，但检索融合路径未打通
- ⚠️ 产品记忆（PRD §11.5）：系统级聚合的"哪类问题最有效"等不存在

---

## 16. 招聘者流程（Recruiter Flow）— 🔨 部分

**PRD 参考**：PRD §13

**已实现**：
- JD 建模：`/api/v1/recruiter/jobs` + `analyzeJobWithAgent`
- 简历分析：逐份 `analyzeResumeWithAgent`
- 排名：`matchWithAgent` 横向校准
- Rubric 确认：`/confirm-rubric`
- 任务异步：`runRecruiterTask` + 中断恢复
- 从候选人已有简历创建：`/candidates/from-resume`

**缺口**：
- ❌ **招聘风险控制**（PRD §13.4）：
  - ❌ 隐藏姓名/照片/性别等无关信息：未实现（`RecruiterResume` 中没有 blind 字段）
  - ❌ 禁止模型作为自动拒绝唯一依据：仅通过注释声明，无代码保护
  - ❌ 群体公平性监控：PRD §13.4 要求"监控不同群体的评分差异"，不存在
- ❌ **calibrationDelta 未应用**：PRD §13.3 明确指出这个老问题"应在升级中明确选择"——至今未修复
- ⚠️ 重复端点：`/api/recruiter/jobs/:jobId` 有两个注册（一个返回 `resumes/matches`，一个返回 `candidates/results`）

---

## 17. 报告与训练建议（Report & Coaching）— 🔨 部分

**PRD 参考**：PRD §12.4，架构 §7.5

**已实现**：
- `GrowthReport` 类型完整：dimensionScores, weakPoints, next7DaysPlan, strengthItems, coverageRate
- 报告生成：`createGrowthReport`
- Fallback：确定性报告

**缺口**：
- ❌ **报告不引用 Evidence Ledger**（同第 13 项）
- ❌ **PRD §12.4 要求的"简历声称与面试证明对照"**：`resumeClaimedButWeak` 字段存在但是否真正填充未验证
- ❌ **30 天训练计划**：PRD §12.4 要求 7 天 + 30 天，当前只有 `next7DaysPlan`
- ❌ **复测题**：PRD §12.4 要求"复测问题"，GrowthReport 中无此字段
- ❌ **推荐下次压力等级**：`recommendedPressure` 字段存在但是否计算未验证

---

## 18. 模型路由抽象（Model Routing）— 🔨 部分

**PRD 参考**：PRD §10.1，架构 §3.2

**已实现**：
- `model-gateway.ts`：`ModelGateway.structured()` 方法
- 三级 tier：fast / standard / reasoning
- Schema 校验 + 自动重试
- 模型运行审计：`model_runs` 表

**缺口**：
- ❌ **PRD §10.1 要求的 8+ 模型角色分层**未实现：Router, Resume Extractor, JD Extractor, Director, Composer, Extractor, Technical Judge, Evidence Judge, Consistency Judge, Communication Judge, Critic, Coach —— 当前只用 3 个 tier 路由，**没有 task → model 的细粒度映射**
- ❌ **架构 §3.2 定义的 `ModelTask` 类型**（route | extract_resume | extract_jd | plan_question | compose_question | extract_claims | technical_judge | ...）未在 `model-gateway.ts` 中实现——`structured()` 只接受 `task: string`，不做路由决策
- ❌ **"出题模型不能为自己出的题评分"**（PRD §10.2）：当前 tier 路由无法保证模型族隔离
- ⚠️ 架构 §3.2 要求的 `ModelRequest<T>` 接口（含 schema, maxTokens, temperature, timeoutMs, traceId）未完全对齐

---

## 19. 可观测性（Observability）— 🔨 部分

**PRD 参考**：PRD §1.1，架构 §10

**已实现**：
- `model_runs` 表：task, model, promptVersion, latencyMs, schemaValid, retryCount, inputTokens, outputTokens, fallbackUsed, errorCode, traceId
- `audit_logs` 表：ownerId, action, resourceType, resourceId, metadata
- Graph Trace：`agentRuntime.traceId` + `graphVersion` + `node` 在 session 中

**缺口**：
- ❌ **OpenTelemetry 未接入**：PRD §1.1 和架构 §10 要求 OTel + Phoenix，代码中 `grep` 未发现任何 OTel import
- ❌ **核心看板不存在**：架构 §10 要求的 9 个看板指标（节点 P50/P95、Schema 失败率、Judge 分歧率、检索 Recall@10、重复问题率、单轮 Token、降级比例、用户中断率、技术严重误判率）没有聚合查询
- ⚠️ `model_runs` 有 traceId 但无 span 层级

---

## 20. API & Infrastructure — 🔨 部分

**PRD 参考**：架构 §7.3，§8

**已实现**：
- Fastify 服务器，CORS、安全头、速率限制
- 简历上传/分析/删除
- 面试：start/answer/finish/abandon/review/report
- Checkpoint 查询：`/checkpoints` 和 `/checkpoints/latest`
- 知识：health/entities/retrieve
- 招聘：jobs/candidates/match/tasks
- 幂等：`Idempotency-Key` 在 `/api/v1/` 强制
- 数据导出：`/api/v1/me/export`

**缺口**：
- ❌ **`POST /api/interviews/:id/pause`** 和 **`/resume`**：架构 §7.3 要求但只有内部 `session.state = "paused"`，没有独立 API
- ❌ **`GET /api/interviews/:id/stream`**：架构 §7.3 要求的 SSE 流式响应未实现
- ❌ **PRD §17 安全合规**：
  - ❌ 真实认证：当前 `config.localUserId` 硬编码单用户，无 RBAC
  - ❌ 多租户隔离：表有 `owner_id` 但无真实认证验证
  - ❌ 对象存储私有桶：`file-storage.ts` 使用本地文件系统，未使用 OSS/S3
- ⚠️ 路由重复：`/api/v1/interviews/:id/review` 与 `/api/v1/interviews/:id/checkpoints` 等 v1 端点和旧 `/api/interview/` 端点并存

---

## 优先级排序（按影响 / 难度）

| 优先级 | 差距 | 涉及系统 | PRD 门槛影响 |
|:---:|:---|:---|:---|
| **P0** | Technical Verifier 只是 token overlap，不是真正的技术核验 | §10 | 严重技术误判率 ≤2% |
| **P0** | Judge Panel 是否真正 4 路独立模型并行 | §10 | Judge/专家相关性 ≥0.75 |
| **P0** | 知识库无图结构、无向量、无 Reranker | §9 | Citation 可定位率 ≥98% |
| **P1** | Skill Belief 不持久化，无法跨 session | §5.3 | 能力估计收敛 |
| **P1** | 双层 Evidence Pack 未真正融合 OmniMemory | §11.4 | 知识 grounding |
| **P1** | 模型路由无 task → model 细粒度映射 | §10.1 | 出题/评分模型隔离 |
| **P1** | 报告不引用 Evidence Ledger | §7.5 | 报告无支持结论率 ≤1% |
| **P2** | 评测闭环 / Gold 数据集 / 回放 | §5.4, §16 | 所有 MVP 门槛无法度量 |
| **P2** | OpenTelemetry / Phoenix 可观测性 | §10 | 运营监控 |
| **P2** | 招聘 blind 评估 + calibrationDelta 应用 | §13.3-4 | 合规风险 |
| **P2** | 知识运营后台 + 下架链路 | Phase 2 | 知识质量 |
| **P3** | Pause/Resume/SSE API | §7.3 | 产品完整性 |
| **P3** | 真实认证 + RBAC | §17 | 多租户 |
| **P3** | DSPy / 小模型训练闭环 | Phase 5 | 长期演进 |
| **P3** | 语音面试 STT/TTS | Phase 4 | 本阶段明确非目标 |

---

## 总结

Agent Graph 模块的完成是一个重要里程碑——18 节点、4 子图、checkpoint、time travel、human review 中断等 PRD §5.1 要求的核心能力基本到位。但这只覆盖了 PRD "四类 Graph" 中的**第一类（Agent 执行图）**。

接下来的关键战役是：

1. **让知识真正工作**：从 token overlap → 真正的技术核验；从 flat JSONL → 有边关系的知识图；从单层检索 → 双层 Evidence Pack
2. **让评估真正独立**：4 路 Judge 用不同模型族；Technical Verifier 接知识库；聚合器由代码控制
3. **让状态真正持久**：skill_beliefs + evidence_ledger 独立表；跨 session 能力趋势；Bayesian 更新
4. **让评测真正闭环**：Gold 数据集 + 自动化 MVP 门槛度量 + 回放能力

PRD §20 的最终产品定义——"岗位权威知识 + OmniMemory + 能力信念 + 声明式 Graph + 多 Judge"——目前完成了 Graph + 部分多 Judge + OmniMemory 骨架，**知识层和评估层是最大的待补齐短板**。
