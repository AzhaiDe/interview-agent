import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const files = {
  resume: "evals/datasets/silver/resume.jsonl",
  interview: "evals/datasets/silver/interview.jsonl",
  ranking: "evals/datasets/silver/ranking.jsonl",
  memory: "evals/datasets/silver/memory.jsonl",
};

async function load(relative) {
  const text = await readFile(path.join(root, relative), "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${relative}:${index + 1}: ${error.message}`); }
  });
}

const seen = new Set();
for (const [track, file] of Object.entries(files)) {
  const rows = await load(file);
  if (!rows.length) throw new Error(`${track}: empty dataset`);
  for (const row of rows) {
    const id = row.id || row.jobId;
    if (!id || seen.has(`${track}:${id}`)) throw new Error(`${track}: missing or duplicate id ${id}`);
    seen.add(`${track}:${id}`);
    if (!String(row.provenance || "").startsWith("synthetic")) throw new Error(`${track}:${id}: Silver provenance must be explicit`);
    if (track === "resume" && (!Array.isArray(row.gold?.skills) || row.gold.unsupportedClaims < 0)) throw new Error(`${id}: invalid resume gold`);
    if (track === "interview") {
      const [low, high] = row.gold?.scoreRange || [];
      if (!(low >= 0 && high <= 10 && low <= high)) throw new Error(`${id}: invalid scoreRange`);
      if (!row.gold.action?.every((x) => ["clarify", "advance", "pivot", "finish"].includes(x))) throw new Error(`${id}: invalid action`);
    }
    if (track === "ranking") {
      const ids = new Set(row.candidates?.map((x) => x.id));
      if (!row.goldOrder?.length || row.goldOrder.some((id) => !ids.has(id))) throw new Error(`${id}: invalid goldOrder`);
    }
    if (track === "memory") {
      const ids = new Set(row.corpus?.map((x) => x.memoryId));
      if (!row.deviceNo || !row.groupId || !Array.isArray(row.expectedRelevantIds)) throw new Error(`${id}: invalid memory case`);
      if ([...row.expectedRelevantIds, ...(row.forbiddenIds || [])].some((memoryId) => !ids.has(memoryId))) throw new Error(`${id}: unknown memory id`);
    }
  }
  console.log(`${track}: ${rows.length} valid cases`);
}

console.log("evaluation baseline validation passed");

const manifest = JSON.parse(await readFile(path.join(root, "evals/manifest.json"), "utf8"));
for (const [relative, expected] of Object.entries(manifest.sha256 || {})) {
  const content = await readFile(path.join(root, "evals", relative));
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expected) throw new Error(`manifest hash mismatch: ${relative}`);
}
console.log(`manifest ${manifest.version} hashes passed`);
