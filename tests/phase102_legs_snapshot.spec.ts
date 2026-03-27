import fs from "fs";
import os from "os";
import path from "path";
import {
  deriveLegsSnapshotId,
  persistLegsSnapshotFromRootOutputs,
  loadRunTimestampToLegsSnapshotId,
} from "../src/tracking/legs_snapshot";
import { exportFeatureValidationPicks, loadLegsMapForSnapshotId } from "../src/reporting/feature_validation_export";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import { buildLegsSnapshotIntegrityReport } from "../src/reporting/export_legs_snapshot_integrity";

describe("Phase 102 — legs snapshot + tracker binding", () => {
  it("deriveLegsSnapshotId is deterministic", () => {
    expect(deriveLegsSnapshotId("2026-03-21T20:45:21 ET")).toBe(deriveLegsSnapshotId("2026-03-21T20:45:21 ET"));
  });

  it("persistLegsSnapshotFromRootOutputs copies files and never overwrites", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p102-"));
    fs.writeFileSync(path.join(dir, "prizepicks-legs.csv"), "id,player\nx,1\n", "utf8");
    const ts = "2026-03-21T20:45:21 ET";
    const a = persistLegsSnapshotFromRootOutputs(dir, ts);
    const b = persistLegsSnapshotFromRootOutputs(dir, ts);
    expect(a?.legsSnapshotId).toBeTruthy();
    expect(b?.legsSnapshotId).toBeTruthy();
    expect(a!.legsSnapshotId).not.toBe(b!.legsSnapshotId);
    expect(fs.existsSync(path.join(dir, "data", "legs_archive", b!.legsSnapshotId, "prizepicks-legs.csv"))).toBe(true);
  });

  it("loadLegsMapForSnapshotId loads archived CSV", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p102b-"));
    const sid = "test_snap_manual";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(
      path.join(arch, "prizepicks-legs.csv"),
      "id,player,stat,line,book,league,trueProb,legEv\nprizepicks-x-points-1-over,A,points,1,FD,NBA,0.5,0\n",
      "utf8"
    );
    const m = loadLegsMapForSnapshotId(dir, sid);
    expect(m.get("prizepicks-x-points-1-over")?.player).toBe("A");
  });

  it("exportFeatureValidationPicks uses snapshot map when legsSnapshotId set", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p102c-"));
    const sid = "snap_test_id";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(
      path.join(arch, "prizepicks-legs.csv"),
      "id,player,stat,line,book,league,trueProb,legEv,opponent\nprizepicks-only-snap-points-2-over,P,points,2,FD,NBA,0.5,0.01,BOS\n",
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    const row: PerfTrackerRow = {
      date: "2026-01-01",
      leg_id: "prizepicks-only-snap-points-2-over",
      player: "P",
      stat: "points",
      line: 2,
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
    const { picks, stats } = exportFeatureValidationPicks({ cwd: dir, trackerPath, legCsvPaths: [] });
    expect(stats.exported).toBe(1);
    expect(picks[0]?.legKey).toBe("prizepicks-only-snap-points-2-over");
  });

  it("buildLegsSnapshotIntegrityReport counts rows", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p102d-"));
    fs.mkdirSync(path.join(dir, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "data", "perf_tracker.jsonl"),
      JSON.stringify({ date: "2026-01-01", leg_id: "a", player: "x", stat: "p", line: 1, book: "b", trueProb: 0.5, projectedEV: 0, playedEV: 0, kelly: 0, card_tier: 1, result: 1 }) +
        "\n",
      "utf8"
    );
    const r = buildLegsSnapshotIntegrityReport(dir);
    expect(r.totalRows).toBe(1);
    expect(r.rowsMissingLegsSnapshotId).toBe(1);
  });

  it("loadRunTimestampToLegsSnapshotId reads snapshot_meta.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p102e-"));
    const sid = "snap_meta";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(
      path.join(arch, "snapshot_meta.json"),
      JSON.stringify({ legsSnapshotId: sid, runTimestampEt: "2026-03-21T20:00:00 ET" }),
      "utf8"
    );
    const m = loadRunTimestampToLegsSnapshotId(dir);
    expect(m.get("2026-03-21T20:00:00 ET")).toBe(sid);
  });
});
