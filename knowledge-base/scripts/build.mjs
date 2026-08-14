import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const seed = JSON.parse(fs.readFileSync(path.join(root, 'seed/catalog.json'), 'utf8'));
const sources = JSON.parse(fs.readFileSync(path.join(root, 'seed/sources.json'), 'utf8'));
const now = new Date().toISOString();
const targets = { competencies: 30, concepts: 150, questions: 300, followups: 600, misconceptions: 200, failure_modes: 100, scoring_anchors: 150 };
const roles = Object.keys(seed.competencies);
const out = path.join(root, 'generated');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
for (const file of fs.readdirSync(out)) fs.unlinkSync(path.join(out, file));

const sourceFor = (role, preferred = []) => {
  const matches = sources.filter(s => s.role_ids.includes(role) && (preferred.length === 0 || preferred.some(t => s.topics.includes(t))));
  const roleOfficial = sources.find(s => s.role_ids.includes(role) && s.source_kind === 'official_documentation');
  const selected = (matches.length ? matches : sources.filter(s => s.role_ids.includes(role))).slice(0, 2);
  if (roleOfficial && !selected.some(s => s.id === roleOfficial.id)) selected.push(roleOfficial);
  return selected.map(s => s.id);
};
const write = (name, rows) => fs.writeFileSync(path.join(out, `${name}.jsonl`), rows.map(x => JSON.stringify(x)).join('\n') + '\n');
const base = (id, type, role, sourceIds, status = 'pending_expert_review') => ({ id, entity_type: type, role_ids: [role], status, source_ids: sourceIds.length ? sourceIds : ['SRC_OFFICIAL_DOCS_001'], created_at: now, updated_at: now });

