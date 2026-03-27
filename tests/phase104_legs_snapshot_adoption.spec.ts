import fs from "fs";
import os from "os";
import path from "path";
import { loadRunTimestampToLegsSnapshotId, LEGS_SNAPSHOT_REF_FILENAME } from "../src/tracking/legs_snapshot";
import type { LegsSnapshotAdoptionReport } from "../src/reporting/export_legs_snapshot_adoption";
import {
  buildLegsSnapshotAdoptionReport,
  formatLegsSnapshotAdoptionSummaryLine,
  writeLegsSnapshotAdoptionArtifacts,
} from "../src/reporting/export_legs_snapshot_adoption";
import { buildPerfTrackerRowFromTierLeg } from "../src/tracking/tracker_creation_backfill";
import type { LegCsvRecord } from "../src/tracking/legs_csv_index";
import { parseTrackerLine } from "../src/perf_tracker_types";

describe("Phase 104 — snapshot adoption + ref hardening", () => {
  it("loadRunTimestampToLegsSnapshotId merges artifacts ref when archive missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p104ref-"));
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "artifacts", LEGS_SNAPSHOT_REF_FILENAME),
      JSON.stringify({
        runTimestampEt: "2026-03-22T12:00:00 ET",
        legsSnapshotId: "snap_from_ref_only",
      }),
      "utf8"
    );
    const m = loadRunTimestampToLegsSnapshotId(dir);
    expect(m.get("2026-03-22T12:00:00 ET")).toBe("snap_from_ref_only");
  });

  it("mergeLegsSnapshotRefFromArtifacts does not override archive meta", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p104ref2-"));
    const sid = "snap_archive";
    const arch = path.join(dir, "data", "legs_archive", sid);
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(
      path.join(arch, "snapshot_meta.json"),
      JSON.stringify({
        runTimestampEt: "2026-03-22T12:00:00 ET",
        legsSnapshotId: sid,
      }),
      "utf8"
    );
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "artifacts", LEGS_SNAPSHOT_REF_FILENAME),
      JSON.stringify({
        runTimestampEt: "2026-03-22T12:00:00 ET",
        legsSnapshotId: "wrong_ref",
      }),
      "utf8"
    );
    const m = loadRunTimestampToLegsSnapshotId(dir);
    expect(m.get("2026-03-22T12:00:00 ET")).toBe(sid);
  });

  it("buildPerfTrackerRowFromTierLeg stamps legsSnapshotId when provided", () => {
    const leg: LegCsvRecord = {
      player: "A",
      stat: "points",
      line: 1,
      book: "FD",
      league: "NBA",
      trueProb: 0.5,
      legEv: 0,
    };
    const row = buildPerfTrackerRowFromTierLeg({
      date: "2026-01-01",
      legId: "prizepicks-x-points-1-over",
      leg,
      siteColumnPresent: false,
      siteRawUpper: "",
      structure: "",
      kellyFrac: 0,
      cardTier: 1,
      runTimestamp: "2026-01-01T10:00:00 ET",
      legsSnapshotId: "snap_stamp_test",
    });
    expect(row.legsSnapshotId).toBe("snap_stamp_test");
  });

  it("legacy tracker line without legsSnapshotId still parses", () => {
    const line = JSON.stringify({
      date: "2020-01-01",
      leg_id: "leg-old",
      player: "P",
      stat: "points",
      line: 10,
      book: "FD",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
      result: 1,
    });
    const r = parseTrackerLine(line);
    expect(r).toBeTruthy();
    expect(r!.legsSnapshotId).toBeUndefined();
  });

  it("adoption report is deterministic for fixed inputs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p104adopt-"));
    const fp = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const rows = [
      { date: "2026-02-01", leg_id: "a", withSnap: true },
      { date: "2026-02-01", leg_id: "b", withSnap: false },
    ];
    const lines = rows.map((x) =>
      JSON.stringify({
        date: x.date,
        leg_id: x.leg_id,
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
        ...(x.withSnap ? { legsSnapshotId: "snap1" } : {}),
      })
    );
    fs.writeFileSync(fp, lines.join("\n") + "\n", "utf8");
    const a = buildLegsSnapshotAdoptionReport(dir);
    const b = buildLegsSnapshotAdoptionReport(dir);
    const stable = (r: LegsSnapshotAdoptionReport) => ({ ...r, generatedAtUtc: "fixed" });
    expect(JSON.stringify(stable(a))).toBe(JSON.stringify(stable(b)));
    expect(a.totalRows).toBe(2);
    expect(a.rowsWithLegsSnapshotId).toBe(1);
    expect(a.rowsWithoutLegsSnapshotId).toBe(1);
    expect(a.gradedTotal).toBe(2);
    expect(a.gradedWithLegsSnapshotId).toBe(1);
    expect(a.byMonth["2026-02"]!.total).toBe(2);
    expect(formatLegsSnapshotAdoptionSummaryLine(a)).toBe(a.summaryLine);
  });

  it("writeLegsSnapshotAdoptionArtifacts writes json and md", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p104w-"));
    const fp = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(
      fp,
      JSON.stringify({
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
      }) + "\n",
      "utf8"
    );
    const r = writeLegsSnapshotAdoptionArtifacts(dir);
    expect(fs.existsSync(path.join(dir, "data", "reports", "latest_legs_snapshot_adoption.json"))).toBe(true);
    expect(r.summaryLine).toContain("legacy_unsnapshotted=1");
  });
});
