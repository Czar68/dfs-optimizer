// src/server.ts — Express backend for the NBA Props Optimizer web dashboard
//
// Endpoints:
//   POST /api/run/pp       — Run PrizePicks optimizer + push to Sheets
//   POST /api/run/ud       — Run Underdog optimizer + push to Sheets
//   POST /api/run/both     — Run both sequentially + push to Sheets
//   POST /api/tasks       — Run any registered task by taskName (single endpoint)
//   GET  /api/status/:jobId — Poll job status
//   GET  /api/logs        — Read tasks.log (timestamped task output)
//   GET  /api/cards         — Read card data from JSON files
//   GET  /api/legs          — Read leg data from JSON files
//   GET  /api/top-legs      — Read data/top_legs.json (bench: top 10 legs per site)

import express, { Request, Response } from "express";
import cors from "cors";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { calculatePerformanceStats, isCardFullyGraded } from "./tracking/analytics_engine";
import { generateClipboardStringFromTrackedCard } from "./exporter/clipboard_generator";
import { readTrackerRows } from "./perf_tracker_db";
import { getOutputPath, getDataPath, getArtifactsPath, ARTIFACTS_DIR, DATA_DIR, UD_CARDS_JSON, PP_LEGS_JSON, UD_LEGS_JSON, PP_CARDS_JSON, TOP_LEGS_JSON, LAST_RUN_JSON } from "./constants/paths";
import { getSelectionEv } from "./constants/evSelectionUtils";
import type { EvPick } from "./types";

const app = express();
const PORT = parseInt(process.env.SERVER_PORT || "4000", 10);

app.use(cors());
app.use(express.json());

// Serve static frontend files from web/dist (built React app)
const staticDir = path.join(__dirname, "..", "web", "dist");
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

const ROOT = path.join(__dirname, "..");

// ============================================================================
// ASSERT-COMPILED — pre-flight check that dist/ artifacts exist (mirrors PowerShell)
// ============================================================================

const DEFAULT_REQUIRED_ARTIFACTS = ["dist/src/run_optimizer.js", "dist/src/run_underdog_optimizer.js"];

