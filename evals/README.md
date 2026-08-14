# Gold Dataset

评估数据集，用于验证 Agent Graph 的正确性和质量。对齐 PRD §16.3 要求。

## 目录结构

```
evals/
├── resumes/
│   └── gold-resumes.ts          # 10 个样本简历（不同角色、经验水平）
├── jds/
│   └── gold-jds.ts              # 10 个样本 JD（不同岗位、级别）
├── questions/
│   └── gold-questions.ts        # 100 个标注问题（6 种策略、证据期待）
├── answers/
│   └── gold-answers.ts          # 200+ 个标注答案（质量分级、预期分数）
├── trajectories/                # 面试轨迹（待补充）
└── eval-runner.ts               # 评估运行器
```

## 数据格式

### 简历（Resume）

```typescript
{
  id: string;
  rawText: string;              // 原始简历文本
  targetRole: string;           // 目标岗位
  skills: string[];             // 技能列表
  experiences: Experience[];    // 项目经历
}
```

### JD（Job Description）

```typescript
{
  id: string;
  title: string;                // 岗位名称
  level: string;                // 级别（Junior/Mid/Senior/Staff）
  jdRaw: string;                // 原始 JD 文本
  mustHave: string[];           // 必备技能
  niceToHave: string[];         // 加分技能
}
```

### 标注问题（Annotated Question）

```typescript
{
  id: string;
  text: string;                 // 问题文本
  skill: string;                // 目标技能
  strategy: "ownership" | "specificity" | "mechanism" | "tradeoff" | "metric" | "failure";
  requiredEvidence: string[];   // 期待的证据类型
  difficulty: number;           // 难度（1-5）
  questionType: "project_followup" | "knowledge" | "scenario" | "behavioral";
}
```

### 标注答案（Annotated Answer）

```typescript
{
  id: string;
  questionId: string;           // 关联的问题 ID
  text: string;                 // 答案文本
  expectedScore: number;        // 预期分数（0-10）
  expectedEvidence: string[];   // 预期覆盖的证据
  expectedMissing: string[];    // 预期缺失的证据
  expectedVerdict: "supported" | "partial" | "insufficient" | "incorrect";
  quality: "strong" | "medium" | "weak" | "off_topic" | "injection";
}
```

## 使用方法

### 运行评估

```bash
# 运行所有评估
npm run eval:gold:static

# 运行前 10 个评估
npm run eval:gold:static -- --limit 10

# 只运行高质量答案
npm run eval:gold:static -- --category strong

# 只运行弱质量答案
npm run eval:gold:static -- --category weak
```

### 评估指标

评估器会计算以下指标：

1. **分数准确性**：实际分数与预期分数的差异（容忍度 ≤ 1.5）
2. **证据精确率**：实际覆盖的证据中，有多少是预期的
3. **证据召回率**：预期的证据中，有多少被覆盖（阈值 ≥ 0.6）
4. **Verdict 准确率**：实际判定与预期判定的一致性

### 通过标准

单个评估通过条件：
- 分数差异 ≤ 1.5
- Verdict 匹配
- 证据召回率 ≥ 0.6

整体评估通过条件：
- 通过率 ≥ 70%

## 数据质量要求

### 答案质量分级

- **strong**：包含完整的职责、机制、指标、验证证据，分数 7-10
- **medium**：部分证据覆盖，分数 5-7
- **weak**：证据不足或模糊，分数 3-5
- **off_topic**：跑题，分数 0-2
- **injection**：注入攻击，分数 0

### 证据类型

对齐 PRD §6.7 的 12 种证据类型：

1. `personal_responsibility` - 个人职责
2. `input_output` - 输入输出
3. `technical_actions` - 技术动作
4. `causal_relations` - 因果关系
5. `alternatives` - 替代方案
6. `metrics` - 指标数据
7. `samples_and_baselines` - 样本与基线
8. `validation_methods` - 验证方法
9. `exception_handling` - 异常处理
10. `uncertainty` - 不确定性
11. `conflicts_with_prior` - 与先前矛盾
12. `boundary_conditions` - 边界条件

## 扩展数据集

### 添加新的标注问题

在 `evals/questions/gold-questions.ts` 中添加：

```typescript
{
  id: "q-XXX",
  text: "你的问题文本",
  skill: "目标技能",
  strategy: "ownership",  // 6 种策略之一
  requiredEvidence: ["职责边界", "实现机制"],
  difficulty: 3,
  questionType: "project_followup",
}
```

### 添加新的标注答案

在 `evals/answers/gold-answers.ts` 中添加：

```typescript
{
  id: "a-XXX-Y",
  questionId: "q-XXX",
  text: "答案文本",
  expectedScore: 7.5,
  expectedEvidence: ["职责边界", "实现机制"],
  expectedMissing: ["指标与口径"],
  expectedVerdict: "supported",
  quality: "strong",
}
```

### 标注流程

1. 选择问题和答案对
2. 独立评估答案质量（至少 2 名标注员）
3. 记录预期分数、证据覆盖、verdict
4. 如有分歧，由第 3 名标注员仲裁
5. 更新 `gold-answers.ts`

## 与现有评估基础设施的关系

本数据集与现有的 `evals/scripts/` 基础设施互补：

- **现有流程**：收集真实面试轨迹 → 生成候选标注 → 人工验证 → Gold 数据集
- **本数据集**：静态标注的问题/答案对 → 直接评估 → 快速回归测试

两者结合使用：
- 静态数据集用于快速回归测试和单元测试
- 动态轨迹用于真实场景评估和持续改进

## 参考

- PRD §16.3 - Gold 数据集建设要求
- Architecture §8.2 - 错误降级策略
- GOLD_BUILD_PROTOCOL.md - Gold 数据集构建协议
