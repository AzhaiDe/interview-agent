# OfferPilot PRD / 技术架构对照审计

> 审计日期：2026-08-12  
> 对照文档：`OFFERPILOT_AGENT_3_PRD.md`、`OFFERPILOT_TECHNICAL_ARCHITECTURE.md`  
> 对照对象：当前 `src/`、`knowledge-base/`、`evals/`、`package.json` 和测试结果

> **评估修订（2026-08-12）**：RAG 架构已调整为“OmniMemory 候选人长期记忆 + OfferPilot 本地权威岗位知识库”。因此，Milvus、MongoDB、Elasticsearch 不再是当前成熟度的必选缺口；真正缺口是双层证据融合、来源状态、专家 Gold、隔离、评测和生产业务数据层。

## 1. 总结结论

当前版本已经完成的是：

- 新面试运行时已接管 `/api/interview` 和 `/api/v1/interviews`；
- 有显式的运行时状态、节点名、Trace ID、能力状态、证据账本和 Checkpoint 表；
- 能从本地知识库读取岗位能力、概念、问题和来源；
- 有确定性证据抽取、压力策略、下一题生成和基础 Judge；
- 简历、招聘、文件存储、PII、幂等和 SQLite 持久化已有可运行基础；
- `npm run check`、`npm run build`、`npm test`、`npm run kb:validate` 已通过。

但这仍然是“可运行的 Graph Runtime MVP”，不是 PRD 和技术架构中定义的成熟完整产品。当前完成度估计：

| 维度 | 当前状态 | 完成度判断 |
|---|---|---|
| 旧 Workflow 替换 | 已切断生产入口 | 70% |
| Graph Runtime | 有显式节点/边清单、checkpoint、Human Review 阻断和运行时状态；尚非正式图执行器 | 60% |
| 岗位知识库 | 有 JSONL 候选资产、verified 门禁，尚未 Gold | 35% |
| 双层 RAG | OmniMemory hybrid + 本地词法/关系 Evidence Pack 已接入 runtime；尚未完成融合评测 | 50% |
| 多 Agent 分工 | 集中在一个 `agent-runtime.ts` | 25% |
| Judge Panel | 一个模型多次调用 + 确定性评分，未隔离 | 25% |
| 能力模型 | 有简单均值/不确定度更新，无 IRT/BKT 校准 | 35% |
| 自适应选题 | 已有可解释 Utility、Session Critic 已接入 API，尚未离线策略评估 | 45% |
| 评测体系 | 只有 Silver，Gold 为空 | 20% |
| 生产数据层 | SQLite + outbox；OmniMemory 外部托管记忆已接入 | 35% |
| 招聘闭环 | 基础流程存在，未达到合规生产评估 | 45% |
| 语音面试 | 未实现 | 0% |
| 安全/多租户 | 有基础防护，未达到生产级身份和租户体系 | 30% |

整体判断：**已进入可验证的双层记忆 Graph MVP，但仍不适合宣称已经完成 PRD 中的成熟智能面试产品。**

## 2. 关键事实证据

### 已经真正接入的部分

- 服务端已统一引用 `src/agent-runtime.ts`，不存在旧 workflow 生产入口。
- 旧 `src/interview-workflow.ts` 已删除，生产 API 不再导入它。
- `graph_checkpoints` 表已经创建，并提供 `/api/v1/interviews/:id/checkpoints`。
- `agent-runtime.ts` 已维护 `graphVersion`、`kbVersion`、`node`、`traceId`、`beliefs`、`evidenceLedger` 和 `retrievalTrace`。
- 新增测试覆盖 Graph opening、证据抽取、能力状态和报告生成。

### 历史遗留清理结果

- `src/engine.ts`、`src/interview-planner.ts`、`src/growth.ts` 已删除；
- 对应历史测试已迁移/删除；
- 旧编译产物也已清理；
- 当前生产入口统一使用 `src/agent-runtime.ts`。

## 3. 按 PRD 章节对照

### 3.1 四类 Graph

