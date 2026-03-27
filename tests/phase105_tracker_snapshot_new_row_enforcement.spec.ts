import fs from "fs";
import os from "os";
import path from "path";
import { backfillPerfTracker } from "../src/backfill_perf_tracker";
import { readTrackerRows } from "../src/perf_tracker_db";
import { parseTrackerLine } from "../src/perf_tracker_types";
import {
  formatTrackerSnapshotNewRowEnforcementSummaryLine,
  writeTrackerSnapshotNewRowEnforcementArtifacts,
} from "../src/reporting/export_tracker_snapshot_new_row_enforcement";

describe("Phase 105 — new-row snapshot enforcement", () => {
  const prevEnv = process.env.PERF_TRACKER_ALLOW_APPEND_WITHOUT_SNAPSHOT;
  afterEach(() => {
    jest.restoreAllMocks();
    if (prevEnv === undefined) delete process.env.PERF_TRACKER_ALLOW_APPEND_WITHOUT_SNAPSHOT;
    else process.env.PERF_TRACKER_ALLOW_APPEND_WITHOUT_SNAPSHOT = prevEnv;
  });

  function writeTierAndLegs(root: string, runTs: string): void {
    fs.mkdirSync(path.join(root, "data", "tier_archive"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "legs_archive", "prizepicks-legs-20260320.csv"),
      [
        "Sport,id,player,team,opponent,stat,line,league,book,overOdds,underOdds,trueProb,edge,legEv,runTimestamp,gameTime,IsWithin24h,leg_key,leg_label",
        `NBA,pp-105,Player A,TEAMX,TEAMY,points,20.5,NBA,draftkings,-110,-110,0.57,0.07,0.07,${runTs},2026-03-20T19:00:00Z,TRUE,key,label`,
      ].join("\n"),
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "data", "tier_archive", "tier1-20260320.csv"),
      [
        "portfolioRank,tier,site,flexType,cardEV,compositeScore,correlationScore,diversity,correlation,liquidity,kellyFrac,kellyStake,fragile,fragileEvShifted,winProbCash,avgProb,avgLegEV,avgEdge,breakevenGap,statBalance,edgeCluster,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,runTimestamp",
        `1,1,PP,3P,0.1,0,0,0,0,0,0.2,20,false,0,0,0,0,0,0,{},x,pp-105,,,,,,${runTs}`,
      ].join("\n"),
      "utf8"
    );
  }

  it("blocks append when legsSnapshotId missing and escape hatch off", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p105blk-"));
    fs.mkdirSync(path.join(root, "data", "legs_archive"), { recursive: true });
    writeTierAndLegs(root, "2026-03-20T12:00:00 ET");
    delete process.env.PERF_TRACKER_ALLOW_APPEND_WITHOUT_SNAPSHOT;
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const out = backfillPerfTracker();
    expect(out.blockedMissingLegsSnapshotId).toBeGreaterThanOrEqual(1);
    expect(out.appended).toBe(0);
    expect(out.appendedWithLegsSnapshotId).toBe(0);
    expect(out.escapeHatchEnabled).toBe(false);
  });

  it("appends with legsSnapshotId when snapshot meta matches runTimestamp", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p105ok-"));
    fs.mkdirSync(path.join(root, "data", "legs_archive"), { recursive: true });
    writeTierAndLegs(root, "2026-03-20T12:00:00 ET");
    fs.mkdirSync(path.join(root, "data", "legs_archive", "snap_ok105"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "legs_archive", "snap_ok105", "snapshot_meta.json"),
      JSON.stringify({
        runTimestampEt: "2026-03-20T12:00:00 ET",
        legsSnapshotId: "snap_ok105",
      }),
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const out = backfillPerfTracker();
    expect(out.appended).toBeGreaterThanOrEqual(1);
    expect(out.appendedWithLegsSnapshotId).toBeGreaterThanOrEqual(1);
    expect(out.blockedMissingLegsSnapshotId).toBe(0);
    const rows = readTrackerRows();
    const hit = rows.find((r) => r.leg_id === "pp-105");
    expect(hit?.legsSnapshotId).toBe("snap_ok105");
  });

  it("escape hatch appends without id and attributes provenance", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p105ovr-"));
    fs.mkdirSync(path.join(root, "data", "legs_archive"), { recursive: true });
    writeTierAndLegs(root, "2026-03-20T12:00:00 ET");
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const out = backfillPerfTracker({ allowAppendWithoutLegsSnapshotId: true });
    expect(out.appended).toBeGreaterThanOrEqual(1);
    expect(out.appendedWithoutLegsSnapshotIdOverride).toBeGreaterThanOrEqual(1);
    expect(out.escapeHatchEnabled).toBe(true);
    const rows = readTrackerRows();
    const hit = rows.find((r) => r.leg_id === "pp-105");
    expect(hit?.creationProvenance?.legsSnapshotAppend).toBe("override_without_snapshot_id");
    expect(hit?.legsSnapshotId).toBeUndefined();
  });

  it("legacy row without legsSnapshotId still parses", () => {
    const line = JSON.stringify({
      date: "2020-01-01",
      leg_id: "old",
      player: "P",
      stat: "points",
      line: 1,
      book: "FD",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
    });
    expect(parseTrackerLine(line)?.legsSnapshotId).toBeUndefined();
  });

  it("enforcement artifact summary line is stable for fixed stats", () => {
    const s = formatTrackerSnapshotNewRowEnforcementSummaryLine({
      appended: 2,
      skipped: 0,
      blockedMissingLegsSnapshotId: 0,
      appendedWithLegsSnapshotId: 2,
      appendedWithoutLegsSnapshotIdOverride: 0,
      escapeHatchEnabled: false,
    });
    expect(s).toContain("appended_with_id=2");
    expect(s).toContain("blocked_missing_id=0");
    expect(s).toContain("override_used=false");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p105art-"));
    writeTrackerSnapshotNewRowEnforcementArtifacts(tmp, {
      appended: 1,
      skipped: 0,
      blockedMissingLegsSnapshotId: 0,
      appendedWithLegsSnapshotId: 1,
      appendedWithoutLegsSnapshotIdOverride: 0,
      escapeHatchEnabled: false,
    });
    expect(fs.existsSync(path.join(tmp, "data", "reports", "latest_tracker_snapshot_new_row_enforcement.json"))).toBe(
      true
    );
  });
});
