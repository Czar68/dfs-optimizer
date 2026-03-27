/**
 * Phase 56 — Odds snapshot health thresholds, classification, and auto-mode cache rejection.
 */
import fs from "fs";
import path from "path";
import {
  evaluateOddsSnapshotHealth,
  resolveOddsSnapshotHealthThresholds,
  isPlaceholderPlayerName,
  writeOddsSnapshotHealthArtifacts,
  DEFAULT_MIN_ROWS,
} from "../src/odds/odds_snapshot_health";
import { OddsSnapshotManager, _writeState } from "../src/odds/odds_snapshot_manager";
import { hashRequestParams } from "../src/odds/odds_snapshot";
import type { InternalPlayerPropOdds, Sport } from "../src/types";

const STATE_FILE = path.join(process.cwd(), "data", "odds_snapshots", "state.json");
const SNAPSHOTS_DIR = path.join(process.cwd(), "data", "odds_snapshots");
const LATEST_NBA = path.join(SNAPSHOTS_DIR, "latest_live_NBA.json");

function clearState(): void {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

function makePlaceholderRows(n: number): InternalPlayerPropOdds[] {
  return Array.from({ length: n }, (_, i) => ({
    sport: "NBA" as const,
    player: `Player ${i}`,
    team: "LAL",
    opponent: "BOS",
    league: "NBA",
    stat: "points" as InternalPlayerPropOdds["stat"],
    line: 20 + i,
    overOdds: -110,
    underOdds: -110,
    book: "consensus",
    eventId: `evt-${i}`,
    marketId: null,
    selectionIdOver: null,
    selectionIdUnder: null,
  }));
}

function makeHealthyRows(n: number): InternalPlayerPropOdds[] {
  return Array.from({ length: n }, (_, i) => ({
    sport: "NBA" as const,
    player: `Anthony Davis ${i % 40}`,
    team: "LAL",
    opponent: "BOS",
    league: "NBA",
    stat: (i % 2 === 0 ? "points" : "rebounds") as InternalPlayerPropOdds["stat"],
    line: 20 + (i % 15),
    overOdds: -110,
    underOdds: -110,
    book: "draftkings",
    eventId: `evt-${i}`,
    marketId: null,
    selectionIdOver: null,
    selectionIdUnder: null,
  }));
}

describe("Phase 56 — isPlaceholderPlayerName", () => {
  it("detects Player N pattern", () => {
    expect(isPlaceholderPlayerName("Player 0")).toBe(true);
    expect(isPlaceholderPlayerName("  Player 49  ")).toBe(true);
    expect(isPlaceholderPlayerName("LeBron James")).toBe(false);
  });
});

describe("Phase 56 — evaluateOddsSnapshotHealth", () => {
  const thresholds = resolveOddsSnapshotHealthThresholds(
    {
      minRows: 200,
      maxPlaceholderPlayerShare: 0.15,
      minDistinctStats: 2,
      maxAgeMinutes: 120,
    },
    undefined,
    120,
  );

  it("marks tiny placeholder-heavy points-only snapshot UNHEALTHY", () => {
    const rows = makePlaceholderRows(50);
    const r = evaluateOddsSnapshotHealth(rows, { ageMinutes: 5, thresholds });
    expect(r.healthy).toBe(false);
    expect(r.reasons).toContain("row_count_below_min");
    expect(r.reasons).toContain("placeholder_players_high");
    expect(r.reasons).toContain("narrow_stat_breadth");
    expect(r.checks.rowCount.ok).toBe(false);
    expect(r.checks.placeholderShare.ok).toBe(false);
    expect(r.checks.distinctStats.value).toBe(1);
  });

  it("marks HEALTHY when rows, names, stats, and age pass", () => {
    const rows = makeHealthyRows(250);
    const r = evaluateOddsSnapshotHealth(rows, { ageMinutes: 10, thresholds });
    expect(r.healthy).toBe(true);
    expect(r.reasons).toHaveLength(0);
    expect(r.checks.distinctStats.value).toBeGreaterThanOrEqual(2);
  });

  it("flags snapshot_age_stale when age exceeds max", () => {
    const rows = makeHealthyRows(250);
    const r = evaluateOddsSnapshotHealth(rows, { ageMinutes: 200, thresholds });
    expect(r.healthy).toBe(false);
    expect(r.reasons).toContain("snapshot_age_stale");
  });
});

describe("Phase 56 — writeOddsSnapshotHealthArtifacts", () => {
  it("writes json and md under data/reports", () => {
    const rows = makeHealthyRows(220);
    const snap = {
      snapshotId: "abc",
      fetchedAtUtc: "2026-01-01T00:00:00.000Z",
      refreshMode: "live" as const,
      source: "OddsAPI" as const,
      rows,
    };
    const th = resolveOddsSnapshotHealthThresholds(undefined, undefined, 120);
    const health = evaluateOddsSnapshotHealth(rows, { ageMinutes: 0, thresholds: th });
    const root = path.join(process.cwd(), "data", "reports");
    const jsonPath = path.join(root, "latest_odds_snapshot_health.json");
    const mdPath = path.join(root, "latest_odds_snapshot_health.md");
    const prevJson = fs.existsSync(jsonPath) ? fs.readFileSync(jsonPath, "utf8") : null;
    const prevMd = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : null;
    try {
      writeOddsSnapshotHealthArtifacts(snap, health, { configuredRefreshMode: "live" });
      expect(fs.existsSync(jsonPath)).toBe(true);
      expect(fs.existsSync(mdPath)).toBe(true);
      const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      expect(j.healthy).toBe(true);
      expect(j.reasons).toEqual([]);
      expect(j.checks.rowCount.value).toBe(220);
    } finally {
      if (prevJson !== null) fs.writeFileSync(jsonPath, prevJson, "utf8");
      else if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
      if (prevMd !== null) fs.writeFileSync(mdPath, prevMd, "utf8");
      else if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
    }
  });
});

describe("Phase 56 — OddsSnapshotManager auto rejects unhealthy cache", () => {
  let backupLatest: string | null = null;
  let backupState: string | null = null;
  let networkCallCount = 0;

  const mockFetchHealthy = async (_sports: Sport[], _opts: { forceRefresh: boolean }): Promise<InternalPlayerPropOdds[]> => {
    networkCallCount++;
    return makeHealthyRows(300);
  };

  beforeEach(() => {
    OddsSnapshotManager.reset();
    networkCallCount = 0;
    if (fs.existsSync(LATEST_NBA)) backupLatest = fs.readFileSync(LATEST_NBA, "utf8");
    else backupLatest = null;
    if (fs.existsSync(STATE_FILE)) backupState = fs.readFileSync(STATE_FILE, "utf8");
    else backupState = null;
  });

  afterEach(() => {
    OddsSnapshotManager.reset();
    if (backupLatest !== null) fs.writeFileSync(LATEST_NBA, backupLatest, "utf8");
    else if (fs.existsSync(LATEST_NBA)) fs.unlinkSync(LATEST_NBA);
    if (backupState !== null) fs.writeFileSync(STATE_FILE, backupState, "utf8");
    else if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  });

  it("auto mode: unhealthy cached snapshot triggers live fetch", async () => {
    const h = hashRequestParams(["NBA"], true);
    const fetchedAtUtc = "2026-06-01T12:00:00.000Z";
    const fname = `OddsAPI_NBA_${fetchedAtUtc.replace(/[:.]/g, "-").slice(0, 19)}_${h}.json`;
    const diskPath = path.join(SNAPSHOTS_DIR, fname);
    const badRows = makePlaceholderRows(50);
    const disk = {
      snapshotId: "phase56bad",
      fetchedAtUtc,
      source: "OddsAPI" as const,
      includeAltLines: true,
      requestParamsHash: h,
      totalRows: badRows.length,
      rows: badRows,
    };
    fs.writeFileSync(diskPath, JSON.stringify(disk, null, 2), "utf8");
    fs.writeFileSync(
      LATEST_NBA,
      JSON.stringify({ pointer: fname, snapshotId: "phase56bad", fetchedAtUtc }, null, 2),
      "utf8",
    );
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    _writeState({ lastLiveFetchedAtUtc: thirtyMinAgo, lastSnapshotId: "phase56bad" });

    OddsSnapshotManager.configure({
      fetchFn: mockFetchHealthy,
      sports: ["NBA"],
      includeAltLines: true,
      refreshMode: "auto",
      oddsSnapshotHealth: {
        minRows: DEFAULT_MIN_ROWS,
        maxPlaceholderPlayerShare: 0.15,
        minDistinctStats: 2,
        maxAgeMinutes: 120,
      },
    });

    const snap = await OddsSnapshotManager.getSnapshot();
    expect(networkCallCount).toBe(1);
    expect(snap.refreshMode).toBe("live");
    expect(snap.rows).toHaveLength(300);
    expect(snap.health?.healthy).toBe(true);
  });
});
