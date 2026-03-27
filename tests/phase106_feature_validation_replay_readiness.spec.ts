import fs from "fs";
import os from "os";
import path from "path";
import {
  buildFeatureValidationReplayReadinessReport,
  formatFeatureValidationReplayReadinessSummaryLine,
  writeFeatureValidationReplayReadinessArtifacts,
} from "../src/reporting/export_feature_validation_replay_readiness";
import type { PerfTrackerRow } from "../src/perf_tracker_types";

function rowBase(over: Partial<PerfTrackerRow> & Pick<PerfTrackerRow, "leg_id" | "date">): PerfTrackerRow {
  return {
    player: "P",
    stat: "points",
    line: 1,
    book: "FD",
    trueProb: 0.5,
    projectedEV: 0,
    playedEV: 0,
    kelly: 0,
    card_tier: 1,
    result: 1,
    side: "over",
    ...over,
  } as PerfTrackerRow;
}

describe("Phase 106 — feature validation replay readiness", () => {
  it("snapshot-bound + existing snapshot => replay-ready and strict eligible when leg matches", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p106a-"));
    const sid = "snap_rdy";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(
      path.join(arch, "prizepicks-legs.csv"),
      "id,player,stat,line,book,league,trueProb,legEv,opponent\nprizepicks-x-points-1-over,P,points,1,FD,NBA,0.5,0.01,BOS\n",
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(
      trackerPath,
      JSON.stringify(
        rowBase({
          date: "2026-01-01",
          leg_id: "prizepicks-x-points-1-over",
          legsSnapshotId: sid,
        })
      ) + "\n",
      "utf8"
    );
    const r = buildFeatureValidationReplayReadinessReport({ cwd: dir, trackerPath });
    expect(r.gradedRows).toBe(1);
    expect(r.counts.replayReadySnapshotBound).toBe(1);
    expect(r.counts.strictValidationEligible).toBe(1);
    expect(r.counts.snapshotBoundMissingSnapshotDir).toBe(0);
  });

  it("snapshot-bound + missing snapshot dir => not replay-ready", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p106b-"));
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(
      trackerPath,
      JSON.stringify(
        rowBase({
          date: "2026-01-01",
          leg_id: "a",
          legsSnapshotId: "snap_missing",
        })
      ) + "\n",
      "utf8"
    );
    const r = buildFeatureValidationReplayReadinessReport({ cwd: dir, trackerPath });
    expect(r.counts.replayReadySnapshotBound).toBe(0);
    expect(r.counts.snapshotBoundMissingSnapshotDir).toBe(1);
    expect(r.counts.strictValidationEligible).toBe(0);
    expect(r.strictIneligibleBreakdown.snapshotBoundMissingDir).toBe(1);
  });

  it("legacy row without legsSnapshotId classified separately", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p106c-"));
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(
      trackerPath,
      JSON.stringify(rowBase({ date: "2026-01-01", leg_id: "leg-legacy" })) + "\n",
      "utf8"
    );
    const r = buildFeatureValidationReplayReadinessReport({ cwd: dir, trackerPath, legCsvPaths: [] });
    expect(r.counts.legacyWithoutSnapshotId).toBe(1);
    expect(r.counts.legacyResolvedBestEffort).toBe(0);
    expect(r.strictIneligibleBreakdown.legacyGraded).toBe(1);
  });

  it("artifact output deterministic for fixed inputs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p106d-"));
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(
      trackerPath,
      JSON.stringify(rowBase({ date: "2026-01-01", leg_id: "z" })) + "\n",
      "utf8"
    );
    const a = buildFeatureValidationReplayReadinessReport({ cwd: dir, trackerPath, legCsvPaths: [] });
    const b = buildFeatureValidationReplayReadinessReport({ cwd: dir, trackerPath, legCsvPaths: [] });
    const strip = (x: typeof a) => ({ ...x, generatedAtUtc: "fixed" });
    expect(JSON.stringify(strip(a))).toBe(JSON.stringify(strip(b)));
    expect(formatFeatureValidationReplayReadinessSummaryLine(a)).toBe(a.summaryLine);
  });

  it("writes json + md", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p106e-"));
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(
      trackerPath,
      JSON.stringify(rowBase({ date: "2026-01-01", leg_id: "w" })) + "\n",
      "utf8"
    );
    writeFeatureValidationReplayReadinessArtifacts({ cwd: dir, trackerPath, legCsvPaths: [] });
    expect(fs.existsSync(path.join(dir, "data", "reports", "latest_feature_validation_replay_readiness.json"))).toBe(
      true
    );
  });
});
