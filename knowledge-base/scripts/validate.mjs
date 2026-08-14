import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const roles = ['BACKEND_JAVA_GO', 'AI_RAG_LLM', 'FRONTEND'];
const targets = { competencies: 30, concepts: 150, questions: 300, followups: 600, misconceptions: 200, failure_modes: 100, scoring_anchors: 150 };
let errors = [];
for (const [type, target] of Object.entries(targets)) {
  const p = path.join(root, 'generated', `${type}.jsonl`);
  if (!fs.existsSync(p)) { errors.push(`missing ${p}`); continue; }
  const rows = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  for (const role of roles) {
    const subset = rows.filter(x => x.role_ids.includes(`ROLE_${role}`));
    const expected = type === 'scoring_anchors' ? target : target;
    if (subset.length !== expected) errors.push(`${type}/${role}: ${subset.length} != ${expected}`);
    for (const row of subset) {
      for (const field of ['id','entity_type','role_ids','status','source_ids','created_at','updated_at']) if (!(field in row)) errors.push(`${row.id || 'unknown'} missing ${field}`);
      if (!row.source_ids?.length) errors.push(`${row.id} has no provenance`);
    }
  }
  const ids = rows.map(x => x.id); if (new Set(ids).size !== ids.length) errors.push(`${type}: duplicate ids`);
}
const report = { checked_at: new Date().toISOString(), ok: errors.length === 0, errors, acceptance: errors.length === 0 ? 'schema_and_cardinality_passed; expert_review_required' : 'failed' };
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports', 'validation-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
