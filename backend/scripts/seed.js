import mongoose from "mongoose";
import User from "../src/models/User.js";
import Session from "../src/models/Session.js";

const DB_URL = process.env.DB_URL || "mongodb://localhost:27017/talentiq_bench";
const TOTAL_USERS = 5000;
const TOTAL_SESSIONS = 50000;
const BATCH_SIZE = 5000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const PROBLEMS = [
  "Two Sum",
  "Reverse String",
  "Valid Palindrome",
  "Maximum Subarray",
  "Container With Most Water",
];
const DIFFICULTIES = ["easy", "medium", "hard"];

async function seed() {
  console.log(`Connecting to benchmark database at ${DB_URL}...`);
  await mongoose.connect(DB_URL);

  console.log("Dropping existing benchmark database to ensure repeatable runs...");
  await mongoose.connection.dropDatabase();
  console.log("Database dropped successfully.");

  const startTime = Date.now();

  // 1. Seed Users
  console.log(`Generating ${TOTAL_USERS} users...`);
  const usersToInsert = [];
  for (let i = 0; i < TOTAL_USERS; i++) {
    if (i === 0) {
      usersToInsert.push({
        clerkId: "bench_user_0",
        name: "Bench User",
        email: "bench_user@example.com",
        profileImage: "https://avatar.iran.liara.run/public/0",
      });
    } else {
      usersToInsert.push({
        clerkId: `user_${i}`,
        name: `User ${i}`,
        email: `user_${i}@example.com`,
        profileImage: `https://avatar.iran.liara.run/public/${i % 100}`,
      });
    }
  }

  console.log("Inserting users in batch...");
  const insertedUsers = await User.insertMany(usersToInsert, { ordered: false });
  console.log(`Inserted ${insertedUsers.length} users.`);

  const userIds = insertedUsers.map((u) => u._id);
  const benchUserId = userIds[0];

  // 2. Seed Sessions in batches of 5,000
  console.log(`Generating and inserting ${TOTAL_SESSIONS} sessions in batches of ${BATCH_SIZE}...`);
  const now = Date.now();
  let totalActive = 0;
  let totalCompleted = 0;

  for (let batchStart = 0; batchStart < TOTAL_SESSIONS; batchStart += BATCH_SIZE) {
    const sessionBatch = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const globalIndex = batchStart + i;
      const isActive = Math.random() < 0.2; // ~20% active, ~80% completed
      if (isActive) totalActive++;
      else totalCompleted++;

      // Make sure bench user is represented in ~200 sessions across the set
      let hostId;
      let participantId = null;

      if (globalIndex < 100) {
        hostId = benchUserId;
        participantId = userIds[Math.floor(Math.random() * (userIds.length - 1)) + 1];
      } else if (globalIndex < 200) {
        hostId = userIds[Math.floor(Math.random() * (userIds.length - 1)) + 1];
        participantId = benchUserId;
      } else {
        const hIdx = Math.floor(Math.random() * userIds.length);
        let pIdx = Math.floor(Math.random() * userIds.length);
        while (pIdx === hIdx) {
          pIdx = Math.floor(Math.random() * userIds.length);
        }
        hostId = userIds[hIdx];
        // For active sessions, 30% have no participant yet
        participantId = isActive && Math.random() < 0.3 ? null : userIds[pIdx];
      }

      const createdAt = new Date(now - Math.random() * NINETY_DAYS_MS);
      const updatedAt = new Date(createdAt.getTime() + Math.floor(Math.random() * 3600000));

      sessionBatch.push({
        problem: PROBLEMS[Math.floor(Math.random() * PROBLEMS.length)],
        difficulty: DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)],
        host: hostId,
        participant: participantId,
        status: isActive ? "active" : "completed",
        callId: `session_${globalIndex}_${Math.random().toString(36).substring(7)}`,
        createdAt,
        updatedAt,
      });
    }

    await Session.insertMany(sessionBatch, { ordered: false });
    const batchNum = batchStart / BATCH_SIZE + 1;
    const totalBatches = TOTAL_SESSIONS / BATCH_SIZE;
    console.log(`  Inserted batch ${batchNum}/${totalBatches} (${batchStart + BATCH_SIZE} sessions total)...`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nSeed completed in ${durationSec}s!`);
  console.log(`Users: ${TOTAL_USERS}`);
  console.log(`Sessions: ${TOTAL_SESSIONS} (Active: ${totalActive}, Completed: ${totalCompleted})`);

  await mongoose.disconnect();
  console.log("Disconnected from database.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

