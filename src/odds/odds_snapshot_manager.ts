// src/odds/odds_snapshot_manager.ts
// Singleton manager enforcing one odds clock per run.
// PP and UD merges call getSnapshot() and receive the same instance.

import fs from "fs";
import path from "path";
import { SgoPlayerPropOdds, Sport } from "../types";
import {
  OddsSnapshot,
  OddsRefreshMode,
  SnapshotDiskFormat,
  SnapshotState,
  generateSnapshotId,
  hashRequestParams,
  computeAgeMinutes,
  formatSnapshotLogLine,
} from "./odds_snapshot";

const SNAPSHOTS_DIR = path.join(process.cwd(), "data", "odds_snapshots");
const STATE_FILE = path.join(SNAPSHOTS_DIR, "state.json");
const AUTO_STALE_MINUTES = 120;

type FetchFn = (sports: Sport[], opts: { forceRefresh: boolean }) => Promise<SgoPlayerPropOdds[]>;

export interface SnapshotManagerOptions {
  fetchFn: FetchFn;
  sports: Sport[];
  includeAltLines: boolean;
  refreshMode: OddsRefreshMode;
  /** Minutes after which auto mode treats snapshot as stale and fetches live (default 120). */
  oddsMaxAgeMin?: number;
  rundownOnly?: boolean;
}

export class OddsSnapshotManager {
  private static currentSnapshot: OddsSnapshot | null = null;
  private static fetchFn: FetchFn | null = null;
  private static options: SnapshotManagerOptions | null = null;

  static configure(opts: SnapshotManagerOptions): void {
    this.fetchFn = opts.fetchFn;
    this.options = opts;
  }

  static reset(): void {
    this.currentSnapshot = null;
    this.fetchFn = null;
    this.options = null;
  }

  static getCurrentSnapshot(): OddsSnapshot | null {
    return this.currentSnapshot;
  }

  static async getSnapshot(): Promise<OddsSnapshot> {
    if (this.currentSnapshot) return this.currentSnapshot;
    if (!this.options || !this.fetchFn) {
      throw new Error("OddsSnapshotManager.configure() must be called before getSnapshot()");
    }

    ensureDir(SNAPSHOTS_DIR);
    const { sports, includeAltLines, refreshMode, rundownOnly, oddsMaxAgeMin } = this.options;
    const paramsHash = hashRequestParams(sports, includeAltLines);
    const resolvedMode = resolveRefreshMode(refreshMode, oddsMaxAgeMin);

    if (resolvedMode === "live") {
      this.currentSnapshot = await this.fetchLive(sports, includeAltLines, paramsHash, rundownOnly);
    } else {
      const cached = loadLatestSnapshot(sports);
      if (cached) {
        const age = computeAgeMinutes(cached.fetchedAtUtc);
        this.currentSnapshot = {
          ...cached,
          refreshMode: "cache",
          ageMinutes: age,
        };
      } else {
        console.log("[OddsSnapshot] No cached snapshot found, falling back to live fetch");
        this.currentSnapshot = await this.fetchLive(sports, includeAltLines, paramsHash, rundownOnly);
      }
    }

    const snapshot = this.currentSnapshot;
    if (snapshot) console.log(formatSnapshotLogLine(snapshot));
    if (!snapshot) throw new Error("OddsSnapshotManager: getSnapshot failed to resolve snapshot");
    return snapshot;
  }

