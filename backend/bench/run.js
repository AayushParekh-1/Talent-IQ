import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import autocannon from "autocannon";

const PORT = process.env.BENCH_PORT || 3001;
const HOST = `http://127.0.0.1:${PORT}`;
const DB_URL = process.env.DB_URL || "mongodb://localhost:27017/talentiq_bench";
const phase = process.argv.find((arg) => arg.startsWith("--phase="))?.split("=")[1] || "baseline";

const ENDPOINTS = [
  { name: "active", path: "/api/sessions/active" },
  { name: "my-recent", path: "/api/sessions/my-recent" },
];

const CONNECTIONS = 100;
const DURATION = 30; // 30 seconds per run
const RUNS_PER_ENDPOINT = 3;
const WARMUP_DURATION = 5; // 5 seconds warm-up

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // wait and retry
    }
    await sleep(200);
  }
  throw new Error(`Server failed to start within ${timeoutMs}ms`);
}

function calculateMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function runAutocannon(url, duration, connections, title) {
  console.log(`  -> Running autocannon on ${url} (${connections} conns, ${duration}s)...`);
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url,
        connections,
        duration,
        pipelining: 1,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
  });
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`Starting Benchmark [Phase: ${phase.toUpperCase()}]`);
  console.log(`Server Port: ${PORT} | Database: ${DB_URL}`);
  console.log(`======================================================\n`);

  const resultsDir = path.resolve("./bench/results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  // 1. Start Server Child Process
  console.log("Launching Express server in BENCH_MODE=1...");
  const serverProcess = spawn("node", ["src/server.js"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      BENCH_MODE: "1",
      DB_URL,
      NODE_ENV: "development",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (data) => {
    // optional debug: console.log(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server Error] ${data.toString().trim()}`);
  });

  let serverCleanedUp = false;
  const cleanupServer = () => {
    if (!serverCleanedUp) {
      serverCleanedUp = true;
      try {
        serverProcess.kill("SIGINT");
      } catch {}
    }
  };

  process.on("exit", cleanupServer);
  process.on("SIGINT", () => {
    cleanupServer();
    process.exit(1);
  });

  await waitForServer(HOST);
  console.log("Express server is online and healthy.\n");

  // 2. Warm up for 5 seconds
  console.log(`Warming up server for ${WARMUP_DURATION}s...`);
  await runAutocannon(`${HOST}/api/sessions/active`, WARMUP_DURATION, 10, "Warmup Active");
  await runAutocannon(`${HOST}/api/sessions/my-recent`, WARMUP_DURATION, 10, "Warmup Recent");
  console.log("Warm-up complete. Starting official benchmark runs...\n");

  const summary = [];

  // 3. Run benchmarks for each endpoint
  for (const endpoint of ENDPOINTS) {
    console.log(`\n------------------------------------------------------`);
    console.log(`Testing Endpoint: GET ${endpoint.path}`);
    console.log(`------------------------------------------------------`);

    const runResults = [];

    for (let run = 1; run <= RUNS_PER_ENDPOINT; run++) {
      console.log(`[Run ${run}/${RUNS_PER_ENDPOINT}]`);
      const result = await runAutocannon(`${HOST}${endpoint.path}`, DURATION, CONNECTIONS, endpoint.name);

      // Save raw JSON
      const resultFileName = `${phase}-run${run}-${endpoint.name}.json`;
      const resultFilePath = path.join(resultsDir, resultFileName);
      fs.writeFileSync(resultFilePath, JSON.stringify(result, null, 2));
      console.log(`  Saved raw result to: ${resultFilePath}`);

      const reqPerSec = result.requests.average || result.requests.total / DURATION;
      const p50 = result.latency.p50;
      const p95 = result.latency.p97_5; // Autocannon uses p97_5 or percentiles
      const p99 = result.latency.p99;
      const totalErrors = (result.errors || 0) + (result.timeouts || 0) + (result.non2xx || 0);
      const errorRate = result.requests.total > 0 ? (totalErrors / result.requests.total) * 100 : 0;

      console.log(
        `  -> Result: ${reqPerSec.toFixed(1)} req/s | p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms | errors: ${errorRate.toFixed(2)}%`
      );

      runResults.push({
        run,
        reqPerSec,
        p50,
        p95,
        p99,
        errorRate,
        raw: result,
      });

      // Brief 2-second pause between runs to let connections drain
      if (run < RUNS_PER_ENDPOINT) await sleep(2000);
    }

    const medianReqPerSec = calculateMedian(runResults.map((r) => r.reqPerSec));
    const medianP50 = calculateMedian(runResults.map((r) => r.p50));
    const medianP95 = calculateMedian(runResults.map((r) => r.p95));
    const medianP99 = calculateMedian(runResults.map((r) => r.p99));
    const medianErrorRate = calculateMedian(runResults.map((r) => r.errorRate));

    summary.push({
      endpoint: `GET ${endpoint.path}`,
      name: endpoint.name,
      medianReqPerSec,
      medianP50,
      medianP95,
      medianP99,
      medianErrorRate,
      runs: runResults,
    });
  }

  // 4. Print Summary Table
  console.log(`\n======================================================`);
  console.log(`BENCHMARK SUMMARY (${phase.toUpperCase()})`);
  console.log(`======================================================`);
  console.log(
    `| Endpoint | Median Req/s | Latency p50 | Latency p95 | Latency p99 | Error Rate |`
  );
  console.log(
    `| :--- | :--- | :--- | :--- | :--- | :--- |`
  );
  for (const s of summary) {
    console.log(
      `| ${s.endpoint} | ${s.medianReqPerSec.toFixed(1)} | ${s.medianP50.toFixed(1)} ms | ${s.medianP95.toFixed(1)} ms | ${s.medianP99.toFixed(1)} ms | ${s.medianErrorRate.toFixed(2)}% |`
    );
  }
  console.log(`======================================================\n`);

  // Save summary JSON
  fs.writeFileSync(
    path.join(resultsDir, `${phase}-summary.json`),
    JSON.stringify(summary, null, 2)
  );

  cleanupServer();
  console.log("Benchmark process finished successfully.\n");
}

main().catch((err) => {
  console.error("Benchmark run failed:", err);
  process.exit(1);
});

