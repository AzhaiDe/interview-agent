# Expert Review Gate

`decisions.jsonl` 只接受人工独立评审结果，不能由生成脚本自动填写。每条记录需要：

```json
{"entity_id":"CONCEPT-...","reviewer_id":"expert-backend-01","decision":"approve","score":4,"reason":"...","evidence_source_ids":["SRC_OFFICIAL_DOCS_001"],"reviewed_at":"2026-08-12T00:00:00Z"}
```

每个实体至少需要两名不同 reviewer；`approve` 才能进入 `verified`。任意 `reject` 或缺少证据时保持 `pending_expert_review`。
