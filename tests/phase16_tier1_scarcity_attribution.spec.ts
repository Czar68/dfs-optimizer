import { buildTier1ScarcityAttribution } from "../src/reporting/tier1_scarcity";
import type { CardEvResult, EvPick } from "../src/types";
import type { MergeStageAccounting } from "../src/merge_odds";

function makeLeg(overrides: Partial<EvPick> = {}): EvPick {
  return {
    id: "leg-1",
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "Player One",
    team: "AAA",
    opponent: "BBB",
    stat: "points",
    line: 20.5,
    projectionId: "p-1",
    gameId: "g-1",
    startTime: "2030-01-01T00:00:00.000Z",
    isNonStandardOdds: false,
    book: "draftkings",
    overOdds: -110,
    underOdds: -110,
    trueProb: 0.56,
    fairOdds: -102,
    edge: 0.06,
    legEv: 0.04,
    outcome: "over",
    ...overrides,
  };
}

function makeCard(overrides: Partial<CardEvResult> = {}): CardEvResult {
  const leg = makeLeg();
  return {
    flexType: "5F",
    legs: [{ pick: leg, side: "over" }],
    stake: 1,
    totalReturn: 1.1,
    expectedValue: 0.1,
    winProbability: 0.06,
    cardEv: 0.1,
    winProbCash: 0.06,
    winProbAny: 0.06,
    avgProb: 0.56,
    avgEdgePct: 6,
    hitDistribution: { 1: 0.06 },
    ...overrides,
  };
}

function makeMergeAccounting(overrides: Partial<MergeStageAccounting> = {}): MergeStageAccounting {
  return {
    source: { providerUsed: "OddsAPI" },
    rawRows: 100,
    propsConsideredForMatchingRows: 90,
    totalOddsRowsConsidered: 300,
    matchedRows: 45,
    unmatchedPropRows: 40,
    unmatchedOddsRows: 200,
    emittedRows: 45,
    filteredBeforeMergeRows: 10,
    noMatchRows: 40,
    skippedByReason: {
      promoOrSpecial: 0,
      fantasyExcluded: 0,
      comboLabelExcluded: 0,
      noOddsStat: 4,
      noCandidate: 18,
      lineDiff: 12,
      juice: 10,
    },
    unmatchedAttribution: {
      propsBySite: { prizepicks: 30, underdog: 10 },
      propsByReason: { no_candidate: 18, line_diff: 12, juice: 10 },
      oddsByBook: { draftkings: 90 },
    },
    explicitAliasResolutionHits: 0,
    multiBookConsensusPickCount: 0,
    ...overrides,
  };
}

describe("Phase 16: Tier 1 scarcity attribution", () => {
  test("attributes no eligible candidates after filtering", () => {
    const attribution = buildTier1ScarcityAttribution({
      runTimestamp: "2026-03-19T10:00:00 ET",
      ppCards: [],
      ppFilteredLegs: [],
      ppMergeStageAccounting: makeMergeAccounting({ matchedRows: 0, rawRows: 50 }),
      now: new Date("2026-03-19T10:00:00.000Z"),
    });

    expect(attribution.summary.isTier1Scarce).toBe(true);
    expect(attribution.summary.primaryReasonCode).toBe("no_eligible_candidates_after_filtering");
    expect(attribution.causes.noEligibleCandidatesAfterFiltering).toBe(true);
  });

  test("attributes below-tier1 scarcity when cards exist but Tier 1 is zero", () => {
    const lowTierCard = makeCard({
      // keep cards valid but below must_play thresholds in computeBestBetScore
      cardEv: 0.03,
      winProbCash: 0.04,
      avgEdgePct: 2.0,
    });

    const attribution = buildTier1ScarcityAttribution({
      runTimestamp: "2026-03-19T10:00:00 ET",
      ppCards: [lowTierCard],
      ppFilteredLegs: [makeLeg()],
      ppMergeStageAccounting: makeMergeAccounting(),
      now: new Date("2026-03-19T10:00:00.000Z"),
    });

    expect(attribution.summary.isTier1Scarce).toBe(true);
    expect(attribution.summary.primaryReasonCode).toBe("all_candidates_below_tier1_threshold");
    expect(attribution.causes.candidatesPresentButBelowTier1Threshold).toBe(true);
    expect(attribution.bySite.PP.tier1Cards).toBe(0);
  });

  test("includes platform-aware Tier 1 counts by site", () => {
    const ppTier1Card = makeCard({
      cardEv: 0.15,
      winProbCash: 0.2,
      avgEdgePct: 12,
      legs: [{ pick: makeLeg(), side: "over" }],
    });
    const udTier1Card = makeCard({
      legs: [{ pick: makeLeg({ site: "underdog" }), side: "over" }],
      cardEv: 0.12,
      winProbCash: 0.15,
      avgEdgePct: 9,
    });

    const attribution = buildTier1ScarcityAttribution({
      runTimestamp: "2026-03-19T10:00:00 ET",
      ppCards: [ppTier1Card],
      udCards: [udTier1Card],
      ppFilteredLegs: [makeLeg()],
      ppMergeStageAccounting: makeMergeAccounting({ matchedRows: 90, rawRows: 100 }),
      now: new Date("2026-03-19T10:00:00.000Z"),
    });

    expect(attribution.bySite.PP.tier1Cards).toBe(1);
    expect(attribution.bySite.UD.tier1Cards).toBe(1);
    expect(attribution.summary.isTier1Scarce).toBe(false);
  });
});
