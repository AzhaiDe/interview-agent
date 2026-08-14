import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const reviewFile = path.join(root, 'review', 'decisions.jsonl');
const decisions = fs.existsSync(reviewFile) ? fs.readFileSync(reviewFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
const groups = new Map();
for (const decision of decisions) { if (!decision.entity_id || !decision.reviewer_id || !['approve', 'reject'].includes(decision.decision)) continue; const list = groups.get(decision.entity_id) || []; list.push(decision); groups.set(decision.entity_id, list); }
const approved = new Set([...groups.entries()].filter(([, list]) => new Set(list.map(x => x.reviewer_id)).size >= 2 && list.every(x => x.decision === 'approve') && list.every(x => Array.isArray(x.evidence_source_ids) && x.evidence_source_ids.length > 0)).map(([id]) => id));
const files = fs.readdirSync(path.join(root, 'judged')).filter(x => x.endsWith('.jsonl'));
const counts = { promoted: 0, pending: 0 };
for (const file of files) {
  const input = fs.readFileSync(path.join(root, 'judged', file), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const output = input.map(row => { if (approved.has(row.id)) { counts.promoted++; return { ...row, status: 'verified', judge_status: 'verified', review: { reviewerCount: groups.get(row.id).length, promotedAt: new Date().toISOString() } }; } counts.pending++; return row; });
  fs.writeFileSync(path.join(root, 'judged', file), output.map(x => JSON.stringify(x)).join('\n') + '\n');
}
const report = { promoted: counts.promoted, pending: counts.pending, reviewerDecisions: decisions.length, approvedEntities: approved.size, rule: 'two independent approvals plus evidence_source_ids required' };
fs.writeFileSync(path.join(root, 'reports', 'promotion-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