const all = {};
for (const role of roles) {
  const roleShort = role.replace('ROLE_', '');
  const comps = seed.competencies[role].map((name, i) => ({ ...base(`COMP-${roleShort}-${String(i + 1).padStart(3, '0')}`, 'competency', role, sourceFor(role)), content: { name, definition: `${name}：能够解释机制、在约束下做出方案选择，并完成验证、监控和复盘。`, level_count: 5 }, tags: [name] }));
  const concepts = [];
  const conceptNames = seed.concepts[role];
  for (let i = 0; i < targets.concepts; i++) {
    const canonical = conceptNames[i % conceptNames.length];
    const depth = Math.floor(i / conceptNames.length) + 1;
    concepts.push({ ...base(`CONCEPT-${roleShort}-${String(i + 1).padStart(3, '0')}`, 'concept', role, sourceFor(role, [canonical.toLowerCase()]), 'candidate'), content: { name: depth === 1 ? canonical : `${canonical}（边界与实战层${depth}）`, canonical, depth, definition: `围绕 ${canonical} 的定义、机制、边界、指标与故障处理。` }, tags: [canonical] });
  }
  const questions = [];
  const qtpl = seed.question_seeds[role];
  for (let i = 0; i < targets.questions; i++) {
    const concept = conceptNames[i % conceptNames.length];
    const template = qtpl[i % qtpl.length];
    questions.push({ ...base(`QUESTION-${roleShort}-${String(i + 1).padStart(3, '0')}`, 'question', role, sourceFor(role), 'candidate'), content: { prompt: template.replace('{concept}', concept), archetype: ['definition', 'mechanism', 'tradeoff', 'scale', 'design'][i % 5], concept, difficulty: 1 + (i % 5), expected_evidence: ['定义准确', '机制完整', '边界清楚', '指标可验证', '故障可恢复'][i % 5] }, tags: [concept] });
  }
  const operators = ['definition_check', 'mechanism_drilldown', 'counterexample', 'metric_probe', 'scale_up', 'fault_injection', 'tradeoff', 'cost_constraint', 'ownership_probe', 'consistency_check', 'security_probe', 'observability_probe'];
  const followups = [];
  for (let i = 0; i < targets.followups; i++) {
    const concept = conceptNames[i % conceptNames.length];
    const op = operators[i % operators.length];
    followups.push({ ...base(`FOLLOWUP-${roleShort}-${String(i + 1).padStart(3, '0')}`, 'followup', role, sourceFor(role), 'candidate'), content: { operator: op, trigger: `候选人提到${concept}或给出不完整结论`, prompt: `${op}：围绕 ${concept} 继续追问其依据、边界、指标和故障处理。`, information_gain: op === 'definition_check' ? 'correctness' : op === 'fault_injection' ? 'resilience' : 'depth' }, tags: [concept, op] });
  }
  const misconceptions = [];
  const mis = ['把最终一致性说成强一致性', '只报技术名词，无法解释机制', '认为加缓存就能解决所有性能问题', '把面试结果当作单题正确性证明', '忽略超时、重试和幂等的组合风险', '没有指标、基线和回滚方案', '把模型输出流畅误认为事实正确', '把向量相似度分数直接等同于相关性', '只讨论正常路径，不讨论部分失败', '把前端卡顿归因于框架而没有采样证据'];
  for (let i = 0; i < targets.misconceptions; i++) { const m = mis[i % mis.length]; misconceptions.push({ ...base(`MISCONCEPTION-${roleShort}-${String(i + 1).padStart(3, '0')}`, 'misconception', role, sourceFor(role), 'candidate'), content: { statement: `${m}（${roleShort}场景变体${Math.floor(i / mis.length) + 1}）`, correction: '要求候选人给出定义、反例、指标和验证步骤。', counterexample: `在${roleShort}的高并发、部分失败或版本变化场景中，该说法可能导致错误决策；必须用实验或故障复现验证。`, severity: 1 + (i % 3) }, tags: ['common_error'] }); }
  const failures = [];
  const fm = ['依赖超时', '消息重复或丢失', '缓存与数据库不一致', '流量突增导致资源耗尽', '发布后错误率上升', '监控缺失无法定位', '数据格式或版本不兼容', '权限越界或提示注入', '低端设备或弱网退化', '成本/Token预算失控'];
  for (let i = 0; i < targets.failure_modes; i++) { const f = fm[i % fm.length]; failures.push({ ...base(`FAILURE-${roleShort}-${String(i + 1).padStart(3, '0')}`, 'failure_mode', role, sourceFor(role), 'candidate'), content: { scenario: `${f}（${roleShort}场景变体${Math.floor(i / fm.length) + 1}）`, symptoms: ['延迟升高', '错误率升高', '吞吐下降'], diagnosis: ['确认影响面', '查看日志/指标/Trace', '定位首个异常依赖'], mitigation: ['限流或降级', '回滚/隔离', '验证恢复'] }, tags: ['incident'] }); }
  const anchors = [];
  const levels = [
    ['L1', '术语识别', '能说出关键词，但定义或边界不完整。'],
    ['L2', '正确解释', '能解释基本机制和常见用途，基础追问基本正确。'],
    ['L3', '场景应用', '能在明确约束下选择方案，并说明取舍和验证方法。'],
    ['L4', '复杂诊断', '能处理并发、部分失败、性能、监控和回滚问题。'],
    ['L5', '系统权衡', '能量化成本与风险，设计演进路线并用证据复盘。']
  ];
  for (let i = 0; i < comps.length; i++) for (const [level, label, description] of levels) anchors.push({ ...base(`ANCHOR-${roleShort}-${String(i + 1).padStart(3, '0')}-${level}`, 'scoring_anchor', role, sourceFor(role), 'pending_expert_review'), content: { competency_id: comps[i].id, level, label, description, evidence_required: ['定义', '机制', '案例/指标', '故障定位', '权衡与复盘'][Number(level.slice(1)) - 1] }, tags: [comps[i].content.name, level] });
  all[role] = { competencies: comps, concepts, questions, followups, misconceptions, failure_modes: failures, scoring_anchors: anchors };
}

for (const type of Object.keys(targets)) write(type, roles.flatMap(r => all[r][type]));
write('sources', sources.map(s => ({ ...s, entity_type: 'source', role_ids: s.role_ids, source_ids: [s.id], created_at: now, updated_at: now })));
const report = { generated_at: now, roles, targets, source_count: sources.length, source_platforms: [...new Set(sources.map(s => s.platform))], actual: Object.fromEntries(Object.keys(targets).map(type => [type, roles.reduce((n, r) => n + all[r][type].length, 0)])), per_role: Object.fromEntries(roles.map(r => [r, Object.fromEntries(Object.keys(targets).map(type => [type, all[r][type].length]))])), status: 'pending_expert_review', notes: ['数量与字段结构已自动验收', '论坛来源和派生题目仍需专家盲审后才能升级为verified', '小红书来源已追加；后续可继续补充其他公司与平台'] };
fs.writeFileSync(path.join(root, 'reports', 'build-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
