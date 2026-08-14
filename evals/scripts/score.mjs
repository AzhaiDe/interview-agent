import { readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = args.indexOf("--predictions");
if (flag < 0 || !args[flag + 1]) throw new Error("usage: npm run eval:score -- --predictions <file>");

const loadJsonl = async (relative) => (await readFile(path.resolve(relative), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const predictions = JSON.parse(await readFile(path.resolve(args[flag + 1]), "utf8"));
const resumeGold = await loadJsonl("evals/datasets/silver/resume.jsonl");
const interviewGold = await loadJsonl("evals/datasets/silver/interview.jsonl");
const rankingGold = await loadJsonl("evals/datasets/silver/ranking.jsonl");
const memoryGold = await loadJsonl("evals/datasets/silver/memory.jsonl");

const byId = (items = [], key = "id") => new Map(items.map((x) => [x[key], x]));
const resumePred = byId(predictions.resume);
const interviewPred = byId(predictions.interview);
const rankingPred = byId(predictions.ranking, "jobId");
const memoryPred = byId(predictions.memory);
let tp = 0, fp = 0, fn = 0, unsupported = 0, claims = 0;
for (const row of resumeGold) {
  const pred = resumePred.get(row.id) || { skills: [], claims: [] };
  const gold = new Set(row.gold.skills.map((x) => x.toLowerCase()));
  const got = new Set((pred.skills || []).map((x) => String(x).toLowerCase()));
  for (const skill of got) gold.has(skill) ? tp++ : fp++;
  for (const skill of gold) if (!got.has(skill)) fn++;
  for (const item of pred.claims || []) {
    claims++;
    if (!item.evidenceText || !row.text.includes(item.evidenceText)) unsupported++;
  }
}
const precision = tp / Math.max(1, tp + fp);
const recall = tp / Math.max(1, tp + fn);
const resumeF1 = 2 * precision * recall / Math.max(1e-9, precision + recall);

let actionOk = 0, skillOk = 0, nextSkillOk = 0, withinRange = 0, mae = 0;
for (const row of interviewGold) {
  const pred = interviewPred.get(row.id) || {};
  actionOk += row.gold.action.includes(pred.action) ? 1 : 0;
  skillOk += pred.answeredSkill === row.gold.answeredSkill ? 1 : 0;
  nextSkillOk += row.gold.nextSkills.includes(pred.nextSkill) ? 1 : 0;
  const score = Number(pred.score);
  const [low, high] = row.gold.scoreRange;
  withinRange += Number.isFinite(score) && score >= low && score <= high ? 1 : 0;
  const midpoint = (low + high) / 2;
  mae += Number.isFinite(score) ? Math.abs(score - midpoint) : 10;
}

function dcg(order, grades, k = 5) {
  return order.slice(0, k).reduce((sum, id, index) => sum + ((2 ** (grades.get(id) || 0)) - 1) / Math.log2(index + 2), 0);
}
let ndcg = 0;
for (const row of rankingGold) {
  const pred = rankingPred.get(row.jobId)?.candidateIds || [];
  const grades = new Map(row.candidates.map((x) => [x.id, x.grade]));
  ndcg += dcg(pred, grades) / Math.max(1e-9, dcg(row.goldOrder, grades));
}

let memoryRecall = 0, memoryMrr = 0, privacyViolations = 0, isolationViolations = 0;
const pii = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?86[- ]?)?1[3-9]\d{9}|\d{17}[\dXx]/i;
for (const row of memoryGold) {
  const prediction = memoryPred.get(row.id);
  if (!prediction) continue;
  const results = (prediction.results || []).slice(0, 5);
  const returned = new Set(results.map((x) => x.memoryId));
  const relevant = row.expectedRelevantIds;
  memoryRecall += relevant.length ? relevant.filter((id) => returned.has(id)).length / relevant.length : Number(results.length === 0);
  const first = results.findIndex((x) => relevant.includes(x.memoryId));
  memoryMrr += first >= 0 ? 1 / (first + 1) : Number(!relevant.length && !results.length);
  privacyViolations += results.filter((x) => pii.test(x.content || "")).length;
  isolationViolations += results.filter((x) => x.deviceNo !== row.deviceNo || x.groupId !== row.groupId || row.forbiddenIds.includes(x.memoryId)).length;
}

const report = {
  run: predictions.run,
  coverage: {
    resume: `${resumePred.size}/${resumeGold.length}`,
    interview: `${interviewPred.size}/${interviewGold.length}`,
    ranking: `${rankingPred.size}/${rankingGold.length}`
    ,memory: `${memoryPred.size}/${memoryGold.length}`
  },
  resume: { skillPrecision: precision, skillRecall: recall, skillF1: resumeF1, evidenceGroundingRate: claims ? 1 - unsupported / claims : 0, unsupportedClaims: unsupported },
  interview: {
    actionAccuracy: actionOk / interviewGold.length,
    answeredSkillAccuracy: skillOk / interviewGold.length,
    nextSkillAccuracy: nextSkillOk / interviewGold.length,
    scoreWithinRange: withinRange / interviewGold.length,
    scoreMAE: mae / interviewGold.length
  },
  ranking: { nDCGAt5: ndcg / rankingGold.length },
  memory: { recallAt5: memoryRecall / memoryGold.length, mrr: memoryMrr / memoryGold.length, privacyViolations, isolationViolations },
  warning: "Silver synthetic regression result; missing-track metrics use the full dataset denominator and are not a Gold quality claim."
};

console.log(JSON.stringify(report, null, 2));
