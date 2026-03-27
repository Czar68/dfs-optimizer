import fs from "fs";
import os from "os";
import path from "path";
import { reconcileClosingLines } from "../src/tracking/reconcile_closing_lines";

function mkTmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clv-reconcile-"));
  fs.mkdirSync(path.join(root, "data", "tracking"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "odds_snapshots"), { recursive: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  return root;
}

function writeSnapshot(root: string, fetchedAtUtc: string, rows: any[]): void {
  const p = path.join(root, "data", "odds_snapshots", `OddsAPI_NBA_${fetchedAtUtc.replace(/[:.]/g, "-")}_x.json`);
  fs.writeFileSync(
    p,
    JSON.stringify({ snapshotId: "s1", fetchedAtUtc, source: "OddsAPI", includeAltLines: true, requestParamsHash: "x", totalRows: rows.length, rows }, null, 2),
    "utf8"
  );
}

describe("Phase 16O CLV reconciliation", () => {
  const oldCwd = process.cwd();
  afterEach(() => {
    process.chdir(oldCwd);
  });

  it("reconciles matched leg with pre-start snapshot", () => {
    const root = mkTmpRoot();
    process.chdir(root);
    const pending = {
      timestamp: "2026-03-20T00:00:00.000Z",
      cards: [
        {
          cardId: "c1",
          platform: "PP",
          flexType: "3P",
          projectedEv: 0.1,
          timestamp: "2026-03-20T00:00:00.000Z",
          legs: [
            {
              playerName: "LaMelo Ball",
              market: "threes",
              line: 2.5,
              pick: "Over",
              projectedProb: 0.6,
              openImpliedProb: 0.5,
              result: "Pending",
              gameStartTime: "2026-03-20T02:00:00.000Z"
            }
          ]
        }
      ]
    };
    fs.writeFileSync(path.join(root, "data", "tracking", "pending_cards.json"), JSON.stringify(pending, null, 2), "utf8");
    fs.writeFileSync(path.join(root, "data", "perf_tracker.jsonl"), "", "utf8");
    writeSnapshot(root, "2026-03-20T01:30:00.000Z", [
      { league: "NBA", player: "LaMelo Ball", stat: "threes", line: 2.5, overOdds: -130, underOdds: 110 }
    ]);

    const out = reconcileClosingLines({ rootDir: root, snapshotsDir: path.join(root, "data", "odds_snapshots") });
    expect(out.pendingStats.updated).toBe(1);
    const updated = JSON.parse(fs.readFileSync(path.join(root, "data", "tracking", "pending_cards.json"), "utf8"));
    const leg = updated.cards[0].legs[0];
    expect(leg.closeOddsAmerican).toBe(-130);
    expect(typeof leg.closeImpliedProb).toBe("number");
    expect(typeof leg.clvDelta).toBe("number");
  });

  it("skips when no game start time", () => {
    const root = mkTmpRoot();
    process.chdir(root);
    fs.writeFileSync(path.join(root, "data", "tracking", "pending_cards.json"), JSON.stringify({
      timestamp: "x",
      cards: [{ cardId: "c1", platform: "PP", flexType: "3P", projectedEv: 0.1, timestamp: "x", legs: [{ playerName: "A", market: "points", line: 1.5, pick: "Over", projectedProb: 0.5, result: "Pending" }] }]
    }, null, 2), "utf8");
    fs.writeFileSync(path.join(root, "data", "perf_tracker.jsonl"), "", "utf8");
    const out = reconcileClosingLines({ rootDir: root, snapshotsDir: path.join(root, "data", "odds_snapshots") });
    expect(out.pendingStats.skippedNoStart).toBe(1);
  });

  it("skips ambiguous odds in latest valid snapshot", () => {
    const root = mkTmpRoot();
    process.chdir(root);
    fs.writeFileSync(path.join(root, "data", "tracking", "pending_cards.json"), JSON.stringify({
      timestamp: "x",
      cards: [{ cardId: "c1", platform: "PP", flexType: "3P", projectedEv: 0.1, timestamp: "x", legs: [{ playerName: "A", market: "points", line: 10.5, pick: "Over", projectedProb: 0.5, openImpliedProb: 0.5, gameStartTime: "2026-03-20T03:00:00.000Z", result: "Pending" }] }]
    }, null, 2), "utf8");
    fs.writeFileSync(path.join(root, "data", "perf_tracker.jsonl"), "", "utf8");
    writeSnapshot(root, "2026-03-20T02:30:00.000Z", [
      { league: "NBA", player: "A", stat: "points", line: 10.5, overOdds: -110, underOdds: -110 },
      { league: "NBA", player: "A", stat: "points", line: 10.5, overOdds: -125, underOdds: 100 }
    ]);
    const out = reconcileClosingLines({ rootDir: root, snapshotsDir: path.join(root, "data", "odds_snapshots") });
    expect(out.pendingStats.skippedAmbiguous).toBe(1);
    expect(out.pendingStats.updated).toBe(0);
  });

  it("is idempotent on rerun without force", () => {
    const root = mkTmpRoot();
    process.chdir(root);
    fs.writeFileSync(path.join(root, "data", "tracking", "pending_cards.json"), JSON.stringify({
      timestamp: "x",
      cards: [{ cardId: "c1", platform: "PP", flexType: "3P", projectedEv: 0.1, timestamp: "x", legs: [{ playerName: "B", market: "assists", line: 2.5, pick: "Over", projectedProb: 0.5, openImpliedProb: 0.5, gameStartTime: "2026-03-20T03:00:00.000Z", result: "Pending" }] }]
    }, null, 2), "utf8");
    fs.writeFileSync(path.join(root, "data", "perf_tracker.jsonl"), "", "utf8");
    writeSnapshot(root, "2026-03-20T02:30:00.000Z", [
      { league: "NBA", player: "B", stat: "assists", line: 2.5, overOdds: -120, underOdds: 100 }
    ]);
    const first = reconcileClosingLines({ rootDir: root, snapshotsDir: path.join(root, "data", "odds_snapshots") });
    const second = reconcileClosingLines({ rootDir: root, snapshotsDir: path.join(root, "data", "odds_snapshots") });
    expect(first.pendingStats.updated).toBe(1);
    expect(second.pendingStats.alreadyPopulated).toBe(1);
    expect(second.pendingStats.updated).toBe(0);
  });
});

