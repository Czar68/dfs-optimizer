// src/__tests__/odds_snapshot.test.ts
// Unit tests for OddsSnapshotManager refresh policy + snapshot identity.

import {
  OddsSnapshotManager,
  _resolveRefreshMode,
  _readState,
  _writeState,
  AUTO_STALE_MINUTES,
} from "../odds/odds_snapshot_manager";
import {
  generateSnapshotId,
  hashRequestParams,
  computeAgeMinutes,
  formatSnapshotLogLine,
  OddsSnapshot,
} from "../odds/odds_snapshot";
import type { PlayerPropOdds, Sport } from "../types";
import fs from "fs";
import path from "path";

const SNAPSHOTS_DIR = path.join(process.cwd(), "data", "odds_snapshots");
const STATE_FILE = path.join(SNAPSHOTS_DIR, "state.json");

function clearState(): void {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

function makeFakeRows(n: number): PlayerPropOdds[] {
  return Array.from({ length: n }, (_, i) => ({
    sport: "NBA" as const,
    player: `Player ${i}`,
    team: "LAL",
    opponent: "BOS",
    league: "NBA",
    stat: "points" as any,
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

let networkCallCount = 0;
const mockFetchFn = async (_sports: Sport[], _opts: { forceRefresh: boolean }): Promise<PlayerPropOdds[]> => {
  networkCallCount++;
  return makeFakeRows(50);
};

beforeEach(() => {
  OddsSnapshotManager.reset();
  clearState();
  networkCallCount = 0;
});

afterAll(() => {
  OddsSnapshotManager.reset();
  jest.useRealTimers();
});

// ── Utility tests ──────────────────────────────────────────────────────────

describe("generateSnapshotId", () => {
  it("produces deterministic 12-char hex", () => {
    const a = generateSnapshotId("2026-02-28T10:00:00.000Z", "OddsAPI", 100);
    const b = generateSnapshotId("2026-02-28T10:00:00.000Z", "OddsAPI", 100);
    expect(a).toBe(b);
    expect(a).toHaveLength(12);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });
});

describe("hashRequestParams", () => {
  it("same input → same hash, order-independent", () => {
    const a = hashRequestParams(["NBA", "NFL"], false);
    const b = hashRequestParams(["NFL", "NBA"], false);
    expect(a).toBe(b);
  });
  it("different includeAltLines → different hash", () => {
    const a = hashRequestParams(["NBA"], false);
    const b = hashRequestParams(["NBA"], true);
    expect(a).not.toBe(b);
  });
});

describe("computeAgeMinutes", () => {
  it("returns 0 for now", () => {
    const now = new Date();
    expect(computeAgeMinutes(now.toISOString(), now)).toBeCloseTo(0, 0);
  });
  it("returns ~60 for 1 hour ago", () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    expect(computeAgeMinutes(oneHourAgo.toISOString(), now)).toBeCloseTo(60, 0);
  });
});

describe("formatSnapshotLogLine", () => {
  it("contains required fields", () => {
    const snap: OddsSnapshot = {
      snapshotId: "abc123def456",
      fetchedAtUtc: "2026-02-28T10:00:00.000Z",
      source: "OddsAPI",
      refreshMode: "live",
      includeAltLines: true,
      requestParamsHash: "aabbccdd",
      rows: makeFakeRows(10),
      ageMinutes: 5,
    };
    const line = formatSnapshotLogLine(snap);
    expect(line).toContain("ODDS_SNAPSHOT");
    expect(line).toContain("id=abc123def456");
    expect(line).toContain("refreshMode=live");
    expect(line).toContain("rows=10");
  });
});

// ── Refresh policy tests ───────────────────────────────────────────────────

describe("refresh policy: resolveRefreshMode", () => {
  it("live override → live always", () => {
    expect(_resolveRefreshMode("live")).toBe("live");
  });

  it("cache override → cache always", () => {
    _writeState({
      lastLiveFetchedAtUtc: new Date().toISOString(),
      lastSnapshotId: "x",
    });
    expect(_resolveRefreshMode("cache")).toBe("cache");
  });

  it("auto with no prior fetch → live", () => {
    clearState();
    expect(_resolveRefreshMode("auto")).toBe("live");
  });

  it("auto within 120m → cache", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    _writeState({ lastLiveFetchedAtUtc: thirtyMinAgo, lastSnapshotId: "x" });
    expect(_resolveRefreshMode("auto")).toBe("cache");
  });

  it("auto after 120m → live", () => {
    const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000).toISOString();
    _writeState({ lastLiveFetchedAtUtc: threeHoursAgo, lastSnapshotId: "x" });
    expect(_resolveRefreshMode("auto")).toBe("live");
  });
});

// ── Manager integration tests ──────────────────────────────────────────────

describe("OddsSnapshotManager", () => {
  it("live override → network called exactly once", async () => {
    OddsSnapshotManager.configure({
      fetchFn: mockFetchFn,
      sports: ["NBA"],
      includeAltLines: true,
      refreshMode: "live",
    });
    const snap = await OddsSnapshotManager.getSnapshot();
    expect(networkCallCount).toBe(1);
    expect(snap.refreshMode).toBe("live");
    expect(snap.rows).toHaveLength(50);
    expect(snap.ageMinutes).toBe(0);
  });

  it("cache override → never calls network when snapshot exists", async () => {
    OddsSnapshotManager.configure({
      fetchFn: mockFetchFn,
      sports: ["NBA"],
      includeAltLines: true,
      refreshMode: "live",
    });
    await OddsSnapshotManager.getSnapshot();
    expect(networkCallCount).toBe(1);

    OddsSnapshotManager.reset();

    OddsSnapshotManager.configure({
      fetchFn: mockFetchFn,
      sports: ["NBA"],
      includeAltLines: true,
      refreshMode: "cache",
    });
    const snap = await OddsSnapshotManager.getSnapshot();
    expect(networkCallCount).toBe(1);
    expect(snap.refreshMode).toBe("cache");
    expect(snap.rows).toHaveLength(50);
  });

  it("live override calls network even if within 120m", async () => {
    const recentFetch = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    _writeState({ lastLiveFetchedAtUtc: recentFetch, lastSnapshotId: "x" });

    OddsSnapshotManager.configure({
      fetchFn: mockFetchFn,
      sports: ["NBA"],
      includeAltLines: true,
      refreshMode: "live",
    });
    await OddsSnapshotManager.getSnapshot();
    expect(networkCallCount).toBe(1);
  });

  it("PP and UD receive identical snapshotId and fetchedAtUtc", async () => {
    OddsSnapshotManager.configure({
      fetchFn: mockFetchFn,
      sports: ["NBA"],
      includeAltLines: true,
      refreshMode: "live",
    });

    const ppSnapshot = await OddsSnapshotManager.getSnapshot();
    const udSnapshot = await OddsSnapshotManager.getSnapshot();
    expect(ppSnapshot.snapshotId).toBe(udSnapshot.snapshotId);
    expect(ppSnapshot.fetchedAtUtc).toBe(udSnapshot.fetchedAtUtc);
    expect(networkCallCount).toBe(1);
  });

  it("second getSnapshot() returns same instance (no re-fetch)", async () => {
    OddsSnapshotManager.configure({
      fetchFn: mockFetchFn,
      sports: ["NBA"],
      includeAltLines: true,
      refreshMode: "live",
    });
    const a = await OddsSnapshotManager.getSnapshot();
    const b = await OddsSnapshotManager.getSnapshot();
    expect(a).toBe(b);
    expect(networkCallCount).toBe(1);
  });
});
