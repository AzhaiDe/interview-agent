# Interview Agent 架构升级实施记录

## 阶段总览

1. **Phase 0：基线冻结与运行时开关**（当前）
2. **Phase 1：PostgreSQL 业务层与迁移基础设施**
3. **Phase 2：LangGraph V2 七节点主图与 PostgreSQL Checkpointer**
4. **Phase 3：证据、信念、Review、Worker 与前端闭环**
5. **Phase 4：Shadow/灰度、验收与 Legacy 清理**

## Phase 0 约束

- 默认值保持 `INTERVIEW_GRAPH_ENGINE=legacy`、`DATABASE_DRIVER=sqlite`，现有行为不切换。
- `langgraph` 与 `postgres` 只作为已定义的迁移目标，不在本阶段引入依赖或改变数据写入。
- 健康检查和会话序列化会暴露当前 engine，便于部署探针、日志和灰度审计。
- 未知环境变量值安全回退到 legacy/SQLite，避免错误配置直接阻断启动。

## 运行时开关

```bash
INTERVIEW_GRAPH_ENGINE=legacy|langgraph|shadow
DATABASE_DRIVER=sqlite|postgres
```

## 回滚边界

任何阶段出现异常时，将 `INTERVIEW_GRAPH_ENGINE=legacy` 与 `DATABASE_DRIVER=sqlite`，重启服务即可回到当前实现。Phase 1 之后仍保留 SQLite 只读/回滚窗口，直到 Phase 4 验收完成。

## 当前基线

- 旧图仍是唯一执行路径。
- 公开 API 路径和响应字段保持兼容，仅新增 `capabilities.graphEngine` 与 `graph.engine`。
- 不删除旧表、不改写历史数据、不改变认证和前端流程。

## Phase 1 已落地内容

- 引入 `pg` 连接池封装：`src/postgres.ts`。
- 增加 PostgreSQL 初始 schema：`db/postgres/001_initial.sql`，覆盖用户、简历、面试、任务、证据、记忆 outbox、审计和幂等数据。
- 增加事务化迁移命令：`npm run db:migrate:postgres`。
- PostgreSQL checkpointer 所需的 `thread_id + checkpoint_id` 唯一约束已预留。
- 当前业务仓库仍使用 SQLite；Phase 1 不会在没有完成双写/回迁验证前切换生产读写。

### Phase 1 回滚

删除/停用 `DATABASE_URL` 不会影响 SQLite；将 `DATABASE_DRIVER=sqlite` 保持默认即可。PostgreSQL 迁移只创建目标库对象，不会修改现有 SQLite 文件。

## Phase 2/3 已落地内容

- LangGraph V2 State 增加 `evidenceClaims`、`belief`、`review`、`memoryEventIds`，每次回答都有结构化证据输出。
- 低证据回答会进入 review gate；memory event 使用 `sessionId + round` 生成幂等 ID，供现有 memory outbox/worker 接入。
- 现有 `/api/v1` 仍由 legacy runtime 服务，V2 通过 manifest 和独立测试验证，Phase 4 才切换生产流量。

## Phase 4 已落地内容

- 新增 [graph-shadow.ts](/Users/azhai/Desktop/pressure-interview-agent/src/graph-shadow.ts)，按用户可见语义比较 legacy/V2，路由漂移和 review 漂移直接标为 blocking。
- 灰度最低 100 个样本，blocking drift 必须为 0，warning drift 不超过 5% 才允许切换。
- 新增 `/api/v1/graph/rollout-policy`，部署系统可直接读取当前 engine、验收门槛和回滚命令。
- Legacy 代码暂不删除；删除条件是连续一轮灰度达到门槛、PostgreSQL checkpoint 恢复演练通过、全量回归测试通过。

## 下一步执行命令

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://offerpilot:offerpilot-dev-password@localhost:5432/offerpilot npm run db:migrate:postgres
DATABASE_URL=postgresql://offerpilot:offerpilot-dev-password@localhost:5432/offerpilot npm run db:verify:postgres

SQLITE_DATABASE_PATH=/app/data-v2/offerpilot.sqlite \
DATABASE_URL=postgresql://offerpilot:offerpilot-dev-password@postgres:5432/offerpilot \
npm run db:migrate:sqlite-to-postgres
```

验证成功后，再将后端部署环境中的 `DATABASE_URL` 指向 PostgreSQL；`DATABASE_DRIVER` 暂时保持 `sqlite`，因为业务仓库切换需要单独完成双读/回迁验证。
