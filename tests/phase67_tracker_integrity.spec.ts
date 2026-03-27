import type { PerfTrackerRow } from "../src/perf_tracker_types";
import {
  applyGroundedTrackerEnrichment,
  resolveEarliestPreStartChosenOdds,
  tryDeriveImpliedProbFromRowFields,
} from "../src/tracking/implied_prob_recovery";
import {
  computeTrackerCompleteness,
  inferPlatformGrounded,
  isFullyCalibratableResolved,
  primaryCompletenessReasonResolved,
} from "../src/tracking/tracker_integrity_contract";
import { buildTrackerIntegrityReport } from "../src/reporting/export_tracker_integrity";
import type { SnapshotIndexItem } from "../src/tracking/reconcile_closing_lines";

function mkRow(partial: Partial<PerfTrackerRow>): PerfTrackerRow {
  return {
    date: "2026-03-20",
    leg_id: "prizepicks-test-points-10.5-over",
    player: "P",
    stat: "points",
    line: 10.5,
    book: "fanduel",
    trueProb: 0.55,
    projectedEV: 0.05,
    playedEV: 0.05,
    kelly: 0.1,
    card_tier: 1,
    result: 1,
    ...partial,
  };
}

describe("Phase 67 tracker integrity", () => {
  it("computeTrackerCompleteness counts resolved and rates deterministically", () => {
    const rows = [
      mkRow({ result: 1, platform: "PP", impliedProb: 0.5, projectedEV: 0.02 }),
      mkRow({ result: 0, platform: "PP", impliedProb: 0.5, projectedEV: 0.02 }),
      mkRow({ result: undefined }),
    ];
    const c = computeTrackerCompleteness(rows);
    expect(c.totalRows).toBe(3);
    expect(c.resolvedRows).toBe(2);
    expect(c.resolvedRowsFullyCalibratable).toBe(2);
    expect(c.fullyCalibratableRate).toBe(1);
  });

  it("primaryCompletenessReasonResolved flags missing_implied_prob first", () => {
    const r = mkRow({
      result: 1,
      platform: "PP",
      trueProb: 0.5,
      projectedEV: 0.02,
      impliedProb: undefined,
    });
    expect(primaryCompletenessReasonResolved(r)).toBe("missing_implied_prob");
  });

  it("tryDeriveImpliedProbFromRowFields uses open odds chain", () => {
    const r = mkRow({ overOdds: -110, underOdds: -110, side: "over", impliedProb: undefined });
    const d = tryDeriveImpliedProbFromRowFields(r);
    expect(d).not.toBeNull();
    expect(d!.source).toBe("overUnderSide");
    expect(d!.implied).toBeGreaterThan(0);
    expect(Number.isNaN(d!.implied)).toBe(false);
  });

  it("resolveEarliestPreStartChosenOdds refuses ambiguous odds in same snapshot", () => {
    const snaps: SnapshotIndexItem[] = [
      {
        fetchedAtUtc: "2026-01-01T12:00:00.000Z",
        rows: [
          { league: "NBA", player: "A", stat: "points", line: 10, overOdds: -110, underOdds: -110 },
          { league: "NBA", player: "A", stat: "points", line: 10, overOdds: -120, underOdds: +100 },
        ],
      },
    ];
    const m = resolveEarliestPreStartChosenOdds(snaps, {
      marketId: undefined,
      league: "NBA",
      playerName: "A",
      stat: "points",
      line: 10,
      side: "over",
      gameStartTime: "2026-01-01T23:00:00.000Z",
    });
    expect(m.status).toBe("ambiguous");
  });

  it("resolveEarliestPreStartChosenOdds matches unique odds", () => {
    const snaps: SnapshotIndexItem[] = [
      {
        fetchedAtUtc: "2026-01-01T12:00:00.000Z",
        rows: [{ league: "NBA", player: "A", stat: "points", line: 10, overOdds: -110, underOdds: -105 }],
      },
    ];
    const m = resolveEarliestPreStartChosenOdds(snaps, {
      league: "NBA",
      playerName: "A",
      stat: "points",
      line: 10,
      side: "over",
      gameStartTime: "2026-01-01T23:00:00.000Z",
    });
    expect(m.status).toBe("matched");
    expect(m.oddsAmerican).toBe(-110);
  });

  it("applyGroundedTrackerEnrichment does not write NaN impliedProb", () => {
    const rows = [
      mkRow({
        result: 1,
        platform: "PP",
        trueProb: 0.5,
        projectedEV: 0.02,
        overOdds: -110,
        underOdds: -108,
        side: "over",
        impliedProb: undefined,
      }),
    ];
    const { rows: out } = applyGroundedTrackerEnrichment(rows, { snapshots: [] });
    expect(typeof out[0].impliedProb).toBe("number");
    expect(Number.isFinite(out[0].impliedProb!)).toBe(true);
  });

  it("buildTrackerIntegrityReport shape is stable", () => {
    const before = [mkRow({ result: 1, platform: "PP", trueProb: 0.5, impliedProb: 0.48, projectedEV: 0.02 })];
    const after = [...before];
    const rep = buildTrackerIntegrityReport({
      rowsBeforeMutation: before,
      rowsAfterMutation: after,
      enrichmentStats: {
        rowsScanned: 1,
        impliedFilledFromOpenImpliedProb: 0,
        impliedFilledFromOpenOddsAmerican: 0,
        impliedFilledFromOverUnderSide: 0,
        impliedFilledFromSnapshot: 0,
        skippedSnapshotAmbiguous: 0,
        skippedSnapshotNoGameStart: 0,
        skippedSnapshotNoMatch: 0,
        legsCsvMergedOdds: 0,
        trueProbFilledFromLegsCsv: 0,
        projectedEvFilledFromLegsCsv: 0,
        platformFilledFromInference: 0,
        openOddsAmericanFilledFromLegs: 0,
        oddsBucketRecomputed: 0,
      },
      applied: false,
      perfTrackerWritten: false,
      generatedAtUtc: "2026-01-01T00:00:00.000Z",
    });
    expect(rep.schemaVersion).toBe(1);
    expect(rep.after.resolvedRowsFullyCalibratable).toBe(1);
  });

  it("inferPlatformGrounded reads leg_id", () => {
    expect(inferPlatformGrounded(mkRow({ platform: undefined, leg_id: "underdog-x" }))).toBe("UD");
    expect(inferPlatformGrounded(mkRow({ platform: undefined, leg_id: "prizepicks-x" }))).toBe("PP");
  });

  it("isFullyCalibratableResolved requires all fields", () => {
    expect(
      isFullyCalibratableResolved(
        mkRow({ result: 1, platform: "PP", trueProb: 0.5, impliedProb: 0.48, projectedEV: 0.02 })
      )
    ).toBe(true);
    expect(
      isFullyCalibratableResolved(
        mkRow({ result: 1, platform: "PP", trueProb: 0.5, impliedProb: undefined, projectedEV: 0.02 })
      )
    ).toBe(false);
  });
});
