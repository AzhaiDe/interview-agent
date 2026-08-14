# OfferPilot × OmniMemory：RAG 重新评估

更新时间：2026-08-12

## 结论先行

可以接入 OmniMemory，而且当前产品不需要再自行部署 Milvus、MongoDB、Elasticsearch 才能获得“长期记忆 + 混合检索”。OmniMemory 已经通过托管 API 提供 ingest、异步记忆固化、时序知识图谱、语义+关键词 hybrid retrieval 和 evidence_details。

但 OmniMemory 不能替代 OfferPilot 的全部数据层：

- 候选人的面试历史、偏好、薄弱点、已验证/待验证事实：适合放进 OmniMemory，作为个人/会话长期记忆。
- 产品的 4616 条岗位知识、评分锚点、问题原型、追问策略、误区和故障场景：仍应保留在 OfferPilot 自己的“权威知识库”，因为它们需要审核状态、版本、角色过滤、来源、晋级和离线评测。
- OfferPilot 自己的 SQLite/Postgres 仍需要保留，用来保存会话、checkpoint、幂等键、审计日志、上传文件元数据和 memory outbox；OmniMemory 不是事务数据库。

推荐采用双层检索，而不是把所有内容混在一个记忆空间：

```text
用户回答/面试事件
        │
        ├── 写入本地事务库：session、transcript、checkpoint、audit、outbox
        ├── 异步写入 OmniMemory：候选人长期记忆 / 个人化经验 / 历史薄弱点
        └── 权威知识库：verified 岗位知识、评分锚点、追问策略

当前问题
   ├── OmniMemory hybrid retrieval（个人经历与历史记忆）
   └── OfferPilot KB retrieval（岗位知识与证据来源）
                 ↓
       Evidence Pack + 来源/状态/租户校验
                 ↓
           三路 Judge 与 Graph Runtime
```

## 对本地 OmniMemory 项目的分析

本地 `omnimemory-space` 的客户接入手册和客户端实现显示：

1. `POST /api/v2/memory/ingest` 是异步写入，返回 `job_id`；不能把 202 当作已完成。
2. 新接入应使用 `POST /api/v2/memory/retrieval/hybrid`，返回 `evidence_details`，其中 `source=memory` 表示已固化记忆，`source=pending_message` 表示仍是待固化原始消息。
3. `X-Device-No` 是设备/用户隔离的关键边界；同一候选人必须稳定使用同一个不可猜测的 device number。
4. 接口提供证据 ID、正文、atomic facts、group_id、timestamp，适合映射到 OfferPilot 的 Evidence Pack，但必须保留 source 和 event_id，不能只取纯文本。
5. 本项目已有 outbox、异步提交、job 状态轮询、失败重试和 PII 脱敏；这部分应继续保留。

当前 OfferPilot 的 `src/omnimemory.ts` 已经接入 hybrid retrieval，但还需要修正/增强：

- 将 `x-api-key`/Bearer 鉴权、API base URL、超时、重试和响应 envelope 做成可配置 provider adapter。
- 将 `pending_message` 与 `memory` 分开标注；pending 证据不能直接作为高置信事实。
- 不把外部 `group_id` 当作安全边界，安全边界应由本地 owner/session 到稳定 deviceNo 的映射和服务器端校验共同保证。
- 记录 OmniMemory 的 `job_id`、`event_id`、source、timestamp 和 request_id，便于审计与重放。
- 生产环境不能使用仓库或 shell 中的明文 API key，必须使用部署平台 secret；当前在聊天中暴露过的 key 应立即在控制台轮换。

## 是否还需要 Milvus、MongoDB、Elasticsearch？

### 当前阶段：不需要

如果目标是让 OfferPilot 具备候选人长期记忆和面试上下文召回，直接调用 OmniMemory 即可，不必再部署：

- Milvus：不需要，OmniMemory 已经承担记忆检索基础设施。
- MongoDB：不需要，面试业务状态不是文档数据库问题，当前 SQLite 足够开发和单机部署。
- Elasticsearch：不需要，当前岗位知识规模约几千条，SQLite FTS/词法检索 + OmniMemory hybrid 已足够验证产品。

