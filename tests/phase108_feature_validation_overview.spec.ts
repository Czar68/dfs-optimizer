import fs from "fs";
import os from "os";
import path from "path";
import {
  buildFeatureValidationOverviewReport,
  writeFeatureValidationOverviewArtifacts,
  FEATURE_VALIDATION_OVERVIEW_JSON,
  resolveEffectiveFeatureValidationPolicy,
} from "../src/reporting/export_feature_validation_overview";
import { buildFeatureValidationReplayReadinessReport } from "../src/reporting/export_feature_validation_replay_readiness";
import { buildLegsSnapshotAdoptionReport } from "../src/reporting/export_legs_snapshot_adoption";
import type { PerfTrackerRow } from "../src/perf_tracker_types";

function row(leg_id: string, extra: Partial<PerfTrackerRow> = {}): PerfTrackerRow {
  return {
    date: "2026-01-01",
    leg_id,
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
    ...extra,
  } as PerfTrackerRow;
}

describe("Phase 108 — feature validation overview", () => {
  const prevPolicy = process.env.FEATURE_VALIDATION_POLICY;
  afterEach(() => {
    if (prevPolicy === undefined) delete process.env.FEATURE_VALIDATION_POLICY;
    else process.env.FEATURE_VALIDATION_POLICY = prevPolicy;
  });

  it("overview summaryLine matches replay + adoption builders (grounded)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p108-"));
    const id = "prizepicks-o-points-1-over";
    fs.writeFileSync(
      path.join(dir, "prizepicks-legs.csv"),
      `id,player,stat,line,book,league,trueProb,legEv,opponent\n${id},P,points,1,FD,NBA,0.5,0.01,BOS\n`,
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(trackerPath, JSON.stringify(row(id)) + "\n", "utf8");

    const replay = buildFeatureValidationReplayReadinessReport({ cwd: dir, trackerPath });
    const adoption = buildLegsSnapshotAdoptionReport(dir);
    const overview = buildFeatureValidationOverviewReport({ cwd: dir, trackerPath });

    expect(overview.replayReadiness.gradedRows).toBe(replay.gradedRows);
    expect(overview.replayReadiness.counts).toEqual(replay.counts);
    expect(overview.snapshotAdoption.gradedTotal).toBe(adoption.gradedTotal);
    expect(overview.snapshotAdoption.rowsWithLegsSnapshotId).toBe(adoption.rowsWithLegsSnapshotId);
    expect(overview.effectivePolicy).toBe(resolveEffectiveFeatureValidationPolicy());
  });

  it("summaryLine is deterministic for identical inputs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p108-det-"));
    const id = "prizepicks-det-points-1-over";
    fs.writeFileSync(
      path.join(dir, "prizepicks-legs.csv"),
      `id,player,stat,line,book,league,trueProb,legEv,opponent\n${id},P,points,1,FD,NBA,0.5,0.01,BOS\n`,
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(trackerPath, JSON.stringify(row(id)) + "\n", "utf8");

    const a = buildFeatureValidationOverviewReport({ cwd: dir, trackerPath });
    const b = buildFeatureValidationOverviewReport({ cwd: dir, trackerPath });
    expect(a.summaryLine).toBe(b.summaryLine);
    expect(a.summaryLine).toMatch(/^feature_validation_overview policy=/);
  });

  it("writeFeatureValidationOverviewArtifacts writes stable JSON (excluding timestamps)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p108-art-"));
    const id = "prizepicks-art-points-1-over";
    fs.writeFileSync(
      path.join(dir, "prizepicks-legs.csv"),
      `id,player,stat,line,book,league,trueProb,legEv,opponent\n${id},P,points,1,FD,NBA,0.5,0.01,BOS\n`,
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(trackerPath, JSON.stringify(row(id)) + "\n", "utf8");

    writeFeatureValidationOverviewArtifacts({ cwd: dir, trackerPath });
    const jPath = path.join(dir, FEATURE_VALIDATION_OVERVIEW_JSON);
    const raw = JSON.parse(fs.readFileSync(jPath, "utf8")) as {
      summaryLine: string;
      effectivePolicy: string;
      replayReadiness: { gradedRows: number };
    };
    const again = buildFeatureValidationOverviewReport({ cwd: dir, trackerPath });
    expect(raw.summaryLine).toBe(again.summaryLine);
    expect(raw.effectivePolicy).toBeTruthy();
    expect(raw.replayReadiness.gradedRows).toBe(1);
  });

  it("reads Phase 105 enforcement artifact when present", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p108-enf-"));
    fs.mkdirSync(path.join(dir, "data", "reports"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "data", "perf_tracker.jsonl"),
      JSON.stringify(row("x")) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(dir, "prizepicks-legs.csv"),
      `id,player,stat,line,book,league,trueProb,legEv,opponent\nx,P,points,1,FD,NBA,0.5,0.01,BOS\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(dir, "data", "reports", "latest_tracker_snapshot_new_row_enforcement.json"),
      JSON.stringify({
        appended: 0,
        skipped: 0,
        blockedMissingLegsSnapshotId: 2,
        appendedWithLegsSnapshotId: 0,
        appendedWithoutLegsSnapshotIdOverride: 1,
        escapeHatchEnabled: true,
        summaryLine: "tracker_snapshot_new_row_enforcement appended_with_id=0 blocked_missing_id=2 appended_override_without_id=1 escape_hatch_enabled=true override_used=true",
      }),
      "utf8"
    );

    const r = buildFeatureValidationOverviewReport({ cwd: dir });
    expect(r.newRowEnforcement?.blockedMissingLegsSnapshotId).toBe(2);
    expect(r.newRowEnforcement?.appendedWithoutLegsSnapshotIdOverride).toBe(1);
    expect(r.summaryLine).toContain("blocked_new_wo=2");
    expect(r.summaryLine).toContain("override_appends=1");
  });
});
