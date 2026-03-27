/**
 * Phase 116 — Dashboard live input quality parsers (browser-safe; no React).
 */
import {
  parseLatestMergeQualityJsonForDashboard,
  parseMergePlatformQualityByPassJson,
  parseMergeQualityStatusJson,
  severityBadgeClass,
} from "../src/reporting/live_input_quality_dashboard";

describe("Phase 116 — live input quality dashboard parse", () => {
  it("parseMergeQualityStatusJson: full Phase 115 status", () => {
    const p = parseMergeQualityStatusJson({
      schemaVersion: 4,
      generatedAtUtc: "2026-01-01T00:00:00.000Z",
      overallSeverity: "WARN",
      liveInputDegraded: true,
      liveMergeQualityLine: "match_rate_pp=0.5 match_rate_ud=null unmatched_legs=1",
      explanation: "x",
      keyMetrics: { mergeCoverage: 0.4, fallbackRate: 0.1, dropRate: 0.2 },
      driftNote: "coverageDelta=0.01",
      ppConsensusOperatorLine: "ppConsensus n=10 meanBooks=2.50 meanSpread=0.0100 p95Spread=0.0200 multiBookShare=80.0%",
    });
    expect(p).not.toBeNull();
    expect(p!.overallSeverity).toBe("WARN");
    expect(p!.liveInputDegraded).toBe(true);
    expect(p!.keyMetrics?.mergeCoverage).toBeCloseTo(0.4, 6);
    expect(p!.ppConsensusOperatorLine).toContain("ppConsensus");
  });

  it("parseMergeQualityStatusJson: null without overallSeverity", () => {
    expect(parseMergeQualityStatusJson({})).toBeNull();
    expect(parseMergeQualityStatusJson(null)).toBeNull();
  });

  it("parseMergePlatformQualityByPassJson: PP + UD", () => {
    const p = parseMergePlatformQualityByPassJson({
      schemaVersion: 1,
      updatedAtUtc: "t",
      note: "both",
      prizepicks: {
        match_rate: 0.8,
        unmatched_legs_count: 2,
        alias_resolution_rate: 0.01,
        dropped_due_to_missing_market: 1,
        dropped_due_to_line_diff: 0,
        oddsSnapshotAgeMinutes: 12,
      },
      underdog: {
        match_rate: 0.7,
        unmatched_legs_count: 3,
      },
    });
    expect(p).not.toBeNull();
    expect(p!.prizepicks?.match_rate).toBeCloseTo(0.8, 6);
    expect(p!.underdog?.unmatched_legs_count).toBe(3);
  });

  it("parseLatestMergeQualityJsonForDashboard: freshness + live + identity", () => {
    const p = parseLatestMergeQualityJsonForDashboard({
      liveMergeQuality: {
        match_rate_pp: 0.9,
        match_rate_ud: 0.85,
        unmatched_legs_count: 4,
        alias_resolution_rate: 0.02,
        dropped_due_to_missing_market: 1,
        dropped_due_to_line_diff: 2,
        odds_unmatched_inventory_rows: 10,
        nearest_match_share: 0.1,
        last_audit_pass_note: "last_merge_pass=underdog",
      },
      freshness: {
        stalenessNote: "coarse clock",
        oddsSnapshotAgeMinutes: 5,
        mergeVsFetchSkewMinutes: 1.2,
      },
      identityVisibility: { note: "see player diagnostics" },
    });
    expect(p).not.toBeNull();
    expect(p!.freshness?.stalenessNote).toContain("coarse");
    expect(p!.liveMergeQuality?.last_audit_pass_note).toContain("underdog");
    expect(p!.identityNote).toContain("diagnostics");
  });

  it("parseLatestMergeQualityJsonForDashboard: null when no Phase 115 blocks", () => {
    expect(parseLatestMergeQualityJsonForDashboard({ schemaVersion: 1 })).toBeNull();
  });

  it("parseLatestMergeQualityJsonForDashboard: Phase P ppConsensusDispersion + operator line", () => {
    const p = parseLatestMergeQualityJsonForDashboard({
      ppConsensusOperatorLine:
        "ppConsensus n=40 meanBooks=3.10 meanSpread=0.0123 p95Spread=0.0300 multiBookShare=92.5%",
      ppConsensusDispersion: {
        nPpMerged: 40,
        meanConsensusBookCount: 3.1,
        meanDevigSpreadOver: 0.0123,
        p95DevigSpreadOver: 0.03,
        shareMultiBookConsensus: 0.925,
      },
    });
    expect(p).not.toBeNull();
    expect(p!.ppConsensusOperatorLine).toContain("meanBooks=3.10");
    expect(p!.ppConsensusDispersion?.nPpMerged).toBe(40);
    expect(p!.ppConsensusDispersion?.p95DevigSpreadOver).toBeCloseTo(0.03, 6);
  });

  it("parseLatestMergeQualityJsonForDashboard: ppConsensusDispersion only is enough to parse", () => {
    const p = parseLatestMergeQualityJsonForDashboard({
      ppConsensusDispersion: {
        nPpMerged: 1,
        meanConsensusBookCount: 2,
        meanDevigSpreadOver: 0,
        p95DevigSpreadOver: null,
        shareMultiBookConsensus: 1,
      },
    });
    expect(p).not.toBeNull();
    expect(p!.ppConsensusDispersion?.p95DevigSpreadOver).toBeNull();
  });

  it("severityBadgeClass maps INFO/WARN/FAIL", () => {
    expect(severityBadgeClass("INFO")).toBe("ok");
    expect(severityBadgeClass("WARN")).toBe("warn");
    expect(severityBadgeClass("FAIL")).toBe("fail");
    expect(severityBadgeClass("?")).toBe("unknown");
  });
});
