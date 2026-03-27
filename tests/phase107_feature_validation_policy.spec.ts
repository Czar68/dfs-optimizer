import fs from "fs";
import os from "os";
import path from "path";
import {
  exportFeatureValidationPicks,
  normalizeFeatureValidationPolicy,
} from "../src/reporting/feature_validation_export";
import {
  buildFeatureValidationPolicyStatusArtifact,
  writeFeatureValidationPolicyStatusArtifacts,
  FEATURE_VALIDATION_POLICY_STATUS_JSON,
} from "../src/reporting/export_feature_validation_policy_status";
import type { PerfTrackerRow } from "../src/perf_tracker_types";

function writeRootCsv(dir: string, id: string): void {
  fs.writeFileSync(
    path.join(dir, "prizepicks-legs.csv"),
    `id,player,stat,line,book,league,trueProb,legEv,opponent\n${id},P,points,1,FD,NBA,0.5,0.01,BOS\n`,
    "utf8"
  );
}

function rowBase(overrides: Partial<PerfTrackerRow> & Pick<PerfTrackerRow, "leg_id">): PerfTrackerRow {
  return {
    date: "2026-01-01",
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
    ...overrides,
  } as PerfTrackerRow;
}

describe("Phase 107 — feature validation policy", () => {
  it("normalizeFeatureValidationPolicy accepts snake_case and kebab-case aliases", () => {
    expect(normalizeFeatureValidationPolicy("legacy-best-effort")).toBe("legacy_best_effort");
    expect(normalizeFeatureValidationPolicy("snapshot-preferred")).toBe("snapshot_preferred");
    expect(normalizeFeatureValidationPolicy("snapshot-strict")).toBe("snapshot_strict");
  });

  it("snapshot_strict excludes graded rows without legsSnapshotId", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p107-strict-"));
    const legacyId = "prizepicks-legacy-points-1-over";
    writeRootCsv(dir, legacyId);
    const snapId = "prizepicks-snap-points-1-over";
    const sid = "snap_strict_107";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(
      path.join(arch, "prizepicks-legs.csv"),
      `id,player,stat,line,book,league,trueProb,legEv,opponent\n${snapId},P,points,1,FD,NBA,0.5,0.01,BOS\n`,
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    const lines = [
      JSON.stringify(rowBase({ leg_id: legacyId })),
      JSON.stringify(
        rowBase({
          leg_id: snapId,
          legsSnapshotId: sid,
        })
      ),
    ];
    fs.writeFileSync(trackerPath, lines.join("\n") + "\n", "utf8");

    const { picks, stats } = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath,
      legCsvPaths: [path.join(dir, "prizepicks-legs.csv")],
      policy: "snapshot_strict",
    });
    expect(stats.policyExcludedNoSnapshotId).toBe(1);
    expect(stats.policyExcludedGradedRows).toBe(1);
    expect(picks).toHaveLength(1);
    expect(stats.exportedViaSnapshotMapJoin).toBe(1);
    expect(stats.exportedViaLegacyMapJoin).toBe(0);
  });

  it("legacy_best_effort joins snapshot-stamped rows via global legacy map only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p107-legacy-"));
    const id = "prizepicks-legacy-effort-points-1-over";
    writeRootCsv(dir, id);
    const sid = "snap_ignored_107";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(
      path.join(arch, "prizepicks-legs.csv"),
      `id,player,stat,line,book,league,trueProb,legEv,opponent\n${id},P,points,1,FD,NBA,0.5,0.01,BOS\n`,
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(
      trackerPath,
      JSON.stringify(rowBase({ leg_id: id, legsSnapshotId: sid })) + "\n",
      "utf8"
    );

    const { picks, stats } = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath,
      legCsvPaths: [path.join(dir, "prizepicks-legs.csv")],
      policy: "legacy_best_effort",
    });
    expect(picks).toHaveLength(1);
    expect(stats.featureValidationPolicy).toBe("legacy_best_effort");
    expect(stats.exportedViaLegacyMapJoin).toBe(1);
    expect(stats.exportedViaSnapshotMapJoin).toBe(0);
    expect(stats.skippedMissingSnapshotDirectory).toBe(0);
  });

  it("snapshot_preferred uses snapshot archive when legsSnapshotId is set", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p107-pref-"));
    const id = "prizepicks-pref-points-1-over";
    const sid = "snap_pref_107";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(
      path.join(arch, "prizepicks-legs.csv"),
      `id,player,stat,line,book,league,trueProb,legEv,opponent\n${id},P,points,1,FD,NBA,0.5,0.01,BOS\n`,
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(
      trackerPath,
      JSON.stringify(rowBase({ leg_id: id, legsSnapshotId: sid })) + "\n",
      "utf8"
    );

    const { picks, stats } = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath,
      legCsvPaths: [],
      policy: "snapshot_preferred",
    });
    expect(picks).toHaveLength(1);
    expect(stats.exportedViaSnapshotMapJoin).toBe(1);
    expect(stats.exportedViaLegacyMapJoin).toBe(0);
  });

  it("policy status summaryLine is deterministic for identical stats and tracker", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p107-det-"));
    const id = "prizepicks-det-points-1-over";
    writeRootCsv(dir, id);
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(trackerPath, JSON.stringify(rowBase({ leg_id: id })) + "\n", "utf8");
    const { stats } = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath,
      legCsvPaths: [path.join(dir, "prizepicks-legs.csv")],
      policy: "snapshot_preferred",
    });
    const a1 = buildFeatureValidationPolicyStatusArtifact(dir, trackerPath, "snapshot_preferred", stats);
    const a2 = buildFeatureValidationPolicyStatusArtifact(dir, trackerPath, "snapshot_preferred", stats);
    expect(a1.summaryLine).toBe(a2.summaryLine);
    expect(a1.summaryLine).toMatch(/^feature_validation_policy_status policy=snapshot_preferred/);
  });

  it("writeFeatureValidationPolicyStatusArtifacts writes JSON including policy and summaryLine", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p107-art-"));
    const id = "prizepicks-art-points-1-over";
    writeRootCsv(dir, id);
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(trackerPath, JSON.stringify(rowBase({ leg_id: id })) + "\n", "utf8");
    const { stats } = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath,
      legCsvPaths: [path.join(dir, "prizepicks-legs.csv")],
    });
    writeFeatureValidationPolicyStatusArtifacts(dir, trackerPath, stats.featureValidationPolicy, stats);
    const jPath = path.join(dir, FEATURE_VALIDATION_POLICY_STATUS_JSON);
    const raw = JSON.parse(fs.readFileSync(jPath, "utf8")) as { policy: string; summaryLine: string };
    expect(raw.policy).toBe("snapshot_preferred");
    expect(raw.summaryLine).toContain("policy=snapshot_preferred");
  });
});
