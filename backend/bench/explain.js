import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import User from "../src/models/User.js";
import Session from "../src/models/Session.js";

const DB_URL = process.env.DB_URL || "mongodb://localhost:27017/talentiq_bench";
const phase = process.argv.find((arg) => arg.startsWith("--phase="))?.split("=")[1] || "baseline";

async function runExplain() {
  await mongoose.connect(DB_URL);
  await Session.init();
  const user = await User.findOne({ clerkId: "bench_user_0" });
  if (!user) {
    console.error("Bench user not found. Run seed script first.");
    process.exit(1);
  }

  // 1. Explain getActiveSessions query
  const activeExplain = await Session.find({ status: "active" })
    .sort({ createdAt: -1 })
    .limit(20)
    .explain("executionStats");

  // 2. Explain getMyRecentSessions query
  const recentExplain = await Session.find({
    status: "completed",
    $or: [{ host: user._id }, { participant: user._id }],
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .explain("executionStats");

  const results = {
    phase,
    activeSessions: {
      winningPlanStage: activeExplain.queryPlanner?.winningPlan?.stage || "UNKNOWN",
      executionTimeMillis: activeExplain.executionStats?.executionTimeMillis,
      totalDocsExamined: activeExplain.executionStats?.totalDocsExamined,
      totalKeysExamined: activeExplain.executionStats?.totalKeysExamined,
      nReturned: activeExplain.executionStats?.nReturned,
    },
    myRecentSessions: {
      winningPlanStage: recentExplain.queryPlanner?.winningPlan?.stage || "UNKNOWN",
      executionTimeMillis: recentExplain.executionStats?.executionTimeMillis,
      totalDocsExamined: recentExplain.executionStats?.totalDocsExamined,
      totalKeysExamined: recentExplain.executionStats?.totalKeysExamined,
      nReturned: recentExplain.executionStats?.nReturned,
    },
    raw: {
      activeExplain,
      recentExplain,
    },
  };

  const resultsDir = path.resolve("./bench/results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const filePath = path.join(resultsDir, `${phase}-explain.json`);
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));

  console.log(`\n=== Explain Stats (${phase.toUpperCase()}) ===`);
  console.log(`Saved raw explain to ${filePath}`);
  console.log("\n[Active Sessions Query]");
  console.log(`  Stage:               ${results.activeSessions.winningPlanStage}`);
  console.log(`  Execution Time:      ${results.activeSessions.executionTimeMillis} ms`);
  console.log(`  Docs Examined:       ${results.activeSessions.totalDocsExamined}`);
  console.log(`  Keys Examined:       ${results.activeSessions.totalKeysExamined}`);
  console.log(`  Returned:            ${results.activeSessions.nReturned}`);

  console.log("\n[My Recent Sessions Query]");
  console.log(`  Stage:               ${results.myRecentSessions.winningPlanStage}`);
  console.log(`  Execution Time:      ${results.myRecentSessions.executionTimeMillis} ms`);
  console.log(`  Docs Examined:       ${results.myRecentSessions.totalDocsExamined}`);
  console.log(`  Keys Examined:       ${results.myRecentSessions.totalKeysExamined}`);
  console.log(`  Returned:            ${results.myRecentSessions.nReturned}\n`);

  await mongoose.disconnect();
}

runExplain().catch((err) => {
  console.error("Explain failed:", err);
  process.exit(1);
});

