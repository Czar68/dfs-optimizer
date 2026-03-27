import type { LegCsvRecord } from "../src/tracking/legs_csv_index";
import {
  buildTrackerCreationIntegrityReport,
} from "../src/reporting/export_tracker_creation_integrity";
import { buildPerfTrackerRowFromTierLeg } from "../src/tracking/tracker_creation_backfill";
import {
  countPrimaryReasonsNonCreationCalibratableTagged,
  CREATION_SOURCE_BACKFILL,
  hasImpliedOrOpenOddsContext,
  isCreationCalibratableRow,
  primaryCreationCompletenessReason,
  resolvePlatformForBackfill,
} from "../src/tracking/tracker_creation_integrity_contract";
import type { PerfTrackerRow } from "../src/perf_tracker_types";

function mkLeg(p: Partial<LegCsvRecord>): LegCsvRecord {
  return {
    player: "A",
    stat: "points",
    line: 10,
    book: "fd",
    league: "NBA",
    trueProb: 0.52,
    legEv: 0.03,
    overOdds: -110,
    underOdds: -110,
    ...p,
  };
}

describe("Phase 69 tracker creation integrity", () => {
  it("buildPerfTrackerRowFromTierLeg threads legs CSV + tier context with provenance", () => {
    const leg = mkLeg({
      gameStartTime: "2026-03-20T23:00:00.000Z",
    });
    const row = buildPerfTrackerRowFromTierLeg({
      date: "2026-03-20",
      legId: "prizepicks-test-points-10-over",
      leg,
      siteColumnPresent: true,
      siteRawUpper: "PP",
      structure: "3P",
      kellyFrac: 0.1,
      cardTier: 1,
      runTimestamp: "2026-03-20T14:00:00 ET",
    });
    expect(row.creationSource).toBe(CREATION_SOURCE_BACKFILL);
    expect(typeof row.creationTimestampUtc).toBe("string");
    expect(row.creationProvenance?.platform).toBe("tier_csv_site");
    expect(row.creationProvenance?.gameStartTime).toBe("legs_csv");
    expect(row.creationProvenance?.trueProb).toBe("legs_csv");
    expect(row.selectionSnapshotTs).toBe("2026-03-20T14:00:00 ET");
    expect(row.platform).toBe("PP");
    expect(row.gameStartTime).toBe("2026-03-20T23:00:00.000Z");
    expect(isCreationCalibratableRow(row)).toBe(true);
  });

  it("omits invalid leg gameStartTime and marks provenance missing", () => {
    const row = buildPerfTrackerRowFromTierLeg({
      date: "2026-03-20",
      legId: "prizepicks-x-points-10-over",
      leg: mkLeg({ gameStartTime: "not-a-date" }),
      siteColumnPresent: false,
      siteRawUpper: "",
      structure: "",
      kellyFrac: 0.1,
      cardTier: 1,
      runTimestamp: "",
    });
    expect(row.gameStartTime).toBeUndefined();
    expect(row.creationProvenance?.gameStartTime).toBe("missing");
    expect(primaryCreationCompletenessReason(row)).toBe("missing_game_start");
  });

  it("resolvePlatformForBackfill uses leg_id when site empty", () => {
    expect(resolvePlatformForBackfill(true, "", "underdog-nba-points-10-over")).toBe("UD");
    expect(resolvePlatformForBackfill(true, "UD", "prizepicks-x")).toBe("UD");
    expect(resolvePlatformForBackfill(false, "", "prizepicks-x-points-10-over")).toBe("PP");
  });

  it("creation report shape is deterministic", () => {
    const tagged: PerfTrackerRow = buildPerfTrackerRowFromTierLeg({
      date: "2026-03-20",
      legId: "prizepicks-t-points-10-over",
      leg: mkLeg({ gameStartTime: "2026-03-20T23:00:00.000Z" }),
      siteColumnPresent: true,
      siteRawUpper: "PP",
      structure: "2P",
      kellyFrac: 0.1,
      cardTier: 1,
      runTimestamp: "t",
    });
    const legacy: PerfTrackerRow = { ...tagged, creationTimestampUtc: undefined, creationProvenance: undefined };
    const report = buildTrackerCreationIntegrityReport([tagged, legacy], "2026-01-01T00:00:00.000Z");
    expect(report.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(report.creationTagged.rowsCreated).toBe(1);
    expect(report.legacyRowsWithoutCreationTag).toBe(1);
    expect(report.inventoryAllRows.totalRows).toBe(2);
    expect(report.creationProvenanceAggregate).toEqual(expect.any(Object));
  });

  it("hasImpliedOrOpenOddsContext accepts openOddsAmerican without impliedProb field", () => {
    const r: PerfTrackerRow = {
      date: "d",
      leg_id: "prizepicks-x-points-10-over",
      player: "p",
      stat: "points",
      line: 10,
      book: "b",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
      openOddsAmerican: -110,
    };
    expect(hasImpliedOrOpenOddsContext(r)).toBe(true);
  });

  it("countPrimaryReasonsNonCreationCalibratableTagged is fail-closed for tagged incomplete rows", () => {
    const bad = buildPerfTrackerRowFromTierLeg({
      date: "2026-03-20",
      legId: "prizepicks-t-points-10-over",
      leg: mkLeg({ gameStartTime: "2026-03-20T23:00:00.000Z", overOdds: undefined, underOdds: undefined }),
      siteColumnPresent: true,
      siteRawUpper: "PP",
      structure: "",
      kellyFrac: 0.1,
      cardTier: 1,
      runTimestamp: "",
    });
    bad.impliedProb = undefined;
    bad.openOddsAmerican = undefined;
    bad.overOdds = undefined;
    bad.underOdds = undefined;
    const counts = countPrimaryReasonsNonCreationCalibratableTagged([bad]);
    expect(counts.missing_implied_or_open_odds_context).toBeGreaterThanOrEqual(1);
  });
});