| PRD 目标 | 当前实现 | 判定 | 缺口 |
|---|---|---|---|
| Agent 执行图 | `agent-runtime.ts` 中以函数顺序模拟节点 | 部分实现 | 没有正式 Node/Edge 注册、条件边对象、子图、并行节点、可视化和 time travel |
| 岗位能力知识图 | JSONL 中有 role/entity/source 字段 | 部分实现 | 没有图数据库/关系表运行时，能力—概念—问题—误区—故障之间没有可查询边 |
| 候选人能力状态图 | `beliefs` 和 `evidenceLedger` 存在 | 部分实现 | 没有独立表、版本化事件、反证更新、跨场合并、可信区间和回放 |
| 评测与学习图 | `judgeRuns`、retrievalTrace` 嵌在 session JSON | 部分实现 | 没有独立评测事件流、Prompt 对比、模型重跑、人工修正回写和产品统计闭环 |

### 3.2 Agent 角色

| Agent | 当前情况 | 判定 |
|---|---|---|
| Resume Intelligence | 现有 `resume-workflow.ts` 能做简历解析和引文校验 | 部分实现 |
| Job Intelligence | `recruiter-agent.ts` 能分析 JD | 部分实现 |
| Interview Director | 没有独立模块；`chooseSkill` 和 `strategy` 在 runtime 内 | 未完成 |
| Knowledge Retrieval | 本地数组 `filter/slice` | 未完成 |
| Question Composer | `compose()` 是代码模板，不是受计划约束的独立模型节点 | 部分实现 |
| Question Guard | 旧 guard 已删除；新 runtime 只有模板去重和基础规则 | 部分实现，质量不足 |
| Evidence Extractor | 正则关键词抽取 | MVP 实现 |
| Technical Verifier | 没有真正用知识事实核验回答；模型只看到概念级上下文 | 未完成 |
| Judge Panel | 确定性 Judge + 同一个 ModelGateway 多次调用 | 部分实现，未达到架构要求 |
| Ability Updater | 有简单均值和 uncertainty 更新 | MVP 实现 |
| Session Critic | 没有独立 critic 节点 | 未完成 |
| Career Coach | 报告规则生成，未接入独立 Coach Agent | 部分实现 |

### 3.3 压力面试模型

已实现：`specificity`、`ownership`、`mechanism`、`tradeoff`、`metric`、`failure` 等策略，以及压力等级影响深度。

未实现：

- 用户疲劳模型和中断保护；
- 时间压力与语音停顿策略；
- 策略效果评估；
- 过度压力检测；
- 压力策略与用户历史表现的个性化校准；
- 人格攻击、敏感属性和不专业表达的系统级 Guard 测试。

当前压力更多是“模板选择”，还不是基于能力不确定度和信息增益的压力控制器。

### 3.4 自适应选题

PRD 要求：

```text
information gain × role importance × uncertainty × relevance × verifiability × difficulty fit
```

当前只实现了：按 `meanLevel` 和 `uncertainty` 排序选择较弱能力，再按缺失证据选择策略。

尚未实现：

- 候选问题的 Utility 计算；
- 问题区分度和难度校准；
- 重复惩罚的语义模型；
- 用户疲劳成本；
- 预计信息增益；
- 多轮行为数据反馈；
- IRT/BKT/Contextual Bandit；
- 离线策略评估。

因此当前是“弱能力优先规则”，还不是自适应面试策略模型。

## 4. 知识库差距

### 4.1 数量达标不等于内容达标

当前生成器使用少量 canonical 概念循环生成 150 条记录，并对问题、追问、误区和故障做模板扩展。严格 Judge 已发现：

- 1,241 条重复内容；
- 312 条自动概念变体；
- 450 条评分锚点缺乏专家盲审。

因此 `generated/` 的数量满足 PRD 计数，但不能当作 450 个独立、正确、可教学的技术概念，也不能当作 Gold 数据。

### 4.2 当前是双层 RAG，还不是完整生产级 RAG

新的技术架构要求：

```text
OmniMemory hybrid（个人记忆）
+ Local KB verified/关系邻居（岗位事实）
→ owner/status/source 过滤
→ provenance 去重
→ 双层 Evidence Pack
```

当前实现已经具备：

```text
OmniMemory hybrid retrieval
+ local role/status lexical retrieval
+ relationship neighbors
+ source/event trace
```

仍缺少：

- 本地 KB 的持久化索引和规模化 FTS；
- 个人记忆与岗位事实的 RRF/融合评测；
- embedding/reranker（只有离线评测证明必要时才引入）；
- 来源版本、有效期和删除传播；
- Evidence Pack 与 OmniMemory `memory/pending_message` 分层已接入但仍需完整质量评测；
- Recall@K、MRR、nDCG 检索评测；
- 运行时只允许 verified 或人工批准 candidate 的完整过滤。

### 4.3 Technical Verifier 还没有真正成立

当前模型 Judge 接收 `skill`、回答和 rubric，但没有把概念的官方事实、误区、边界和故障记录组成结构化 Citation Pack。因此它无法稳定回答：

- 候选人的技术声明是否被官方事实支持；
- 哪个具体句子错误；
- 在什么版本/条件下才成立；
- 对应哪个误区和故障场景。

这也是当前最严重的智能质量缺口之一。

### 4.4 OmniMemory 接入差距

当前 `src/omnimemory.ts` 已支持 hybrid retrieval、异步 ingest outbox、job 轮询、PII 脱敏和设备隔离基础逻辑。距离成熟接入还差：

- 对 `source=memory` 与 `source=pending_message` 的严格置信度分层；
- 统一保存 `job_id`、`event_id`、`atomic_facts`、`timestamp` 和请求追踪 ID；
- 稳定且不可猜测的 owner → deviceNo 映射；
- 连接失败、限流、熔断和重试策略；
- personal memory 与 local KB 的融合评测；
- API key 轮换、Secret 管理和泄漏应急流程。

OmniMemory 可替代候选人长期记忆检索基础设施，但不能替代 OfferPilot 的事务库、checkpoint、审计和岗位权威知识库。

## 5. 模型架构差距

### 5.1 模型角色没有真正隔离

技术架构要求 Router、Extractor、Director、Composer、Technical Judge、Evidence Judge、Consistency Judge、Communication Judge、Critic、Coach 分离。

当前：

- 只有一个 `ModelGateway`；
- `modelJudge()` 以不同 task 名称调用相同 Gateway；
- technical/evidence/communication 可能使用同一模型配置；
- consistency Judge 当前传入 `null`，并没有实际执行；
- Judge 不知道其他 Judge 的结论这一点尚未验证；
- 代码会把确定性 Judge 与模型 Judge 平均，缺少正式权重、分歧阈值和复核路由；
- 没有独立的 Router、Director、Critic、Coach 模型节点。

### 5.2 评分还不能作为可靠测量

当前分数由关键词覆盖、答案长度和模型分数混合产生；没有：

- 专家标注答案；
- 每能力的真实 L1–L5 正负例；
- 双专家盲审；
- 加权 Kappa/ICC；
- Judge-human correlation；
- Score MAE/校准曲线；
- 分群公平性分析；
- 低置信度强制人工复核。

当前的分数只能作为训练反馈，不应被解释成真实招聘概率或心理测量分数。

### 5.3 模型运行审计不完整

已有 `model_runs` 和 prompt version，但新 Runtime 还没有把：

- graph node；
- kb version；
- retrieval candidates；
- judge input hash；
- aggregate formula version；
- fallback reason；
- model isolation metadata

统一写入可查询 Trace。

## 6. 存储和基础设施差距

修订后的技术架构不要求当前部署 PostgreSQL、Milvus、MongoDB 或 Elasticsearch。当前目标是 OmniMemory 托管个人记忆、本地 KB 权威检索、SQLite 业务库和 outbox；生产多租户阶段再迁移 PostgreSQL，并按评测结果决定是否引入 FTS/vector/reranker。

当前 `package.json` 只有 Fastify、SQLite、Zod、文件解析等依赖；这与当前轻量部署目标一致。尚未具备：

- Redis/BullMQ；
- OpenTelemetry；
- Phoenix SDK；
- embedding/reranker 服务适配器。

当前 SQLite 适合本地单用户和测试，不满足：

- 多实例并发；
- 高可用；
- 读写分离；
- 数据库迁移治理；
- 多租户大规模业务查询；
- 跨租户复杂查询；
- Graph 事件和 Judge 结果独立分析。

## 7. API 和产品功能差距

### 已有

- 简历上传和分析；
- JD 创建和 Rubric 确认；
- 招聘简历上传和匹配；
- 文本面试开始、回答、结束、放弃；
- 面试历史和报告；
- Checkpoint 查询；
- 幂等回答接口。

### 缺少或不完整

- Graph 节点流式事件；
- SSE/WebSocket 实时状态；
- 用户暂停/恢复的真正 Graph 恢复；
- checkpoint 选择性回放和 time travel；
- 人工复核 API；
- Judge 分歧复核 API；
- 知识库运营后台；
- 来源下架和删除传播；
- 题目/概念/误区审核 API；
- Rubric 版本 diff；
- 候选人 Evidence Ledger 查看接口；
- 能力趋势接口；
- 训练计划完成和复测闭环；
- 语音上传、流式 STT/TTS 和文本纠错。

## 8. 招聘者功能差距

当前招聘工作流仍主要由 `recruiter.ts` 和 `recruiter-agent.ts` 驱动，具备 JD、简历和排序骨架，但离 PRD 还有：

- 岗位 Rubric 专家确认后的不可变版本；
- 证据化候选人分析与面试问题联动；
- 确定性基础分、模型发现、校准分三者分离存储；
- 人工排序调整记录；
- 自动拒绝禁止和人工审批；
- 群体公平性看板；
- 招聘结果审计；
- 候选人数据删除/导出闭环；
- 组织级多租户、成员权限和职位访问控制。

因此招聘模块是“可用的本地流程”，不是生产招聘评估系统。

## 9. 评测差距

当前 `evals/` 明确说明：

- 只有 Silver 数据集；
- Gold split 为空；
- 不能发布准确率、公平性或权威性声明；
- 没有三岗位专家签署的 Gold benchmark。

缺少的核心评测：

### 单轮

- 问题相关性；
- 语义新颖性；
- 简历 grounding；
- Evidence Extractor Precision/Recall/F1；
- Technical Verifier accuracy；
- Judge-human correlation；
- Score MAE；
- Citation hit rate；
- Judge disagreement；
- P95 latency 和成本。

### 整场

- 能力覆盖率；
- 项目连续深挖率；
- 每轮信息增益；
- 重复题率；
- 能力估计收敛；
- 报告事实一致性；
- 训练前后提升；
- 用户中断率和疲劳指标。

当前 16 个自动化测试证明工程没有明显回归，但不能证明 AI 质量已经达到 PRD 的发布门槛。

## 10. 安全、隐私和合规差距

### 已有

- 文件真实类型检查；
- PII 脱敏函数；
- 本地文件权限；
- 基础 CSP、安全 Header；
- ownerId 过滤；
- 记忆 Outbox 隔离测试；
- 审计日志和导出接口。

### 未达到成熟产品要求

- 真实登录、Session/JWT/OIDC；
- 组织、成员、职位、候选人 RBAC；
- PostgreSQL 行级租户隔离；
- 密钥管理和轮换；
- 服务端加密和 KMS；
- 录音和转写数据生命周期；
- 知识来源版权状态的运行时拒收；
- 模型供应商不训练配置的可验证记录；
- 删除传播到向量、缓存、Trace、备份；
- 供应商 DPA 和数据出境控制；
- 招聘使用场景的人工作出最终决定；
- 偏差和群体差异报告。

## 11. 语音能力差距

PRD 的 Phase 4 要求流式 STT、TTS、停顿/超时控制、实时字幕和低延迟追问。

当前状态：

- 没有音频输入 API；
- 没有 STT 供应商适配器；
- 没有 TTS；
- 没有 WebSocket/SSE 音频协议；
- 没有 partial/final transcript 状态；
- 没有语音错误不进入强评分的保护机制。

完成度为 0%，不能把当前文本面试称为语音压力面。

## 12. 生产成熟度分级

### 当前：架构验证版 / Internal MVP

可以做：

- 本地文本面试；
- 三岗位候选知识检索；
- 基础压力追问；
- 简历和 JD Demo；
- Graph 状态实验；
- 离线工程回归。

不可以做：

- 对外宣称评分有效；
- 自动筛选或淘汰候选人；
- 对三岗位知识覆盖做权威承诺；
- 使用未专家审核知识生成强技术结论；
- 以当前结果作为招聘决策依据。

### Beta：需要完成

- PostgreSQL/对象存储迁移，Redis 按吞吐需要引入；
- OmniMemory + Local KB 双层 RAG 的融合评测；
- 300–500 条 Gold 训练/评测轨迹；
- 每岗位专家盲审；
- 独立 Judge Panel；
- 人工复核和知识运营后台；
- 真实身份和多租户；
- 稳定性、成本、延迟压测。

### Production：还需要完成

- 语音链路；
- 招聘合规和公平性评估；
- 多实例高可用；
- 数据生命周期和灾备；
- 监控告警和 incident runbook；
- 版本化发布、灰度、回滚；
- 模型供应商故障切换；
- 持续训练闭环。

## 13. 推荐补齐顺序

### P0：先修复质量真实性

1. 停止把模板扩展条目当作独立知识；
2. 建立每岗位至少 300 条 Gold 问答/追问标注；
3. 补齐概念定义、反例、版本和官方来源；
4. 实现真正的 Citation Pack 和 Technical Verifier；
5. 让运行时过滤 `judge_status`，待审知识不能参与强评分；
6. 保持旧模块删除状态，避免重新引入两套面试语义。

### P1：完成可用的智能核心

1. 把 `agent-runtime.ts` 拆为 Director、Retrieval、Composer、Extractor、Judge、Updater、Critic 节点；
2. 继续拆分当前声明式 Graph Runtime；若工程收益明确，再引入 LangGraph.js；
3. 完成 OmniMemory personal memory + Local KB 的双层 Evidence Pack 和融合评测；本地 vector/FTS/Rerank 仅在评测证明必要时引入；
4. 独立存储 Evidence Ledger、Judge Runs、Beliefs、Checkpoints；
5. 实现 Judge 分歧复核、人工审核和回放；
6. 实现 Utility 选题和离线策略评估。

### P2：生产基础设施

1. PostgreSQL（替换 SQLite，支持多租户与并发）；
2. Redis/BullMQ（按吞吐和副本数引入）；
3. 私有对象存储；
4. OpenTelemetry/Phoenix；
5. OIDC/JWT、RBAC、多租户；
6. KMS、删除传播、备份恢复、审计查询；
7. 只有规模/评测需要时再引入 pgvector、OpenSearch 或独立 Reranker；不默认引入 MongoDB/Milvus。

### P3：产品完整度

1. 语音 STT/TTS；
2. 招聘者人工评估和公平性；
3. 训练计划完成和复测；
4. 题目/知识运营后台；
5. 模型成本和质量控制台；
6. 小流量灰度和版本回滚。

## 14. 最终判断

当前实现完成了“从旧 Workflow 切换到新 Graph Runtime 雏形”，但还没有完成 PRD 和技术架构定义的“完整模型产品”。最大的未完成项不是页面，而是四个核心生产能力：

```text
专家校准的权威岗位知识库
+ OmniMemory 个人长期记忆与严格 provenance
+ 双层可追溯 Evidence Pack
+ 多 Judge 评估
+ 可验证的能力与选题模型
```

如果只继续增加 Prompt 或题目数量，不能解决成熟度问题。正确的下一步应是：先把这四项做成可评测、可回放、可审核的闭环，再扩展语音、招聘和规模化部署。
