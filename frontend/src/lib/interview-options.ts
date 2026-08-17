export const ROLE_PRESETS = [
  { id: 'backend', label: 'Java / Go 后端工程师', hint: '幂等、缓存、事务、故障恢复' },
  { id: 'ai', label: 'AI / RAG / LLM 应用工程师', hint: '检索、评测、Agent、幻觉治理' },
  { id: 'frontend', label: '前端工程师', hint: '性能、状态、工程化、体验' },
];

export const INTERVIEW_TYPES = [
  { id: 'project_deep_dive', label: '项目深挖', desc: '沿真实项目追问职责、机制、指标和故障' },
  { id: 'technical_fundamentals', label: '技术原理', desc: '核验定义、内部机制、边界和对比方案' },
  { id: 'system_design', label: '系统设计', desc: '规模、架构、一致性与降级' },
  { id: 'comprehensive', label: '综合面试', desc: '覆盖项目、原理与场景题' },
] as const;

export const PRESSURE_LEVELS = [
  { level: 1, label: '引导', tag: '保底', desc: '允许补充背景，温和追问一个实现细节' },
  { level: 2, label: '常规', tag: '稳妥', desc: '连续核查职责和一个实现步骤' },
  { level: 3, label: '压力', tag: '推荐', desc: '要求机制、权衡、指标和验证' },
  { level: 4, label: '高压', tag: '冲刺', desc: '加入故障、规模变化和反例' },
  { level: 5, label: '极限', tag: '冲刺+', desc: '高密度交叉核验，保持专业不羞辱' },
];

export function roleBand(score: number) {
  if (score >= 75) return { key: 'stable', label: '稳妥匹配', tone: 'stable' };
  if (score >= 55) return { key: 'reach', label: '冲刺匹配', tone: 'reach' };
  return { key: 'safe', label: '探索方向', tone: 'safe' };
}
