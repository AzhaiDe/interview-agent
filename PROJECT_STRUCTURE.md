# OfferPilot V2 项目结构说明

本文按当前仓库实际结构说明每个业务目录和文件。`node_modules/` 属于 npm 自动安装的第三方依赖，不逐个解释其中的包文件；`dist/` 是 `src/` 的编译产物，两者存在一一对应关系。

## 根目录

| 文件 | 作用 |
| --- | --- |
| `.env.example` | 可复制为 `.env` 的配置模板，包含端口、SQLite、本地上传目录、百炼和 OmniMemory 参数，不包含真实密钥。 |
| `.gitignore` | 排除密钥、依赖、构建产物、运行数据库、上传文件和动态测评结果。 |
| `README.md` | 产品定位、架构、启动方式、API、测评方法和上云缺口的主文档。 |
| `PROJECT_STRUCTURE.md` | 当前文件，也就是逐目录、逐文件说明。 |
| `IMPLEMENTATION_STATUS.md` | 原始重构方案与当前本地实现的逐项符合度和剩余上线项。 |
| `package.json` | npm 项目信息、运行脚本及生产/开发依赖声明。 |
| `package-lock.json` | 锁定依赖的确切版本和完整依赖树，保证不同机器安装结果一致。 |
| `tsconfig.json` | TypeScript 编译规则；把 `src/**/*.ts` 编译到 `dist/`，使用 NodeNext ESM。 |

## `src/`：后端源代码

| 文件 | 作用 |
| --- | --- |
| `config.ts` | 加载 `.env`，统一提供服务端口、数据库、上传目录、百炼模型和 OmniMemory 配置；生成运行能力状态。 |
| `database.ts` | SQLite 数据访问层和表结构迁移，管理用户、简历、面试、岗位、招聘简历、匹配、任务、记忆 outbox、模型审计和上传文件元数据。 |
| `engine.ts` | 确定性面试状态机：创建会话、记录开场、把回答评价归到正确能力点、切换下一题、限制轮次并完成面试。 |
| `file-storage.ts` | 本地原始文件存储适配层；生成不可预测文件名、限制扩展名、计算 SHA-256、设置文件权限并登记数据库元数据。 |
| `growth.ts` | 根据逐轮诊断生成本地成长报告，包括能力维度、强弱项、训练问题和 7 天计划；也是模型不可用时的报告降级实现。 |
| `interview-workflow.ts` | 压力面试语义工作流：检索历史记忆、生成开场题、评价回答、决定追问/切换/结束、生成成长报告并写入记忆 outbox。 |
| `interview-planner.ts` | 自适应面试线程规划：管理项目锚点、证据缺口、连续深挖轮次、答案钩子、转场和问题相似度去重。 |
| `model-gateway.ts` | 百炼 OpenAI-compatible 网关；选择快/标准模型，执行超时控制、JSON 提取、Zod 校验、一次纠错重试和模型运行审计。 |
| `omnimemory.ts` | OmniMemory v2 HTTP 客户端；实现混合检索、脱敏 ingest、租户/group 过滤和 SQLite outbox 重试提交。 |
| `pii.ts` | 隐私工具；遮蔽邮箱、手机号、身份证号等敏感信息，并把内部用户 ID 转换为不可逆的设备标识。 |
| `pressure-policy.ts` | 1–5 级压力策略，控制评分严格度、场景题比例、追问深度和澄清次数。 |
| `prompt-registry.ts` | 加载和登记 `prompts/` 中的版本化系统提示词。 |
| `recruiter-agent.ts` | 招聘者模型工作流：JD 语义画像、单份简历取证、候选人横向校准；模型失败时调用确定性实现。 |
| `recruiter.ts` | 招聘端确定性基础引擎：识别 JD 技术要求、分析经历证据强度、计算六个维度得分并生成基础排名。 |
| `resume-workflow.ts` | 简历 Agent 工作流；先执行本地解析，再让模型做语义增强，并过滤无法在原文定位的证据引文。 |
| `resume.ts` | 简历文本基础解析器；提取教育、项目、实习、研究、技能、技术栈、量化证据、风险和岗位建议。 |
| `rubric.ts` | 根据目标岗位和简历生成面试能力 Rubric，判断问题是否越界，并选择覆盖不足的能力点。 |
| `server.ts` | Fastify 服务入口；注册静态资源和所有 API，执行请求校验、上传限制、安全响应头、演示限流、任务调度和错误处理。 |
| `types.ts` | 全项目领域类型，包括简历、经历、面试会话、回答评价、成长报告、岗位、招聘取证和排名。 |
| `vendor.d.ts` | 为没有完整 TypeScript 类型声明的 `pdf-parse` 补充最小类型定义。 |

