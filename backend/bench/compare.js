import fs from "fs";
import path from "path";

const resultsDir = path.resolve("./bench/results");

function loadJSON(filename) {
  const filePath = path.join(resultsDir, filename);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

const baselineSummary = loadJSON("baseline-summary.json");
const afterSummary = loadJSON("after-summary.json");
const baselineExplain = loadJSON("baseline-explain.json");
const afterExplain = loadJSON("after-explain.json");

if (!baselineSummary || !afterSummary || !baselineExplain || !afterExplain) {
  console.error("Missing results files. Run both baseline and after benchmarks first.");
  process.exit(1);
}

console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║             BEFORE / AFTER BENCHMARK COMPARISON                    ║
╚══════════════════════════════════════════════════════════════════════╝
`);

// Load Test Comparison
console.log("── LOAD TEST (autocannon: 100 connections, 30s × 3 runs, median) ──\n");
console.log("| Endpoint | Phase | Req/s | p50 | p95 | p99 | Errors |");
console.log("|---|---|---|---|---|---|---|");

for (const baseEntry of baselineSummary) {
  const afterEntry = afterSummary.find((a) => a.name === baseEntry.name);
  if (!afterEntry) continue;

  console.log(
    `| ${baseEntry.endpoint} | Baseline | ${baseEntry.medianReqPerSec.toFixed(1)} | ${baseEntry.medianP50.toFixed(0)} ms | ${baseEntry.medianP95.toFixed(0)} ms | ${baseEntry.medianP99.toFixed(0)} ms | ${baseEntry.medianErrorRate.toFixed(2)}% |`
  );
  console.log(
    `| | **After** | **${afterEntry.medianReqPerSec.toFixed(1)}** | **${afterEntry.medianP50.toFixed(0)} ms** | **${afterEntry.medianP95.toFixed(0)} ms** | **${afterEntry.medianP99.toFixed(0)} ms** | ${afterEntry.medianErrorRate.toFixed(2)}% |`
  );

  const reqImprovement = ((afterEntry.medianReqPerSec - baseEntry.medianReqPerSec) / baseEntry.medianReqPerSec * 100).toFixed(1);
  const p95Reduction = ((baseEntry.medianP95 - afterEntry.medianP95) / baseEntry.medianP95 * 100).toFixed(1);
  const p99Reduction = ((baseEntry.medianP99 - afterEntry.medianP99) / baseEntry.medianP99 * 100).toFixed(1);
  const throughputMultiplier = (afterEntry.medianReqPerSec / baseEntry.medianReqPerSec).toFixed(1);

  console.log(
    `| | **Δ** | **+${reqImprovement}% (${throughputMultiplier}×)** | | **-${p95Reduction}%** | **-${p99Reduction}%** | |`
  );
}

// Explain Comparison
console.log("\n── QUERY EXPLAIN STATS (executionStats) ──\n");
console.log("| Query | Phase | Stage | Docs Examined | Keys Examined | Returned | Time |");
console.log("|---|---|---|---|---|---|---|");

for (const queryName of ["activeSessions", "myRecentSessions"]) {
  const label = queryName === "activeSessions" ? "Active Sessions" : "My Recent Sessions";
  const b = baselineExplain[queryName];
  const a = afterExplain[queryName];

  console.log(
    `| ${label} | Baseline | ${b.winningPlanStage} | ${b.totalDocsExamined} | ${b.totalKeysExamined} | ${b.nReturned} | ${b.executionTimeMillis} ms |`
  );
  console.log(
    `| | **After** | **${a.winningPlanStage}** | **${a.totalDocsExamined}** | **${a.totalKeysExamined}** | **${a.nReturned}** | **${a.executionTimeMillis} ms** |`
  );

  const docsReduction = ((b.totalDocsExamined - a.totalDocsExamined) / b.totalDocsExamined * 100).toFixed(2);
  console.log(`| | **Δ** | | **-${docsReduction}%** | | | |`);
}

console.log("\nDone.\n");

