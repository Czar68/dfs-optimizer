import fs from "fs";
import os from "os";
import path from "path";
import { backfillPerfTracker } from "../src/backfill_perf_tracker";
import { readTrackerRows } from "../src/perf_tracker_db";
import { buildCoverageDiagnostics } from "../src/tracking/export_coverage_diagnostics";
import { diagnoseClvMatchCoverage } from "../src/tracking/reconcile_closing_lines";

describe("Phase 16T coverage accumulation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("backfill loads archive rows and enriches metadata fields", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16t-"));
    fs.mkdirSync(path.join(root, "data", "legs_archive"), { recursive: true });
    fs.mkdirSync(path.join(root, "data", "tier_archive"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "legs_archive", "prizepicks-legs-20260320.csv"),
      [
        "Sport,id,player,team,opponent,stat,line,league,book,overOdds,underOdds,trueProb,edge,legEv,runTimestamp,gameTime,IsWithin24h,leg_key,leg_label",
        "NBA,pp-1,Player A,TEAMX,TEAMY,points,20.5,NBA,draftkings,-110,-110,0.57,0.07,0.07,2026-03-20T12:00:00 ET,2026-03-20T19:00:00Z,TRUE,key,label",
      ].join("\n"),
      "utf8"
    );
    fs.mkdirSync(path.join(root, "data", "legs_archive", "snap_phase16t"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "legs_archive", "snap_phase16t", "snapshot_meta.json"),
      JSON.stringify({
        runTimestampEt: "2026-03-20T12:00:00 ET",
        legsSnapshotId: "snap_phase16t",
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "data", "tier_archive", "tier1-20260320.csv"),
      [
        "portfolioRank,tier,site,flexType,cardEV,compositeScore,correlationScore,diversity,correlation,liquidity,kellyFrac,kellyStake,fragile,fragileEvShifted,winProbCash,avgProb,avgLegEV,avgEdge,breakevenGap,statBalance,edgeCluster,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,runTimestamp",
        "1,1,PP,3P,0.1,0,0,0,0,0,0.2,20,false,0,0,0,0,0,0,{},x,pp-1,,,,,,2026-03-20T12:00:00 ET",
      ].join("\n"),
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const out = backfillPerfTracker();
    expect(out.appended).toBeGreaterThanOrEqual(1);
    expect(out.appendedWithLegsSnapshotId).toBeGreaterThanOrEqual(1);
    const rows = readTrackerRows();
    const target = rows.find(
      (r) =>
        typeof r.gameStartTime === "string" &&
        typeof r.marketId === "string" &&
        typeof r.playerId === "string" &&
        typeof r.openOddsAmerican === "number"
    );
    expect(target).toBeDefined();
    expect(target?.marketId).toMatch(/^mid_/);
    expect(target?.playerId).toMatch(/^pid_/);
    expect(target?.openImpliedProb).toBeGreaterThan(0);
  });

  it("diagnoseClvMatchCoverage remains conservative on ambiguity", () => {
    const stats = diagnoseClvMatchCoverage(
      [
        {
          playerName: "Player A",
          stat: "points",
          line: 20.5,
          side: "over",
          gameStartTime: "2026-03-20T20:00:00Z",
        },
      ],
      [
        {
          fetchedAtUtc: "2026-03-20T19:00:00Z",
          rows: [
            { league: "NBA", player: "Player A", stat: "points", line: 20.5, overOdds: -110 },
            { league: "NBA", player: "Player A", stat: "points", line: 20.5, overOdds: -120 },
          ],
        },
      ]
    );
    expect(stats.matched).toBe(0);
    expect(stats.skippedAmbiguous).toBe(1);
  });

  it("coverage diagnostics output shape is deterministic", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16t-"));
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "perf_tracker.jsonl"),
      JSON.stringify({
        date: "2026-03-20",
        leg_id: "x-over",
        player: "P",
        stat: "points",
        line: 20.5,
        book: "draftkings",
        trueProb: 0.55,
        projectedEV: 0.05,
        playedEV: 0.05,
        kelly: 0.1,
        card_tier: 1,
        result: 1,
      }) + "\n",
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const d = buildCoverageDiagnostics(root);
    expect(d.perf.totalRows).toBe(1);
    expect(d.perf.resolvedRows).toBe(1);
    expect(typeof d.clvMatchDiagnostics.skippedNoStart).toBe("number");
  });
});

