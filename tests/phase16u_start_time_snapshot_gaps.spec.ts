import fs from "fs";
import os from "os";
import path from "path";
import { readTrackerRows } from "../src/perf_tracker_db";
import { enrichExistingTrackerStartTimes } from "../src/backfill_perf_tracker";
import { buildSnapshotCoverageGaps } from "../src/tracking/export_snapshot_coverage_gaps";
import { resolveCloseOddsFromSnapshots } from "../src/tracking/reconcile_closing_lines";

describe("Phase 16U start-time recovery + snapshot gaps", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("enriches missing gameStartTime from output_logs legs json", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16u-"));
    fs.mkdirSync(path.join(root, "data", "output_logs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "perf_tracker.jsonl"),
      JSON.stringify({
        date: "2026-03-20",
        leg_id: "ud-leg-1",
        player: "Player A",
        stat: "points",
        line: 20.5,
        book: "fanduel",
        trueProb: 0.55,
        projectedEV: 0.05,
        playedEV: 0.05,
        kelly: 0.1,
        card_tier: 1,
      }) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "data", "output_logs", "underdog-legs.json"),
      JSON.stringify([
        {
          id: "ud-leg-1",
          player: "Player A",
          stat: "points",
          line: 20.5,
          startTime: "2026-03-20T23:00:00Z",
          team: "AAA",
          opponent: "BBB",
        },
      ]),
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const out = enrichExistingTrackerStartTimes(root);
    const rows = readTrackerRows();
    expect(out.enriched).toBe(1);
    expect(rows[0]?.gameStartTime).toBe("2026-03-20T23:00:00Z");
    expect(rows[0]?.team).toBe("AAA");
    expect(rows[0]?.opponent).toBe("BBB");
  });

  it("does not overwrite an existing valid gameStartTime", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16u-"));
    fs.mkdirSync(path.join(root, "data", "output_logs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "perf_tracker.jsonl"),
      JSON.stringify({
        date: "2026-03-20",
        leg_id: "ud-leg-2",
        player: "Player B",
        stat: "rebounds",
        line: 10.5,
        book: "fanduel",
        trueProb: 0.55,
        projectedEV: 0.05,
        playedEV: 0.05,
        kelly: 0.1,
        card_tier: 1,
        gameStartTime: "2026-03-20T22:00:00Z",
      }) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "data", "output_logs", "underdog-legs.json"),
      JSON.stringify([
        {
          id: "ud-leg-2",
          player: "Player B",
          stat: "rebounds",
          line: 10.5,
          startTime: "2026-03-20T23:00:00Z",
        },
      ]),
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const out = enrichExistingTrackerStartTimes(root);
    const rows = readTrackerRows();
    expect(out.enriched).toBe(0);
    expect(out.skippedExisting).toBe(1);
    expect(rows[0]?.gameStartTime).toBe("2026-03-20T22:00:00Z");
  });

  it("skips conflicting candidate times conservatively", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16u-"));
    fs.mkdirSync(path.join(root, "data", "output_logs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "perf_tracker.jsonl"),
      JSON.stringify({
        date: "2026-03-20",
        leg_id: "ud-leg-3",
        player: "Player C",
        stat: "assists",
        line: 8.5,
        book: "fanduel",
        trueProb: 0.55,
        projectedEV: 0.05,
        playedEV: 0.05,
        kelly: 0.1,
        card_tier: 1,
      }) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "data", "output_logs", "underdog-legs.json"),
      JSON.stringify([
        { id: "ud-leg-3", player: "Player C", stat: "assists", line: 8.5, startTime: "2026-03-20T23:00:00Z" },
        { id: "ud-leg-3", player: "Player C", stat: "assists", line: 8.5, startTime: "2026-03-20T23:30:00Z" },
      ]),
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const out = enrichExistingTrackerStartTimes(root);
    const rows = readTrackerRows();
    expect(out.enriched).toBe(0);
    expect(out.skippedConflicting).toBe(1);
    expect(rows[0]?.gameStartTime).toBeUndefined();
  });

  it("snapshot-gap export shape is deterministic", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16u-"));
    fs.mkdirSync(path.join(root, "data", "odds_snapshots"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "perf_tracker.jsonl"),
      [
        JSON.stringify({
          date: "2026-03-20",
          leg_id: "leg-a",
          player: "A",
          stat: "points",
          line: 10.5,
          book: "fd",
          trueProb: 0.55,
          projectedEV: 0.05,
          playedEV: 0.05,
          kelly: 0.1,
          card_tier: 1,
          gameStartTime: "2026-03-20T20:00:00Z",
        }),
        JSON.stringify({
          date: "2026-03-20",
          leg_id: "leg-b",
          player: "B",
          stat: "points",
          line: 11.5,
          book: "fd",
          trueProb: 0.55,
          projectedEV: 0.05,
          playedEV: 0.05,
          kelly: 0.1,
          card_tier: 1,
        }),
      ].join("\n") + "\n",
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const out = buildSnapshotCoverageGaps(root);
    expect(out.summary.totalRows).toBe(2);
    expect(typeof out.summary.rowsWithStartButNoPreStartSnapshot).toBe("number");
    expect(Array.isArray(out.rowsNeedingAction)).toBe(true);
    expect(out.rowsNeedingAction[0]).toHaveProperty("gapReason");
  });

  it("post-start-only remains excluded from matching", () => {
    const match = resolveCloseOddsFromSnapshots(
      [
        {
          fetchedAtUtc: "2026-03-20T20:01:00Z",
          rows: [{ league: "NBA", player: "P", stat: "points", line: 10.5, overOdds: -110, underOdds: -110 }],
        },
      ],
      {
        league: "NBA",
        playerName: "P",
        stat: "points",
        line: 10.5,
        side: "over",
        gameStartTime: "2026-03-20T20:00:00Z",
      }
    );
    expect(match.status).toBe("post_start_only");
    expect(match.closeOddsAmerican).toBeUndefined();
  });
});
