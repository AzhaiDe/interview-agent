# 原重构方案落实对照（本地 V3）

本文逐项对照最初的生产重构方案。结论中的“完成”指本地实现已经存在并通过测试；阿里云资源替换、域名、容器编排和公网安全属于上线阶段，不在本地完成范围内。

| 原方案能力 | 当前状态 | 当前实现 |
| --- | --- | --- |
| 移除 OpenClaw CLI | 完成 | 源码无 OpenClaw 运行依赖，直接调用百炼兼容接口。 |
| 统一 ModelGateway | 完成 | 快速/标准/推理路由、超时、Zod、一次 FAST JSON 修复、降级。 |
| Prompt Registry | 完成 | 7 份提示词位于 `prompts/`，独立版本号进入模型审计。 |
| 模型调用审计 | 完成 | 记录 trace/request ID、模型、Prompt 版本、延迟、token、Schema、重试、fallback、错误码。 |
| 事实库与记忆分离 | 本地完成 | SQLite 是事实库；OmniMemory 只保存脱敏长期摘要。上线时把 SQLite 适配为 PostgreSQL。 |
| 简历强结论可追溯 | 完成 | EvidenceClaim 带经历 ID、原文、字符区间、置信度和 proven/unknown/not_proven/needs_verification。 |
| 固定权重岗位推荐 | 完成 | 代码按 30/25/20/15/10 计算，不采用模型自由总分。 |
| PDF/DOCX/TXT/MD | 完成 | 真实文件内容检测，文本 PDF 解析，DOCX 提取。 |
| 扫描 PDF OCR | 已实现 | PDF 渲染 + Tesseract.js；页数、开关和语言可配置。首次中文 OCR 需要下载语言数据。 |
| 简历异步分析 | 完成 | `/api/v1/resumes/:id/analyze` 返回持久化 task。 |
| 简历长期画像 | 完成 | 仅写已证明能力、风险与岗位建议，不写完整简历。 |
| 显式面试状态机 | 完成 | created/opening/asking/evaluating/generating_next/finishing/completed/failed/abandoned。 |
| evaluation 与 nextQuestion 分离 | 完成 | 评价锁定上一题的 question/topic/skill，下一题独立保存。 |
| 固化 RoleRubric | 完成 | 权重、证据期待、覆盖计划、范围和版本随 session 保存。 |
| 确定性面试守卫 | 完成 | 相关性、深度、澄清、单能力轮次、题量、必考覆盖、越界和单问题限制。 |
| 自适应项目深挖 | 完成 | session 固化焦点经历；根据职责、机制、权衡、指标、验证和异常证据决定继续追问或转场。 |
| 重复问题防护 | 完成 | 对历史问题计算规范化二元组相似度；拒绝重复题和“切换到岗位能力”固定话术。 |
| 多面试类型 | 完成 | 综合技术面、项目深挖、技术原理专项和系统设计已贯通前端、API、session、Prompt 与规划器。 |
| 压力等级进入策略 | 完成 | 影响评分惩罚、证据标准、澄清次数、深度、场景题间隔和追问模板。 |
| 确定性报告事实 | 完成 | 覆盖率、能力分、趋势、未覆盖、简历已写但回答薄弱、岗位缺口、90 秒模板和建议压力由代码计算，模型不能覆盖。 |
| JD Analyst + 人工确认 | 完成 | JD 先保存 draft，未确认返回 409；确认版才能匹配。 |
| 单候选人独立取证 | 完成 | 每份简历只接收统一 JD，不接收其他候选人数据；引文带字符范围。 |
| 代码评分 + 模型语义增强 | 完成 | 分数、动作和排序由可回归的确定性策略裁决；模型负责语义取证、反馈、风险解释和追问措辞，不得越过录用阈值。 |
| 匿名横向比较 | 完成 | Match 模型只接收候选人 ID 和证据化维度，不发送姓名/学校。 |
| 异步并发招聘任务 | 本地完成 | SQLite 持久任务、可配置并发、重启恢复、前端轮询。上线替换 BullMQ/Redis。 |
| OmniMemory HTTP | 完成 | hybrid retrieval、ingest、ingest job 查询，不依赖 MCP。 |
| 记忆隔离与防注入 | 完成 | 稳定 device、限定 group、Top 5、去重、截断、脱敏，并显式标为不可信历史上下文。 |
| Outbox/幂等/终态/死信 | 完成 | commit ID、重试、job 轮询、succeeded 和 dead_letter，后台定时调度。 |
| 分析和业务数据版本化 | 完成 | 简历分析、Rubric、问题、回答、评价、报告、模型调用分别持久化。 |
| 回答幂等键 | 完成 | V1 回答接口强制 `Idempotency-Key`，相同请求重放原响应，不同请求复用返回 409。 |
| 数据导出和简历删除 | 完成 | `/api/v1/me/export`；删除简历会软删除业务记录并删除本地原文件。 |
| 审计日志 | 完成 | 上传、分析、面试、Rubric 确认、匹配和删除等关键动作落库。 |
| Gold 权威基线 | 流程完成、数据待人工 | Silver 可执行；Gold 协议已建立，但必须由真实合格标注员双标、仲裁和签字，不能由代码伪造权威性。 |
| 真实多用户认证/RBAC | 上线阶段 | 当前明确使用 `local-user/local-org`。上线前接入 JWT/Session、组织成员和 RBAC。 |
| PostgreSQL/Redis/OSS | 上线阶段 | 当前分别使用 SQLite、SQLite durable task、本地私有目录；领域边界已拆开。 |
| 病毒扫描、WAF、SLS、Sentry | 上线阶段 | 需要对应云服务与公网入口后配置。 |
| 百炼/OmniMemory 实网验收 | 本地实网完成 | `qwen3.7-plus` 完整 live Silver 44/44 Schema 合法、0 fallback；OmniMemory ingest 到 succeeded，检索严格按 device/group 过滤。 |

## 当前仍不能作出的质量声明

- Silver 是开发回归集，不是权威 Gold。
- 离线面试策略的下一能力选择和分数校准仍需真实标注数据优化。
- 招聘排名只能作为人工辅助，不应自动拒绝候选人。
- 当前 live 指标只证明本地实网链路与 Silver 回归稳定，不等于真实用户 Gold 质量或公网生产验收。

## 2026-07-30 本地实网验收记录

- 模型：`qwen3.7-plus`，结构化 JSON，关闭深度思考以控制交互延迟。
- 调用审计：44 次调用全部 Schema 合法，0 fallback，1 次自动修复；平均 10.7 秒。
- 简历：skill F1 0.897，证据落地率 1.0，unsupported claim 0。
- 面试：动作准确率 0.8，answered-skill 1.0，分数区间命中 0.8，MAE 0.65。
- 招聘排序：nDCG@5 1.0。
- 说明：以上是冻结 Silver 合成集；memory Gold track 尚未建立隔离测评租户，因此不报告 Recall/MRR。

## 2026-07-30 自适应追问修复

- 基于真实会话复现并修复连续两次“实验设计与指标”固定模板问题。
- 转场改为按本轮计数生效后的覆盖状态选择下一能力，避免重复选中当前能力。
- 压力 3 的项目型问题默认连续核验至少 2 轮；项目深挖模式至少 3 轮，再依据证据充分度换角度。
- 开场题中的数字必须能在简历原文找到；否则拒绝模型问题并使用证据化后备题。
- 新增追问、去重和面试模式测试；总计 13/13 通过。离线 Silver 面试动作准确率提升为 1.0，MAE 仍为 0.65。