  private static async fetchLive(
    sports: Sport[],
    includeAltLines: boolean,
    paramsHash: string,
    rundownOnly?: boolean,
  ): Promise<OddsSnapshot> {
    const rows = await this.fetchFn!(sports, { forceRefresh: true });
    const fetchedAtUtc = new Date().toISOString();
    const snapshotId = generateSnapshotId(fetchedAtUtc, "SGO", rows.length);
    const source = rundownOnly ? "TheRundown" as const : (rows.length > 0 ? "SGO" as const : "none" as const);

    const snapshot: OddsSnapshot = {
      snapshotId,
      fetchedAtUtc,
      source,
      refreshMode: "live",
      includeAltLines,
      requestParamsHash: paramsHash,
      rows,
      ageMinutes: 0,
    };

    writeSnapshot(snapshot, sports);
    writeState({ lastLiveFetchedAtUtc: fetchedAtUtc, lastSnapshotId: snapshotId });

    return snapshot;
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveRefreshMode(mode: OddsRefreshMode, maxAgeMinutes?: number): "live" | "cache" {
  if (mode === "live") return "live";
  if (mode === "cache") return "cache";

  const state = readState();
  if (!state.lastLiveFetchedAtUtc) return "live";

  const staleMin = maxAgeMinutes ?? AUTO_STALE_MINUTES;
  const age = computeAgeMinutes(state.lastLiveFetchedAtUtc);
  if (age > staleMin) {
    console.log(`[OddsSnapshot] Auto mode: last live fetch ${age.toFixed(0)}m ago (>${staleMin}m) → live`);
    return "live";
  }
  console.log(`[OddsSnapshot] Auto mode: last live fetch ${age.toFixed(0)}m ago (≤${staleMin}m) → cache`);
  return "cache";
}

function readState(): SnapshotState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch { /* ignore */ }
  return { lastLiveFetchedAtUtc: null, lastSnapshotId: null };
}

function writeState(state: SnapshotState): void {
  try {
    ensureDir(path.dirname(STATE_FILE));
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("[OddsSnapshot] Failed to write state:", err);
  }
}

function snapshotFilename(fetchedAtUtc: string, paramsHash: string, league: string): string {
  const ts = fetchedAtUtc.replace(/[:.]/g, "-").slice(0, 19);
  return `SGO_${league}_${ts}_${paramsHash}.json`;
}

function writeSnapshot(snapshot: OddsSnapshot, sports: Sport[]): void {
  try {
    ensureDir(SNAPSHOTS_DIR);
    const league = sports.join("_");
    const fname = snapshotFilename(snapshot.fetchedAtUtc, snapshot.requestParamsHash, league);
    const disk: SnapshotDiskFormat = {
      snapshotId: snapshot.snapshotId,
      fetchedAtUtc: snapshot.fetchedAtUtc,
      source: snapshot.source,
      includeAltLines: snapshot.includeAltLines,
      requestParamsHash: snapshot.requestParamsHash,
      totalRows: snapshot.rows.length,
      rows: snapshot.rows,
    };
    const fullPath = path.join(SNAPSHOTS_DIR, fname);
    fs.writeFileSync(fullPath, JSON.stringify(disk, null, 2), "utf8");

    const latestPath = path.join(SNAPSHOTS_DIR, `latest_live_${league}.json`);
    fs.writeFileSync(latestPath, JSON.stringify({ pointer: fname, snapshotId: snapshot.snapshotId, fetchedAtUtc: snapshot.fetchedAtUtc }, null, 2), "utf8");

    console.log(`[OddsSnapshot] Wrote ${snapshot.rows.length} rows → ${fname}`);
  } catch (err) {
    console.error("[OddsSnapshot] Failed to write snapshot:", err);
  }
}

function loadLatestSnapshot(sports: Sport[]): OddsSnapshot | null {
  try {
    const league = sports.join("_");
    const latestPath = path.join(SNAPSHOTS_DIR, `latest_live_${league}.json`);
    if (!fs.existsSync(latestPath)) return null;

    const pointer = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    const dataPath = path.join(SNAPSHOTS_DIR, pointer.pointer);
    if (!fs.existsSync(dataPath)) return null;

    const disk: SnapshotDiskFormat = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    return {
      snapshotId: disk.snapshotId,
      fetchedAtUtc: disk.fetchedAtUtc,
      source: disk.source,
      refreshMode: "cache",
      includeAltLines: disk.includeAltLines,
      requestParamsHash: disk.requestParamsHash,
      rows: disk.rows,
      ageMinutes: computeAgeMinutes(disk.fetchedAtUtc),
    };
  } catch {
    return null;
  }
}

export { resolveRefreshMode as _resolveRefreshMode, readState as _readState, writeState as _writeState, AUTO_STALE_MINUTES };
