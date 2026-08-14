# OfferPilot Interview Knowledge Base

这是 PRD Sprint 1–4 的本地知识库实现目录。它采用 JSON Schema + JSONL，便于 SQLite、Postgres、向量库或图数据库导入。

## 目录

- `schema/`: 所有实体的 JSON Schema 与字段约束。
- `seed/`: 可追溯的来源、岗位能力、技术概念、问题原型、追问算子、误区、故障场景与评分锚点种子。
- `generated/`: 由构建脚本生成的标准化 JSONL，不应手工编辑。
- `reports/`: 每次构建的数量、重复率、来源覆盖率和待审清单。
- `scripts/`: 构建、校验和统计脚本。

## 运行

```bash
npm run kb:build
npm run kb:validate
```

目标数量按 PRD 的“每个岗位”口径执行：每岗位 30 能力、150 概念、300 问题、600 追问、200 误区、100 故障；每项能力 5 个评分锚点。

## 证据状态

`verified` 只允许用于官方/标准/专家复核后的技术事实；社交媒体面经默认是 `candidate`，用于发现题目、追问和误区。没有人工专家盲审时，构建报告会明确显示 `pending_expert_review`，不会把候选素材伪装成 Gold 真值。

## 接入 Agent

应用侧应只检索 `generated/*.jsonl` 中 `status=verified` 或明确允许的 `candidate` 记录，并始终带回 `source_ids`。论坛原文、个人昵称、头像、联系方式和简历截图不进入运行时 Prompt。