## `public/`：浏览器前端

| 文件 | 作用 |
| --- | --- |
| `index.html` | 单页应用 HTML 外壳，加载前端脚本和各层样式。 |
| `app.js` | 前端状态与交互逻辑：页面切换、简历上传、面试问答、报告展示、招聘岗位/简历/任务轮询和本地 UI 状态保存。 |
| `styles-v2.css` | V2 主视觉系统和页面基础布局。 |
| `styles-overrides.css` | 对早期 V2 组件的通用覆盖和兼容修正。 |
| `styles-composer.css` | 简历上传、岗位配置和输入区域样式。 |
| `styles-recruiter.css` | 招聘者工作台、候选人列表、评分和排名样式。 |
| `styles-recruiter-fix.css` | 招聘端在窄屏及特殊布局下的补丁样式。 |
| `styles-interview-chat.css` | 压力面试聊天区、消息、进度、输入框和报告入口样式。 |

## `prompts/`：版本化模型提示词

- `resume/analysis.v3.md`：简历证据结构化。
- `interview/opening.v3.md`：面试开场题。
- `interview/evaluate-and-next.v3.md`：回答评价和下一题。
- `interview/growth-report.v3.md`：成长报告解释层。
- `recruiter/jd-analysis.v3.md`：JD Rubric 草案。
- `recruiter/resume-evidence.v3.md`：候选人独立取证。
- `recruiter/match-calibration.v3.md`：匿名横向校准。

## `data-v2/`：本地运行数据

| 文件或目录 | 作用 |
| --- | --- |
| `offerpilot.sqlite` | 当前本地业务数据库；包含已经迁移的旧岗位、简历和匹配结果以及 V2 运行数据。 |
| `offerpilot.sqlite-wal` / `offerpilot.sqlite-shm` | 服务运行时 SQLite WAL 模式自动产生的临时协作文件，正常关闭后可能消失。 |
| `uploads/candidate-resume/` | 求职者简历原文件目录，首次上传时自动创建。 |
| `uploads/recruiter-resume/` | 招聘者批量简历原文件目录，首次上传时自动创建。 |

`data-v2/` 已被 `.gitignore` 排除，因为它可能包含个人信息，不能提交到代码仓库。

## `dist/`：生产构建产物

`npm run build` 会把 `src/` 编译为这里的 JavaScript。`npm start` 实际执行 `dist/server.js`。

| 文件 | 对应源文件 |
| --- | --- |
| `config.js` | `src/config.ts` |
| `database.js` | `src/database.ts` |
| `engine.js` | `src/engine.ts` |
| `file-storage.js` | `src/file-storage.ts` |
| `growth.js` | `src/growth.ts` |
| `interview-planner.js` | `src/interview-planner.ts` |
| `interview-workflow.js` | `src/interview-workflow.ts` |
| `model-gateway.js` | `src/model-gateway.ts` |
| `omnimemory.js` | `src/omnimemory.ts` |
| `pii.js` | `src/pii.ts` |
| `pressure-policy.js` | `src/pressure-policy.ts` |
| `prompt-registry.js` | `src/prompt-registry.ts` |
| `recruiter-agent.js` | `src/recruiter-agent.ts` |
| `recruiter.js` | `src/recruiter.ts` |
| `resume-workflow.js` | `src/resume-workflow.ts` |
| `resume.js` | `src/resume.ts` |
| `rubric.js` | `src/rubric.ts` |
| `server.js` | `src/server.ts`，生产启动入口。 |
| `types.js` | `src/types.ts`；类型在编译后基本被擦除，因此文件内容很少。 |