function assertCompiled(root: string, artifacts: string[] = DEFAULT_REQUIRED_ARTIFACTS): void {
  const absRoot = path.resolve(root);
  for (const rel of artifacts) {
    const absPath = path.resolve(absRoot, rel);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Missing artifact: ${absPath}. Please run npm run build.`);
    }
  }
}

// ============================================================================
// TASK ORCHESTRATOR — queueing, pre-flight, and tasks.log logging
// ============================================================================

const TASKS_LOG_PATH = path.join(ROOT, ARTIFACTS_DIR, "logs", "tasks.log");
const MAX_TASKS_LOG_BYTES = 5 * 1024 * 1024; // 5MB

interface Job {
  id: string;
  status: "running" | "done" | "error";
  log: string[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
  taskName?: string;
}

type InProcessRunner = (job: Job) => Promise<void>;

type TaskDef =
  | { type: "process"; command: string; args: string[] }
  | { type: "inProcess"; runner: InProcessRunner };

class TaskOrchestrator {
  private runningTaskName: string | null = null;
  private runningJobId: string | null = null;
  private readonly logPath: string;
  private readonly root: string;
  private readonly taskDefs = new Map<string, TaskDef>();
  private readonly jobs = new Map<string, Job>();
  private jobCounter = 0;

  constructor(root: string, logFilePath: string) {
    this.root = path.resolve(root);
    this.logPath = logFilePath;
    this.rotateLogs();
  }

  /**
   * If tasks.log exceeds 5MB, rename to tasks.log.old and start fresh so disk usage stays bounded.
   */
  rotateLogs(): void {
    if (!fs.existsSync(this.logPath)) return;
    try {
      const stat = fs.statSync(this.logPath);
      if (stat.size <= MAX_TASKS_LOG_BYTES) return;
      const oldPath = this.logPath + ".old";
      fs.renameSync(this.logPath, oldPath);
    } catch (err) {
      console.warn("[TaskOrchestrator] rotateLogs failed:", err);
    }
  }

  registerProcessTask(name: string, command: string, args: string[]): void {
    this.taskDefs.set(name, { type: "process", command, args });
  }

  registerInProcessTask(name: string, runner: InProcessRunner): void {
    this.taskDefs.set(name, { type: "inProcess", runner });
  }

  isRunning(): boolean {
    return this.runningTaskName !== null;
  }

  getRunningTask(): string | null {
    return this.runningTaskName;
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  private createJobId(): string {
    return `job_${++this.jobCounter}_${Date.now()}`;
  }

  private appendToTasksLog(line: string): void {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const ts = new Date().toISOString();
    const entry = `[${ts}] ${line}\n`;
    fs.appendFileSync(this.logPath, entry, "utf8");
  }

  getLogs(tailLines?: number): string {
    if (!fs.existsSync(this.logPath)) return "";
    const content = fs.readFileSync(this.logPath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    if (tailLines == null || tailLines <= 0 || lines.length <= tailLines) {
      return content;
    }
    return lines.slice(-tailLines).join("\n") + "\n";
  }

  runTask(taskName: string): { jobId: string } {
    if (this.runningTaskName !== null) {
      throw new Error(`CONFLICT: task "${this.runningTaskName}" is already running`);
    }
    const def = this.taskDefs.get(taskName);
    if (!def) {
      throw new Error(`Unknown task: ${taskName}`);
    }
    assertCompiled(this.root);

    const jobId = this.createJobId();
    const job: Job = {
      id: jobId,
      status: "running",
      log: [],
      startedAt: Date.now(),
      taskName,
    };
    this.jobs.set(jobId, job);
    this.runningTaskName = taskName;
    this.runningJobId = jobId;

    const appendLog = (line: string) => {
      this.appendToTasksLog(`[${taskName}] ${line}`);
    };

    const finish = (status: "done" | "error", err?: string) => {
      job.status = status;
      job.finishedAt = Date.now();
      if (err) job.error = err;
      this.runningTaskName = null;
      this.runningJobId = null;
      if (err) this.appendToTasksLog(`[${taskName}] ERROR: ${err}`);
    };

    if (def.type === "process") {
      const proc = spawn(def.command, def.args, { cwd: this.root, shell: true });
      proc.stdout?.on("data", (data: Buffer) => {
        data
          .toString()
          .split("\n")
          .filter(Boolean)
          .forEach((line) => appendLog(line));
      });
      proc.stderr?.on("data", (data: Buffer) => {
        data
          .toString()
          .split("\n")
          .filter(Boolean)
          .forEach((line) => appendLog(line));
      });
      proc.on("close", (code) => {
        if (code === 0) {
          finish("done");
        } else {
          finish("error", `Process exited with code ${code}`);
        }
      });
      proc.on("error", (err) => {
        finish("error", err.message);
      });
      return { jobId };
    }

    // inProcess: patch job.log.push so each line is also written to tasks.log
    const runner = def.runner;
    const log = job.log;
    const origPush = log.push.bind(log);
    (log as unknown as { push: (...a: string[]) => number }).push = (...args: unknown[]) => {
      const strArgs = args.map((a) => (typeof a === "string" ? a : String(a)));
      const n = origPush(...strArgs);
      strArgs.forEach((line) => appendLog(line));
      return n;
    };
    runner(job)
      .then(() => finish("done"))
      .catch((err) => finish("error", err instanceof Error ? err.message : String(err)));
    return { jobId };
  }
}

const orchestrator = new TaskOrchestrator(ROOT, TASKS_LOG_PATH);

// ============================================================================
// JOB MANAGER — spawn optimizer processes and track status (used by orchestrator)
// ============================================================================

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

async function runPrizePicks(job: Job): Promise<void> {
  job.log.push("[PP] Building TypeScript...");
  const buildLog = await spawnStep("npx", ["tsc", "-p", "."], ROOT);
  job.log.push(...buildLog);

  job.log.push("[PP] Running PrizePicks optimizer...");
  const optLog = await spawnStep("node", ["dist/src/run_optimizer.js"], ROOT);
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
  const optLog = await spawnStep("node", ["dist/src/run_underdog_optimizer.js"], ROOT);
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
  const ppLog = await spawnStep("node", ["dist/src/run_optimizer.js"], ROOT);
  job.log.push(...ppLog);

  job.log.push("[BOTH] Running Underdog optimizer...");
  const udLog = await spawnStep("node", ["dist/src/run_underdog_optimizer.js"], ROOT);
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

// Register all tasks with the orchestrator (process-based and in-process)
orchestrator.registerInProcessTask("pp", runPrizePicks);
orchestrator.registerInProcessTask("ud", runUnderdog);
orchestrator.registerInProcessTask("both", runBoth);
orchestrator.registerProcessTask("scanner", "npm", ["run", "scanner"]);
orchestrator.registerProcessTask("agent", "npm", ["run", "agent"]);
orchestrator.registerProcessTask("nightly", "npm", ["run", "nightly"]);

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
// ROUTES — Run endpoints (legacy) and unified POST /api/tasks
// ============================================================================

app.post("/api/run/pp", (_req: Request, res: Response) => {
  try {
    if (orchestrator.isRunning()) {
      return res.status(409).json({ error: "A task is already running", running: orchestrator.getRunningTask() });
    }
    const { jobId } = orchestrator.runTask("pp");
    return res.json({ jobId, status: "started" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("CONFLICT:")) return res.status(409).json({ error: msg, running: orchestrator.getRunningTask() });
    if (msg.includes("Missing artifact")) return res.status(503).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
});

app.post("/api/run/ud", (_req: Request, res: Response) => {
  try {
    if (orchestrator.isRunning()) {
      return res.status(409).json({ error: "A task is already running", running: orchestrator.getRunningTask() });
    }
    const { jobId } = orchestrator.runTask("ud");
    return res.json({ jobId, status: "started" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("CONFLICT:")) return res.status(409).json({ error: msg, running: orchestrator.getRunningTask() });
    if (msg.includes("Missing artifact")) return res.status(503).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
});

app.post("/api/run/both", (_req: Request, res: Response) => {
  try {
    if (orchestrator.isRunning()) {
      return res.status(409).json({ error: "A task is already running", running: orchestrator.getRunningTask() });
    }
    const { jobId } = orchestrator.runTask("both");
    return res.json({ jobId, status: "started" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("CONFLICT:")) return res.status(409).json({ error: msg, running: orchestrator.getRunningTask() });
    if (msg.includes("Missing artifact")) return res.status(503).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
});

// Recalculate: skip fetch, use cached legs CSV, filter to future games only. In-memory lock + 10min timeout.
const RECALCULATE_TIMEOUT_MS = 10 * 60 * 1000;
let isRecalculating = false;
let recalculateTimeoutId: ReturnType<typeof setTimeout> | null = null;

function clearRecalculateLock(): void {
  isRecalculating = false;
  if (recalculateTimeoutId != null) {
    clearTimeout(recalculateTimeoutId);
    recalculateTimeoutId = null;
  }
}

app.post("/api/recalculate", (_req: Request, res: Response) => {
  if (isRecalculating) {
    return res.status(409).json({ status: "busy" });
  }
  try {
    assertCompiled(ROOT);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(503).json({ error: msg });
  }
  let bankroll = 600;
  const lastRunPath = getArtifactsPath(LAST_RUN_JSON, ROOT);
  if (fs.existsSync(lastRunPath)) {
    try {
      const last = JSON.parse(fs.readFileSync(lastRunPath, "utf8"));
      if (typeof last.bankroll === "number" && last.bankroll > 0) bankroll = Math.round(last.bankroll);
    } catch (_) {
      /* use default */
    }
  }
  const scriptPath = path.join(ROOT, "dist", "src", "run_optimizer.js");
  const proc = spawn("node", [scriptPath, "--recalculate", "--platform", "both", "--bankroll", String(bankroll)], {
    cwd: ROOT,
    stdio: "ignore",
  });
  isRecalculating = true;
  recalculateTimeoutId = setTimeout(clearRecalculateLock, RECALCULATE_TIMEOUT_MS);
  proc.on("exit", () => {
    clearRecalculateLock();
  });
  proc.on("error", () => {
    clearRecalculateLock();
  });
  return res.status(202).json({ status: "started" });
});

// Unified task endpoint: POST /api/tasks { "taskName": "scanner" | "pp" | "ud" | "both" | "agent" | "nightly" }
app.post("/api/tasks", (req: Request, res: Response) => {
  const taskName = req.body?.taskName;
  if (!taskName || typeof taskName !== "string") {
    return res.status(400).json({ error: "Missing or invalid taskName" });
  }
  try {
    if (orchestrator.isRunning()) {
      return res.status(409).json({
        error: "A task is already running",
        running: orchestrator.getRunningTask(),
      });
    }
    const { jobId } = orchestrator.runTask(taskName.trim());
    return res.status(202).json({ jobId, status: "started", taskName: taskName.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("CONFLICT:")) {
      return res.status(409).json({ error: msg, running: orchestrator.getRunningTask() });
    }
    if (msg.startsWith("Unknown task:")) {
      return res.status(400).json({ error: msg });
    }
    if (msg.includes("Missing artifact")) {
      return res.status(503).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
});

// Helper: read a log file with optional tail (for main log and tasks.log.old)
function readLogFileWithTail(filePath: string, tailLines?: number): string {
  if (!fs.existsSync(filePath)) return "";
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  if (tailLines == null || tailLines <= 0 || lines.length <= tailLines) {
    return content;
  }
  return lines.slice(-tailLines).join("\n") + "\n";
}

// GET /api/logs — timestamped task output (?tail=N, ?archive=true for rotated log)
app.get("/api/logs", (req: Request, res: Response) => {
  let tail: number | undefined;
  if (req.query.tail != null) {
    const n = parseInt(String(req.query.tail), 10);
    tail = Number.isNaN(n) || n <= 0 ? undefined : n;
  }
  const useArchive = req.query.archive === "true" || req.query.archive === "1";
  const logPath = TASKS_LOG_PATH;
  const oldPath = logPath + ".old";
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  try {
    if (useArchive) {
      const content = readLogFileWithTail(oldPath, tail);
      return res.send(content || "[No archived log.]\n");
    }
    if (!fs.existsSync(logPath)) {
      if (fs.existsSync(oldPath)) {
        return res.send(
          "Log rotated, archive available.\nUse ?archive=true to view the archived log.\n"
        );
      }
      return res.send("[No task log yet.]\n");
    }
    const content = readLogFileWithTail(logPath, tail);
    return res.send(content || "[No task log yet.]\n");
  } catch (err) {
    console.error("[Server] GET /api/logs failed:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/tracker-results — leg hit/miss from data/perf_tracker.jsonl (for dashboard Top Legs dots)
app.get("/api/tracker-results", (_req: Request, res: Response) => {
  try {
    const rows = readTrackerRows();
    const payload = rows.map((r) => ({
      leg_key: r.leg_id,
      result: r.result === 1 ? "hit" as const : r.result === 0 ? "miss" as const : null,
    }));
    res.json(payload);
  } catch {
    res.status(404).json({ error: "Tracker results not available" });
  }
});

// ============================================================================
// ROUTES — Job status
// ============================================================================

app.get("/api/status/:jobId", (req: Request, res: Response) => {
  const jobId = typeof req.params.jobId === "string" ? req.params.jobId : req.params.jobId?.[0] ?? "";
  const job = orchestrator.getJob(jobId) ?? jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  const tailLog = job.log.slice(-100);
  res.json({
    jobId: job.id,
    status: job.status,
    taskName: job.taskName ?? null,
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
    const ppData = readJsonFile(getOutputPath(PP_CARDS_JSON, ROOT));
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
    const udData = readJsonFile(getOutputPath(UD_CARDS_JSON, ROOT));
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
    const ppLegs = readJsonFile(getOutputPath(PP_LEGS_JSON, ROOT));
    if (Array.isArray(ppLegs)) {
      for (const leg of ppLegs) {
        leg.site = "PP";
        results.push(leg as LegRecord);
      }
    }
  }

  // Read Underdog legs
  if (!siteFilter || siteFilter === "UD") {
    const udLegs = readJsonFile(getOutputPath(UD_LEGS_JSON, ROOT));
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

  // Sort by selection EV descending (adjEv when flag on, else legEv)
  filtered.sort((a, b) => getSelectionEv(b as unknown as EvPick) - getSelectionEv(a as unknown as EvPick));

  res.json({ count: filtered.length, legs: filtered });
});

// GET /api/top-legs — bench: top 10 legs per site (data/top_legs.json)
const TOP_LEGS_PATH = getDataPath(TOP_LEGS_JSON, ROOT);
app.get("/api/top-legs", async (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(TOP_LEGS_PATH)) {
      return res.status(404).json({ error: "Top legs file not found. Run the optimizer to generate data/top_legs.json." });
    }
    const raw = await fs.promises.readFile(TOP_LEGS_PATH, "utf8");
    const data = JSON.parse(raw) as { prizePicks?: unknown[]; underdog?: unknown[] };
    res.json({ prizePicks: data.prizePicks ?? [], underdog: data.underdog ?? [] });
  } catch (err) {
    console.error("[Server] GET /api/top-legs failed:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================================
// ROUTES — Tracker (pending_cards.json for grading picks)
// ============================================================================

const PENDING_CARDS_PATH = path.join(ROOT, DATA_DIR, "tracking", "pending_cards.json");
const HISTORY_PATH = path.join(ROOT, DATA_DIR, "tracking", "history.json");

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
        "POST /api/tasks (body: { taskName })",
        "GET  /api/status/:jobId",
        "GET  /api/logs?tail=N",
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
