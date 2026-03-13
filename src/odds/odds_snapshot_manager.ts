// src/odds/odds_snapshot_manager.ts
// Singleton manager enforcing one odds clock per run.
// PP and UD merges call getSnapshot() and receive the same instance.

import fs from "fs";
import path from "path";
import { PlayerPropOdds, Sport } from "../types";
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
import { filterValidOddsRows } from "./normalize_odds";

const SNAPSHOTS_DIR = path.join(process.cwd(), "data", "odds_snapshots");
const STATE_FILE = path.join(SNAPSHOTS_DIR, "state.json");
const AUTO_STALE_MINUTES = 120;

type FetchFn = (sports: Sport[], opts: { forceRefresh: boolean }) => Promise<PlayerPropOdds[]>;

export interface SnapshotManagerOptions {
  fetchFn: FetchFn;
  sports: Sport[];
  includeAltLines: boolean;
  refreshMode: OddsRefreshMode;
  /** Minutes after which auto mode treats snapshot as stale and fetches live (default 120). */
  oddsMaxAgeMin?: number;
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
    const { sports, includeAltLines, refreshMode, oddsMaxAgeMin } = this.options;
    const paramsHash = hashRequestParams(sports, includeAltLines);
    const resolvedMode = resolveRefreshMode(refreshMode, oddsMaxAgeMin);

    if (resolvedMode === "live") {
      this.currentSnapshot = await this.fetchLive(sports, includeAltLines, paramsHash);
    } else {
      const cached = loadLatestSnapshot(sports);
      const sourceMatches = cached && (cached.source === "OddsAPI" || cached.source === "none");
      if (cached && cached.rows.length > 0 && sourceMatches) {
        const { rows, invalidDropped } = filterValidOddsRows(cached.rows);
        const age = computeAgeMinutes(cached.fetchedAtUtc);
        this.currentSnapshot = {
          ...cached,
          rows,
          refreshMode: "cache",
          ageMinutes: age,
          invalidOddsDropped: invalidDropped > 0 ? invalidDropped : undefined,
        };
      } else {
        const reason = !cached
          ? "no cached snapshot found"
          : cached.rows.length === 0
            ? "cached snapshot has 0 rows"
            : !sourceMatches
              ? `cached source=${cached.source} does not match requested (OddsAPI)`
              : "unknown";
        console.log(`[OddsSnapshot] ${reason}, falling back to live fetch`);
        this.currentSnapshot = await this.fetchLive(sports, includeAltLines, paramsHash);
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
  ): Promise<OddsSnapshot> {
    const rawRows = await this.fetchFn!(sports, { forceRefresh: true });
    const { rows, invalidDropped } = filterValidOddsRows(rawRows);
    if (invalidDropped > 0) {
      console.log(`[OddsSnapshot] Normalized odds: dropped ${invalidDropped} rows with invalid American odds (0 or |x|<100 or |x|>10000).`);
    }
    const fetchedAtUtc = new Date().toISOString();
    const snapshotId = generateSnapshotId(fetchedAtUtc, "OddsAPI", rows.length);
    const source = rows.length > 0 ? ("OddsAPI" as const) : ("none" as const);

    const snapshot: OddsSnapshot = {
      snapshotId,
      fetchedAtUtc,
      source,
      refreshMode: "live",
      includeAltLines,
      requestParamsHash: paramsHash,
      rows,
      ageMinutes: 0,
      invalidOddsDropped: invalidDropped > 0 ? invalidDropped : undefined,
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
  return `OddsAPI_${league}_${ts}_${paramsHash}.json`;
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
    const source = disk.source === "OddsAPI" || disk.source === "none" ? disk.source : "OddsAPI";
    return {
      snapshotId: disk.snapshotId,
      fetchedAtUtc: disk.fetchedAtUtc,
      source,
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