## `scripts/`：运维与迁移脚本

| 文件 | 作用 |
| --- | --- |
| `migrate-legacy.ts` | 从外部旧版 `interviews.json`、`recruiter.json` 备份幂等导入 SQLite；仓库本身不再保存旧 JSON。 |
| `public-demo.sh` | 同时启动本地服务和 Cloudflare Quick Tunnel，用于临时公网演示；不属于正式生产部署方案。 |

## `tests/`：自动化测试

| 文件 | 作用 |
| --- | --- |
| `core.test.ts` | 验证 PII 脱敏、回答能力归因与下一题能力分离、SQLite 跨实例持久化。 |

## `evals/`：模型与工作流测评基线

| 文件 | 作用 |
| --- | --- |
| `README.md` | 测评分层、指标、命令和发布策略。 |
| `GOLD_BUILD_PROTOCOL.md` | 建立权威 Gold 集的双人标注、仲裁、冻结和签字流程。 |
| `SOURCES.md` | 外部数据源选择原则和来源说明。 |
| `sources.json` | 外部数据集的结构化来源、用途和许可证审查状态。 |
| `manifest.json` | 测评包版本和数据文件 SHA-256，用于发现基线被意外修改。 |

### `evals/datasets/`

| 文件 | 作用 |
| --- | --- |
| `external/README.md` | 外部公开数据的落盘与许可证要求；目前不直接随仓库分发数据集。 |
| `gold/README.md` | Gold 数据目录规则；当前没有未经人工签字的伪 Gold 数据。 |
| `silver/resume.jsonl` | 6 个简历证据抽取回归案例。 |
| `silver/interview.jsonl` | 10 个面试回答评分与下一步策略案例。 |
| `silver/ranking.jsonl` | 3 个岗位、15 名候选人的排序案例。 |
| `silver/memory.jsonl` | 6 个记忆检索、隔离和隐私案例。 |

### `evals/scripts/`

| 文件 | 作用 |
| --- | --- |
| `validate.mjs` | 校验 Silver 数据结构、标签范围、引用关系和 manifest 哈希。 |
| `run-silver.ts` | 调用当前 V2 工作流生成预测；默认离线降级，可使用 `--live` 测真实百炼配置。 |
| `score.mjs` | 计算简历 F1/证据率、面试准确率/MAE、排名 nDCG@5、记忆 Recall/MRR 和隔离违规。 |

### `evals/rubrics/`、`schemas/`、`results/`

| 文件 | 作用 |
| --- | --- |
| `rubrics/annotation-guide.md` | 人工标注员使用的标签定义、证据规则和争议处理说明。 |
| `schemas/predictions.schema.json` | 测评预测文件的 JSON Schema 契约。 |
| `results/predictions.example.json` | 合法预测格式示例。 |
| `results/latest.json` | 最近一次离线 Silver 执行结果；属于动态生成文件，不提交版本库。 |

## `tools/`：项目自带工具

| 文件 | 作用 |
| --- | --- |
| `cloudflared` | macOS ARM64 的 Cloudflare Tunnel 可执行文件，只供 `public-demo.sh` 创建临时演示链接。云服务器生产部署不使用它。 |

## `node_modules/`：第三方依赖

由 `npm install` 根据 `package-lock.json` 自动生成，主要包含 Fastify、SQLite、Zod、PDF 解析、TypeScript 和 tsx。它不是业务源码，可以随时删除并通过 `npm install` 恢复，且已被 `.gitignore` 排除。

## 主要运行关系

```text
public/index.html + public/app.js
        ↓ HTTP
src/server.ts
        ├─ src/resume-workflow.ts ─ src/resume.ts
        ├─ src/interview-workflow.ts ─ src/interview-planner.ts / engine.ts / growth.ts / rubric.ts
        ├─ src/recruiter-agent.ts ─ src/recruiter.ts
        ├─ src/model-gateway.ts ─ 百炼 API
        ├─ src/omnimemory.ts ─ OmniMemory API
        └─ src/database.ts + src/file-storage.ts ─ data-v2/
```