### 什么时候才需要引入它们

| 组件 | 只有在以下条件成立时才考虑 | 当前判断 |
|---|---|---|
| Milvus/pgvector | 自己托管 embedding、需要跨大量权威文档做 ANN、或必须掌控向量索引与成本 | 暂不引入 |
| Elasticsearch/OpenSearch | 需要复杂全文检索、中文分词、聚合分析、海量日志/文档搜索 | 暂不引入 |
| MongoDB | 业务模型大量非结构化文档且不适合关系事务 | 不建议引入 |
| Redis | 多副本限流、缓存、队列或后台 worker 协调 | 生产化时可引入，但不是 RAG 必需品 |
| Postgres | 多租户、并发 checkpoint、审计、RBAC、报表和事务要求上升 | 生产部署阶段替换 SQLite |

## 推荐的最终 RAG 方案

### 1. 双层知识边界

`OmniMemory` 是 Personal/Session Memory；`OfferPilot KB` 是 Curated/Authoritative Knowledge。两者不能因为都能检索就混为一个事实源。

### 2. 检索流程

```text
query rewrite
  ├── personal query → OmniMemory hybrid
  └── role/skill query → local KB retrieval
        ↓
normalize evidence
        ↓
deduplicate by event_id/entity_id
        ↓
source/status/owner filter
        ↓
confidence + provenance scoring
        ↓
Evidence Pack
```

### 3. 事实优先级

1. 本地 KB `verified` + 有来源：可作为岗位事实。
2. OmniMemory `source=memory`：可作为候选人历史记忆，但仍需与本轮回答交叉验证。
3. OmniMemory `source=pending_message`：仅作为线索，不能支撑“已证明能力”。
4. 本地 KB `candidate/pending`：仅用于训练问题生成，不能进入 factual judge context。

### 4. 不建议的方案

- 把全部岗位知识批量 ingest 到同一个候选人 device 中；会造成个人记忆与权威知识污染。
- 仅把 `evidence_details[].text` 拼进 prompt，丢失 source、event_id、timestamp 和 atomic_facts。
- 让 OmniMemory 替代本地 checkpoint、审计、幂等和数据保留策略。
- 为了“看起来像完整 RAG”而提前部署 Milvus/Mongo/ES；这会增加运维面，却不解决当前知识审核和评测问题。

## 分阶段落地

### Phase A：当前就做

- 轮换已暴露 API key，并只放入 `OMNIMEMORY_API_KEY` secret。
- 将 OmniMemory adapter 的返回值标准化为 `MemoryEvidence`。
- 将 `memory` 与 `pending_message` 分层，接入当前 Evidence Pack。
- 增加 OmniMemory connectivity、ingest job、retrieval provenance 和隔离测试。
- 继续使用本地知识库，不引入 Milvus/Mongo/ES。

### Phase B：生产化

- SQLite → Postgres；Redis 仅用于队列、限流和短缓存。
- 增加本地 KB 的 BM25/SQLite FTS；只有离线评测证明词法不足时再加入 pgvector。
- 用 RRF 融合 OmniMemory personal hits 与本地 KB hits，但保留 source 分层，不能只按分数混排。
- 建立 offline retrieval/evidence judge，测 recall@k、MRR、unsupported-claim rate、personalization hit rate 和隔离失败率。

### Phase C：规模化后再评估

- 文档量达到百万级、需要自托管向量或严格数据驻留时，再评估 Milvus/pgvector。
- 需要复杂全文分析、运营检索和聚合时，再评估 OpenSearch。
- 不建议为本产品默认引入 MongoDB。

## 最终判断

OmniMemory 可以替代“候选人长期记忆 RAG 基础设施”，但不能替代“岗位权威知识库、业务事务库和审计库”。因此当前最合理的架构是：

**OmniMemory 托管记忆 + 本地权威 KB + SQLite（后续 Postgres）业务库 + Agent 层 Evidence Pack 融合。**

在这个方案下，当前阶段不需要部署 Milvus、MongoDB 或 Elasticsearch。
