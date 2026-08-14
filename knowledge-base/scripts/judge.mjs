import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const inputDir = path.join(root, 'generated');
const judgedDir = path.join(root, 'judged');
const reportDir = path.join(root, 'reports');
fs.mkdirSync(judgedDir, { recursive: true });
for (const f of fs.readdirSync(judgedDir)) fs.unlinkSync(path.join(judgedDir, f));

const read = file => fs.readFileSync(path.join(inputDir, file), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const files = ['competencies', 'concepts', 'questions', 'followups', 'misconceptions', 'failure_modes', 'scoring_anchors', 'sources'];
const rowsByFile = Object.fromEntries(files.map(f => [f, read(`${f}.jsonl`)]));
const issues = [];
const judged = {};
const roleKey = x => x.role_ids?.[0] ?? 'NO_ROLE';
const add = (row, code, message, severity = 'major') => {
  row.judge_issues ??= [];
  row.judge_issues.push({ code, message, severity });
  issues.push({ id: row.id, entity_type: row.entity_type, role: roleKey(row), code, message, severity });
};

for (const [file, rows] of Object.entries(rowsByFile)) {
  const seen = new Map();
  judged[file] = rows.map(row => {
    const out = structuredClone(row);
    out.judge_status = 'pending_expert_review';
    const role = roleKey(out);
    if (!out.source_ids?.length) add(out, 'NO_PROVENANCE', '缺少可追溯来源', 'critical');
    if (out.content?.prompt?.includes('{')) add(out, 'UNRESOLVED_TEMPLATE', '问题仍包含模板占位符', 'critical');
    let dedupeKey = null;
    if (file === 'concepts') dedupeKey = `${role}|${out.content?.canonical}`;
    if (file === 'questions') dedupeKey = `${role}|${out.content?.prompt}`;
    if (file === 'followups') dedupeKey = `${role}|${out.content?.operator}|${out.content?.prompt}`;
    if (dedupeKey) {
      if (seen.has(dedupeKey)) add(out, 'DUPLICATE_CONTENT', `与 ${seen.get(dedupeKey)} 内容重复，不能作为独立知识条目`, 'major');
      else seen.set(dedupeKey, out.id);
    }
    if (file === 'concepts' && out.content?.depth > 1) add(out, 'SYNTHETIC_VARIANT', '这是同一 canonical 概念的自动变体，不应计作新的技术概念；需拆成有独立定义、反例和来源的子概念', 'major');
    if (['competencies', 'concepts', 'questions', 'followups', 'misconceptions', 'failure_modes', 'scoring_anchors'].includes(file)) {
      const sourceRows = rowsByFile.sources.filter(s => out.source_ids.includes(s.id));
      const hasOfficial = sourceRows.some(s => s.status === 'verified' && s.source_kind === 'official_documentation');
      if (!hasOfficial) add(out, 'NO_TECHNICAL_AUTHORITY', '只有面经/候选来源，不能单独证明技术事实或评分锚点', 'major');
    }
    if (file === 'scoring_anchors' && !out.content?.expert_rater_ids) add(out, 'NO_BLIND_RATERS', '缺少至少两名独立专家的盲审记录和一致性统计', 'critical');
    if (file === 'misconceptions' && !out.content?.counterexample) add(out, 'NO_COUNTEREXAMPLE', '误区缺少具体反例或可观测判定条件', 'major');
    if (file === 'failure_modes' && (!out.content?.diagnosis?.length || !out.content?.mitigation?.length)) add(out, 'INCOMPLETE_RUNBOOK', '故障场景缺少可执行诊断或缓解步骤', 'major');
    const critical = out.judge_issues?.some(x => x.severity === 'critical');
    const major = out.judge_issues?.some(x => x.severity === 'major');
    if (file === 'sources' && out.status === 'verified' && out.source_kind === 'official_documentation' && out.rights === 'verify_facts') out.judge_status = 'verified';
    else if (critical || major) out.judge_status = 'pending_expert_review';
    else out.judge_status = 'pending_expert_review';
    return out;
  });
  fs.writeFileSync(path.join(judgedDir, `${file}.jsonl`), judged[file].map(x => JSON.stringify(x)).join('\n') + '\n');
}

const summary = {};
for (const [file, rows] of Object.entries(judged)) {
  summary[file] = {
    total: rows.length,
    verified: rows.filter(x => x.judge_status === 'verified').length,
    pending_expert_review: rows.filter(x => x.judge_status === 'pending_expert_review').length,
    issues: rows.reduce((n, x) => n + (x.judge_issues?.length ?? 0), 0)
  };
}
const byCode = Object.fromEntries([...new Set(issues.map(x => x.code))].map(code => [code, issues.filter(x => x.code === code).length]));
const report = {
  judged_at: new Date().toISOString(),
  verdict: issues.length ? 'NOT_READY_FOR_FULL_VERIFICATION' : 'READY_FOR_EXPERT_SIGNOFF',
  summary,
  issue_counts: byCode,
  rules: [
    '没有官方/标准/专家证据的技术事实不升级 verified',
    '重复或自动变体不计作独立概念/问题',
    '评分锚点必须有两名独立专家及一致性统计',
    '误区必须有反例，故障必须有诊断和缓解步骤'
  ],
  next_actions: [
    '把 judged/*.jsonl 作为运行时输入，并过滤 judge_status=verified 或人工允许的 candidate',
    '补齐概念独立定义、反例、版本和官方来源',
    '对问题/追问做专家信息增益盲评',
    '对评分锚点进行双人盲审并记录 Kappa/ICC'
  ],
  issues: issues.slice(0, 500)
};
fs.writeFileSync(path.join(reportDir, 'judge-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: report.verdict, summary, issue_counts: byCode }, null, 2));
