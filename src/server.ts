// src/server.ts — Express backend for the NBA Props Optimizer web dashboard
//
// Endpoints:
//   POST /api/run/pp       — Run PrizePicks optimizer + push to Sheets
//   POST /api/run/ud       — Run Underdog optimizer + push to Sheets
//   POST /api/run/both     — Run both sequentially + push to Sheets
//   GET  /api/status/:jobId — Poll job status
//   GET  /api/cards         — Read card data from JSON files
//   GET  /api/legs          — Read leg data from JSON files

import express, { Request, Response } from "express";
import cors from "cors";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { calculatePerformanceStats, isCardFullyGraded } from "./tracking/analytics_engine";
import { generateClipboardStringFromTrackedCard } from "./exporter/clipboard_generator";

const app = express();
const PORT = parseInt(process.env.SERVER_PORT || "4000", 10);

app.use(cors());
app.use(express.json());

// Serve static frontend files from web/dist (built React app)
const staticDir = path.join(__dirname, "..", "web", "dist");
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

// ============================================================================
// JOB MANAGER — spawn optimizer processes and track status
// ============================================================================

interface Job {
  id: string;
  status: "running" | "done" | "error";
  log: string[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

const jobs = new Map<string, Job>();
let jobCounter = 0;

function createJobId(): string {
  return `job_${++jobCounter}_${Date.now()}`;
}

function spawnStep(cmd: string, args: string[], cwd: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const log: string[] = [];
    const proc: ChildProcess = spawn(cmd, args, { cwd, shell: true });

    proc.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      log.push(...lines);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      log.push(...lines);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(log);
      } else {
        reject(new Error(`Process exited with code ${code}\n${log.join("\n")}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

const ROOT = path.join(__dirname, "..");

async function runPrizePicks(job: Job): Promise<void> {
  job.log.push("[PP] Building TypeScript...");
  const buildLog = await spawnStep("npx", ["tsc", "-p", "."], ROOT);
  job.log.push(...buildLog);

  job.log.push("[PP] Running PrizePicks optimizer...");
  const optLog = await spawnStep("node", ["dist/run_optimizer.js"], ROOT);
  job.log.push(...optLog);

  job.log.push("[PP] Pushing legs to Sheets...");
  const legsLog = await spawnStep("python", ["sheets_push_legs.py"], ROOT);
  job.log.push(...legsLog);

  job.log.push("[PP] Pushing cards to Sheets...");
  const cardsLog = await spawnStep("python", ["sheets_push_cards.py"], ROOT);
  job.log.push(...cardsLog);

  job.log.push("[PP] Done.");
}

async function runUnderdog(job: Job): Promise<void> {
  job.log.push("[UD] Building TypeScript...");
  const buildLog = await spawnStep("npx", ["tsc", "-p", "."], ROOT);
  job.log.push(...buildLog);

  job.log.push("[UD] Running Underdog optimizer...");
  const optLog = await spawnStep("node", ["dist/run_underdog_optimizer.js"], ROOT);
  job.log.push(...optLog);

  job.log.push("[UD] Pushing UD legs to Sheets...");
  const legsLog = await spawnStep("python", ["sheets_push_underdog_legs.py"], ROOT);
  job.log.push(...legsLog);

  job.log.push("[UD] Pushing cards to Sheets...");
  const cardsLog = await spawnStep("python", ["sheets_push_cards.py"], ROOT);
  job.log.push(...cardsLog);

  job.log.push("[UD] Done.");
}

async function runBoth(job: Job): Promise<void> {
  job.log.push("[BOTH] Building TypeScript...");
  const buildLog = await spawnStep("npx", ["tsc", "-p", "."], ROOT);
  job.log.push(...buildLog);

  job.log.push("[BOTH] Running PrizePicks optimizer...");
  const ppLog = await spawnStep("node", ["dist/run_optimizer.js"], ROOT);
  job.log.push(...ppLog);

  job.log.push("[BOTH] Running Underdog optimizer...");
  const udLog = await spawnStep("node", ["dist/run_underdog_optimizer.js"], ROOT);
  job.log.push(...udLog);

  job.log.push("[BOTH] Pushing PP legs to Sheets...");
  const ppLegsLog = await spawnStep("python", ["sheets_push_legs.py"], ROOT);
  job.log.push(...ppLegsLog);

  job.log.push("[BOTH] Pushing UD legs to Sheets...");
  const udLegsLog = await spawnStep("python", ["sheets_push_underdog_legs.py"], ROOT);
  job.log.push(...udLegsLog);

  job.log.push("[BOTH] Pushing cards to Sheets...");
  const cardsLog = await spawnStep("python", ["sheets_push_cards.py"], ROOT);
  job.log.push(...cardsLog);

  job.log.push("[BOTH] Done.");
}

function startJob(
  runner: (job: Job) => Promise<void>
): Job {
  const job: Job = {
    id: createJobId(),
    status: "running",
    log: [],
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);

  runner(job)
    .then(() => {
      job.status = "done";
      job.finishedAt = Date.now();
    })
    .catch((err) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
      job.finishedAt = Date.now();
      job.log.push(`ERROR: ${job.error}`);
    });

  return job;
}

// ============================================================================
// ROUTES — Run endpoints
// ============================================================================

// Check if any job is currently running
function hasRunningJob(): boolean {
  for (const job of jobs.values()) {
    if (job.status === "running") return true;
  }
  return false;
}

app.post("/api/run/pp", (_req: Request, res: Response) => {
  if (hasRunningJob()) {
    return res.status(409).json({ error: "A job is already running" });
  }
  const job = startJob(runPrizePicks);
  res.json({ jobId: job.id, status: "started" });
});

app.post("/api/run/ud", (_req: Request, res: Response) => {
  if (hasRunningJob()) {
    return res.status(409).json({ error: "A job is already running" });
  }
  const job = startJob(runUnderdog);
  res.json({ jobId: job.id, status: "started" });
});

app.post("/api/run/both", (_req: Request, res: Response) => {
  if (hasRunningJob()) {
    return res.status(409).json({ error: "A job is already running" });
  }
  const job = startJob(runBoth);
  res.json({ jobId: job.id, status: "started" });
});

// ============================================================================
// ROUTES — Job status
// ============================================================================

app.get("/api/status/:jobId", (req: Request, res: Response) => {
  const jobId = typeof req.params.jobId === "string" ? req.params.jobId : req.params.jobId?.[0] ?? "";
  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  // Return last 100 log lines to avoid huge payloads
  const tailLog = job.log.slice(-100);
  res.json({
    jobId: job.id,
    status: job.status,
    log: tailLog,
    error: job.error || null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null,
    durationMs: job.finishedAt ? job.finishedAt - job.startedAt : Date.now() - job.startedAt,
  });
});

// ============================================================================
// ROUTES — Data endpoints (read JSON files from disk)
// ============================================================================

function readJsonFile(filePath: string): unknown | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface LegRecord {
  site?: string;
  league?: string;
  legEv?: number;
  edge?: number;
  [key: string]: unknown;
}

interface CardRecord {
  site?: string;
  flexType?: string;
  cardEv?: number;
  [key: string]: unknown;
}

app.get("/api/cards", (req: Request, res: Response) => {
  const siteFilter = (req.query.site as string || "").toUpperCase();
  const minEv = parseFloat(req.query.minEv as string) || 0;
  const slipFilter = (req.query.slip as string || "").toUpperCase();

  const results: CardRecord[] = [];

  // Read PrizePicks cards
  if (!siteFilter || siteFilter === "PP") {
    const ppData = readJsonFile(path.join(ROOT, "prizepicks-cards.json"));
    if (ppData && typeof ppData === "object" && ppData !== null) {
      const ppCards = (ppData as { cards?: CardRecord[] }).cards || [];
      for (const card of ppCards) {
        card.site = "PP";
        results.push(card);
      }
    }
  }

  // Read Underdog cards
  if (!siteFilter || siteFilter === "UD") {
    const udData = readJsonFile(path.join(ROOT, "underdog-cards.json"));
    if (udData && typeof udData === "object" && udData !== null) {
      const udCards = (udData as { cards?: CardRecord[] }).cards || [];
      for (const card of udCards) {
        card.site = "UD";
        results.push(card);
      }
    }
  }

  // Apply filters
  const filtered = results.filter((card) => {
    if (minEv && typeof card.cardEv === "number" && card.cardEv < minEv) return false;
    if (slipFilter && card.flexType && card.flexType.toUpperCase() !== slipFilter) return false;
    return true;
  });

  // Sort by cardEv descending
  filtered.sort((a, b) => (b.cardEv || 0) - (a.cardEv || 0));

  res.json({ count: filtered.length, cards: filtered });
});

app.get("/api/legs", (req: Request, res: Response) => {
  const siteFilter = (req.query.site as string || "").toUpperCase();
  const minEdge = parseFloat(req.query.minEdge as string) || 0;
  const leagueFilter = (req.query.league as string || "").toUpperCase();

  const results: LegRecord[] = [];

  // Read PrizePicks legs
  if (!siteFilter || siteFilter === "PP") {
    const ppLegs = readJsonFile(path.join(ROOT, "prizepicks-legs.json"));
    if (Array.isArray(ppLegs)) {
      for (const leg of ppLegs) {
        leg.site = "PP";
        results.push(leg as LegRecord);
      }
    }
  }

  // Read Underdog legs
  if (!siteFilter || siteFilter === "UD") {
    const udLegs = readJsonFile(path.join(ROOT, "underdog-legs.json"));
    if (Array.isArray(udLegs)) {
      for (const leg of udLegs) {
        leg.site = "UD";
        results.push(leg as LegRecord);
      }
    }
  }

  // Apply filters
  const filtered = results.filter((leg) => {
    if (minEdge && typeof leg.edge === "number" && leg.edge < minEdge) return false;
    if (leagueFilter && leg.league && String(leg.league).toUpperCase() !== leagueFilter) return false;
    return true;
  });

  // Sort by legEv descending
  filtered.sort((a, b) => (b.legEv || 0) - (a.legEv || 0));

  res.json({ count: filtered.length, legs: filtered });
});

// ============================================================================
// ROUTES — Tracker (pending_cards.json for grading picks)
// ============================================================================

const PENDING_CARDS_PATH = path.join(ROOT, "data", "tracking", "pending_cards.json");
const HISTORY_PATH = path.join(ROOT, "data", "tracking", "history.json");

app.get("/api/tracker/cards", (req: Request, res: Response) => {
  const data = readJsonFile(PENDING_CARDS_PATH);
  if (data == null) {
    return res.status(200).json({ timestamp: null, cards: [] });
  }
  const obj = data as { timestamp?: string; cards?: unknown[] };
  res.json({
    timestamp: obj.timestamp ?? null,
    cards: Array.isArray(obj.cards) ? obj.cards : [],
  });
});

app.post("/api/tracker/cards", (req: Request, res: Response) => {
  const body = req.body as { cards?: unknown[] };
  const cards = Array.isArray(body?.cards) ? body.cards : [];
  const payload = {
    timestamp: new Date().toISOString(),
    cards,
  };
  try {
    const dir = path.dirname(PENDING_CARDS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PENDING_CARDS_PATH, JSON.stringify(payload, null, 2), "utf8");
    res.json({ ok: true, count: cards.length });
  } catch (err) {
    console.error("[Tracker] POST write failed:", err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

app.get("/api/tracker/stats", (_req: Request, res: Response) => {
  try {
    const stats = calculatePerformanceStats(PENDING_CARDS_PATH, HISTORY_PATH);
    res.json(stats);
  } catch (err) {
    console.error("[Tracker] GET stats failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/tracker/archive", (req: Request, res: Response) => {
  try {
    const data = readJsonFile(PENDING_CARDS_PATH) as { timestamp?: string; cards?: unknown[] } | null;
    const cards = Array.isArray(data?.cards) ? (data.cards as import("./tracking/tracker_schema").TrackedCard[]) : [];
    const fullyGraded = cards.filter(isCardFullyGraded);
    const stillPending = cards.filter((c) => !isCardFullyGraded(c));

    const dir = path.dirname(PENDING_CARDS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let historyCards: import("./tracking/tracker_schema").TrackedCard[] = [];
    if (fs.existsSync(HISTORY_PATH)) {
      const hist = readJsonFile(HISTORY_PATH) as { cards?: unknown[] } | null;
      historyCards = Array.isArray(hist?.cards) ? (hist.cards as import("./tracking/tracker_schema").TrackedCard[]) : [];
    }
    historyCards = [...historyCards, ...fullyGraded];
    fs.writeFileSync(
      HISTORY_PATH,
      JSON.stringify({ timestamp: new Date().toISOString(), cards: historyCards }, null, 2),
      "utf8"
    );

    fs.writeFileSync(
      PENDING_CARDS_PATH,
      JSON.stringify({ timestamp: new Date().toISOString(), cards: stillPending }, null, 2),
      "utf8"
    );

    res.json({ ok: true, archived: fullyGraded.length, remaining: stillPending.length });
  } catch (err) {
    console.error("[Tracker] POST archive failed:", err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

app.post("/api/tracker/clipboard", (req: Request, res: Response) => {
  const body = req.body as { card?: unknown };
  if (!body?.card || typeof body.card !== "object") {
    return res.status(400).json({ error: "Missing or invalid body.card" });
  }
  const card = body.card as import("./exporter/clipboard_generator").TrackedCardClipboardInput;
  try {
    const text = generateClipboardStringFromTrackedCard(card);
    res.json({ text });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ============================================================================
// FALLBACK — catch-all: serve React index.html for client-side routing
// ============================================================================

app.use((_req: Request, res: Response) => {
  const indexPath = path.join(staticDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).json({
      message: "NBA Props Optimizer API",
      endpoints: [
        "POST /api/run/pp",
        "POST /api/run/ud",
        "POST /api/run/both",
        "GET  /api/status/:jobId",
        "GET  /api/cards?site=PP&minEv=0.05&slip=6F",
        "GET  /api/legs?site=UD&minEdge=0.02&league=NBA",
      ],
    });
  }
});

// ============================================================================
// START
// ============================================================================

app.listen(PORT, () => {
  console.log(`[Server] NBA Props Optimizer API running on http://localhost:${PORT}`);
  console.log(`[Server] Static dir: ${staticDir}`);
  console.log(`[Server] Project root: ${ROOT}`);
});
