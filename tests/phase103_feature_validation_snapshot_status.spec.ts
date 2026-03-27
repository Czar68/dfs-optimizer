import fs from "fs";
import os from "os";
import path from "path";
import { exportFeatureValidationPicks } from "../src/reporting/feature_validation_export";
import { writeFeatureValidationSnapshotStatusArtifacts } from "../src/reporting/feature_validation_snapshot_status";
import type { PerfTrackerRow } from "../src/perf_tracker_types";

function writeCsv(dir: string, id: string, extra = ""): void {
  fs.writeFileSync(
    path.join(dir, "prizepicks-legs.csv"),
    `id,player,stat,line,book,league,trueProb,legEv,opponent\n${id},P,points,1,FD,NBA,0.5,0.01,BOS\n${extra}`,
    "utf8"
  );
}

describe("Phase 103 — snapshot export observability", () => {
  const prevEnforce = process.env.FEATURE_VALIDATION_SNAPSHOT_ENFORCE;
  afterEach(() => {
    if (prevEnforce === undefined) delete process.env.FEATURE_VALIDATION_SNAPSHOT_ENFORCE;
    else process.env.FEATURE_VALIDATION_SNAPSHOT_ENFORCE = prevEnforce;
  });

  it("legacy row without legsSnapshotId counts legacy join", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p103a-"));
    const id = "prizepicks-legacy-only-points-1-over";
    writeCsv(dir, id);
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    const row: PerfTrackerRow = {
      date: "2026-01-01",
      leg_id: id,
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
    };
    fs.writeFileSync(trackerPath, JSON.stringify(row) + "\n", "utf8");
    const { stats } = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath,
      legCsvPaths: [path.join(dir, "prizepicks-legs.csv")],
    });
    expect(stats.rowsWithoutLegsSnapshotId).toBe(1);
    expect(stats.rowsWithLegsSnapshotId).toBe(0);
    expect(stats.legacyJoinedByLegId).toBe(1);
    expect(stats.snapshotJoinedByLegId).toBe(0);
  });

  it("row with valid legsSnapshotId and matching leg", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p103b-"));
    const sid = "snap_ok_103";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    const id = "prizepicks-snap-ok-points-1-over";
    fs.writeFileSync(
      path.join(arch, "prizepicks-legs.csv"),
      `id,player,stat,line,book,league,trueProb,legEv,opponent\n${id},P,points,1,FD,NBA,0.5,0.01,BOS\n`,
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    const row: PerfTrackerRow = {
      date: "2026-01-01",
      leg_id: id,
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
      legsSnapshotId: sid,
    };
    fs.writeFileSync(trackerPath, JSON.stringify(row) + "\n", "utf8");
    const { stats } = exportFeatureValidationPicks({ cwd: dir, trackerPath, legCsvPaths: [] });
    expect(stats.rowsWithLegsSnapshotId).toBe(1);
    expect(stats.snapshotReferencedDirExistsRows).toBe(1);
    expect(stats.snapshotJoinedByLegId).toBe(1);
    expect(stats.skippedMissingSnapshotDirectory).toBe(0);
  });

  it("row with legsSnapshotId but missing snapshot directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p103c-"));
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    const row: PerfTrackerRow = {
      date: "2026-01-01",
      leg_id: "x",
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
      legsSnapshotId: "snap_missing_dir",
    };
    fs.writeFileSync(trackerPath, JSON.stringify(row) + "\n", "utf8");
    const { picks, stats } = exportFeatureValidationPicks({ cwd: dir, trackerPath, legCsvPaths: [] });
    expect(picks).toHaveLength(0);
    expect(stats.skippedMissingSnapshotDirectory).toBe(1);
    expect(stats.skipReasonSamples.missing_snapshot_directory).toContain("x");
  });

  it("row with snapshot id and ambiguous reconstruction (>1 candidate)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p103ambig-"));
    const sid = "snap_ambig";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(
      path.join(arch, "prizepicks-legs.csv"),
      [
        "id,player,stat,line,book,league,trueProb,legEv,team,opponent",
        "prizepicks-dup-a-points-10-over,Dup,points,10,FD,NBA,0.5,0.01,,",
        "prizepicks-dup-b-points-10-over,Dup,points,10,FD,NBA,0.5,0.01,,",
      ].join("\n") + "\n",
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    const row: PerfTrackerRow = {
      date: "2026-01-01",
      leg_id: "prizepicks-not-in-csv-ambig",
      player: "Dup",
      stat: "points",
      line: 10,
      book: "FD",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
      result: 1,
      side: "over",
      legsSnapshotId: sid,
    };
    fs.writeFileSync(trackerPath, JSON.stringify(row) + "\n", "utf8");
    const { stats } = exportFeatureValidationPicks({ cwd: dir, trackerPath, legCsvPaths: [] });
    expect(stats.skippedSnapshotAmbiguousReconstruction).toBe(1);
    expect(stats.skipReasonSamples.snapshot_present_ambiguous_reconstruction?.length).toBeGreaterThan(0);
  });

  it("row with snapshot id and no exact match in snapshot", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p103d-"));
    const sid = "snap_nomatch";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(
      path.join(arch, "prizepicks-legs.csv"),
      "id,player,stat,line,book,league,trueProb,legEv,opponent\nprizepicks-other-points-1-over,Q,points,1,FD,NBA,0.5,0.01,BOS\n",
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    const row: PerfTrackerRow = {
      date: "2026-01-01",
      leg_id: "prizepicks-not-in-snap-points-9-over",
      player: "Z",
      stat: "points",
      line: 9,
      book: "FD",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
      result: 1,
      side: "over",
      legsSnapshotId: sid,
    };
    fs.writeFileSync(trackerPath, JSON.stringify(row) + "\n", "utf8");
    const { stats } = exportFeatureValidationPicks({ cwd: dir, trackerPath, legCsvPaths: [] });
    expect(stats.skippedSnapshotPresentNoLegMatch).toBe(1);
    expect(stats.skipReasonSamples.snapshot_present_no_leg_match?.length).toBeGreaterThan(0);
  });

  it("writes snapshot status artifacts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p103e-"));
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(
      trackerPath,
      JSON.stringify({
        date: "2026-01-01",
        leg_id: "a",
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
      }) + "\n",
      "utf8"
    );
    const { stats } = exportFeatureValidationPicks({ cwd: dir, trackerPath, legCsvPaths: [] });
    writeFeatureValidationSnapshotStatusArtifacts(dir, stats, path.join(dir, trackerPath));
    const j = path.join(dir, "data", "reports", "latest_feature_validation_snapshot_status.json");
    expect(fs.existsSync(j)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(j, "utf8")) as { rowsWithoutLegsSnapshotId: number };
    expect(parsed.rowsWithoutLegsSnapshotId).toBe(1);
  });

  it("enforceSnapshotResolved sets enforcementFailed when snapshot skip", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p103f-"));
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    const row: PerfTrackerRow = {
      date: "2026-01-01",
      leg_id: "z",
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
      legsSnapshotId: "missing_snap",
    };
    fs.writeFileSync(trackerPath, JSON.stringify(row) + "\n", "utf8");
    delete process.env.FEATURE_VALIDATION_SNAPSHOT_ENFORCE;
    const { stats } = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath,
      legCsvPaths: [],
      enforceSnapshotResolved: true,
    });
    expect(stats.enforcementFailed).toBe(true);
  });
});
