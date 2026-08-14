import type { ResumeProfile, RoleRubric, RoleSkill } from "./types.js";

const ROLE_PRESETS: Record<string, { mustHave: RoleSkill[]; niceToHave: string[]; outOfScope: string[] }> = {
  "算法": {
    mustHave: [
      { skill: "模型/算法原理", why: "算法岗需解释方法为何有效", askAngles: ["目标函数", "假设条件", "失败样本"] },
      { skill: "实验设计与指标", why: "没有口径的提升不可信", askAngles: ["基线", "数据集划分", "消融"] },
      { skill: "检索/召回或训练链路", why: "需把算法接到可落地系统", askAngles: ["输入输出", "延迟与召回权衡", "坏案例"] },
      { skill: "个人贡献边界", why: "校招需区分本人与团队", askAngles: ["负责模块", "代码边界", "决策点"] }
    ],
    niceToHave: ["特征工程", "线上监控", "数据飞轮", "重排模型"],
    outOfScope: ["操作系统内核细节", "前端样式实现", "与岗位无关的语言语法 trivia"]
  },
  "人工智能": {
    mustHave: [
      { skill: "模型/算法原理", why: "AI 岗需讲清方法机制", askAngles: ["训练目标", "归纳偏置", "泛化风险"] },
      { skill: "数据与评估", why: "模型效果取决于数据与指标", askAngles: ["标注质量", "指标选择", "分布偏移"] },
      { skill: "推理/检索系统", why: "多数校招项目落在应用系统", askAngles: ["链路拆分", "延迟", "错误归因"] },
      { skill: "个人贡献边界", why: "需证明独立技术贡献", askAngles: ["职责", "实现", "验证"] }
    ],
    niceToHave: ["Prompt/Agent 编排", "向量库", "微调", "评测集建设"],
    outOfScope: ["纯前端交互细节", "运维机房网络拓扑 trivia"]
  },
  "后端": {
    mustHave: [
      { skill: "接口与系统设计", why: "后端核心是稳定交付", askAngles: ["接口契约", "一致性", "幂等"] },
      { skill: "性能与可靠性", why: "线上系统要扛住故障与延迟", askAngles: ["P99", "限流", "降级"] },
      { skill: "数据存储与缓存", why: "多数问题落在存储取舍", askAngles: ["索引", "缓存一致性", "事务"] },
      { skill: "个人贡献边界", why: "校招需证明独立负责", askAngles: ["模块边界", "排障路径"] }
    ],
    niceToHave: ["消息队列", "可观测性", "并发模型"],
    outOfScope: ["模型训练细节", "UI 布局实现"]
  },
  "前端": {
    mustHave: [
      { skill: "组件与状态管理", why: "前端核心工程能力", askAngles: ["数据流", "渲染性能", "边界状态"] },
      { skill: "工程化与质量", why: "可维护性决定交付效率", askAngles: ["构建", "测试", "兼容性"] },
      { skill: "用户体验与性能", why: "前端价值体现在体验指标", askAngles: ["首屏", "交互延迟", "可访问性"] },
      { skill: "个人贡献边界", why: "需区分业务堆砌与工程能力", askAngles: ["难点", "取舍"] }
    ],
    niceToHave: ["可视化", "微前端", "SSR"],
    outOfScope: ["分布式一致性算法 trivia", "底层内核实现"]
  }
};

function detectPreset(targetRole: string) {
  const role = targetRole.toLowerCase();
  if (/算法|人工智能|ai|llm|机器学习|推荐|nlp|cv/.test(role)) {
    return /后端|工程|平台/.test(role) ? ROLE_PRESETS["后端"] : /算法/.test(role) ? ROLE_PRESETS["算法"] : ROLE_PRESETS["人工智能"];
  }
  if (/前端|web|react|vue/.test(role)) return ROLE_PRESETS["前端"];
  if (/后端|服务端|java|go|基础设施|平台/.test(role)) return ROLE_PRESETS["后端"];
  return ROLE_PRESETS["算法"];
}

function unique(items: string[], limit = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

/** Build a local RoleRubric so interviews stay anchored when the remote model is unavailable. */
export function buildRoleRubric(profile: ResumeProfile, targetRole?: string): RoleRubric {
  const role = (targetRole || profile.targetRole || "待选择岗位").trim();
  const preset = detectPreset(role);
  const techFromResume = unique([
    ...profile.skills,
    ...profile.experiences.flatMap((e) => e.technologies),
    ...profile.experiences.map((e) => e.title)
  ], 24);

  const mustHave = preset.mustHave.map((item) => ({ ...item, weight: Number((1 / preset.mustHave.length).toFixed(3)), evidenceExpectations: item.askAngles.map((angle) => `回答中提供可核验的${angle}证据`) }));
  const allowedTopics = unique([
    ...mustHave.map((m) => m.skill),
    ...preset.niceToHave,
    ...techFromResume.slice(0, 12),
    ...profile.experiences.slice(0, 4).map((e) => e.title),
    "个人贡献边界", "实现机制", "选型权衡", "指标与口径", "验证与对照", "异常与边界", "沟通表达", "实验设计与指标"
  ], 28);

  return {
    targetRole: role,
    mustHave,
    niceToHave: preset.niceToHave,
    allowedTopics,
    outOfScope: preset.outOfScope,
    coveragePlan: mustHave.map((m) => ({ skill: m.skill, minRounds: 1, maxRounds: 4 }))
    ,version: "role-rubric-v3.0"
  };
}

export function pickUnderCoveredSkill(rubric: RoleRubric, skillRoundCounts: Record<string, number>): string {
  const ranked = rubric.coveragePlan
    .map((plan) => ({ skill: plan.skill, count: skillRoundCounts[plan.skill] || 0, max: plan.maxRounds, min: plan.minRounds }))
    .sort((a, b) => a.count - b.count || b.min - a.min);
  return ranked[0]?.skill || rubric.mustHave[0]?.skill || rubric.targetRole;
}

export function isSkillAllowed(rubric: RoleRubric, skillOrTopic: string): boolean {
  const needle = skillOrTopic.toLowerCase();
  if (rubric.outOfScope.some((item) => needle.includes(item.toLowerCase()) || item.toLowerCase().includes(needle))) return false;
  if (rubric.allowedTopics.some((item) => needle.includes(item.toLowerCase()) || item.toLowerCase().includes(needle))) return true;
  if (rubric.mustHave.some((item) => needle.includes(item.skill.toLowerCase()) || item.skill.toLowerCase().includes(needle))) return true;
  return false;
}
