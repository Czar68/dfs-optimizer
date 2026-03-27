import type { CardEvResult, EvPick } from "../types";
import type { MergeStageAccounting } from "../merge_odds";
import { computeBestBetScore } from "../best_bets_score";

export interface Tier1ScarcityAttribution {
  generatedAt: string;
  runTimestamp: string;
  summary: {
    tier1Count: number;
    totalCards: number;
    tier1Rate: number;
    isTier1Scarce: boolean;
    primaryReasonCode:
      | "no_eligible_candidates_after_filtering"
      | "all_candidates_below_tier1_threshold"
      | "started_game_time_window_exclusions"
      | "match_quality_pool_reduction"
      | "healthy_tier1_supply";
  };
  causes: {
    noEligibleCandidatesAfterFiltering: boolean;
    candidatesPresentButBelowTier1Threshold: boolean;
    startedGameTimeWindowExclusions: {
      startedLegRows: number;
      startedLegRate: number;
      likelyImpact: "none" | "low" | "moderate" | "high";
    };
    matchQualityPoolReduction: {
      rawProps: number;
      matchedRows: number;
      emittedRows: number;
      unmatchedPropRows: number;
      matchRate: number;
      likelyImpact: "none" | "low" | "moderate" | "high";
    } | null;
  };
  bySite: {
    PP: { totalCards: number; tier1Cards: number };
    UD: { totalCards: number; tier1Cards: number };
  };
}

function likelyImpactFromRate(rate: number): "none" | "low" | "moderate" | "high" {
  if (rate <= 0) return "none";
  if (rate < 0.15) return "low";
  if (rate < 0.35) return "moderate";
  return "high";
}

function tier1Count(cards: CardEvResult[]): number {
  return cards.filter((card) => {
    const score = computeBestBetScore({
      cardEv: card.cardEv,
      avgEdgePct: card.avgEdgePct,
      winProbCash: card.winProbCash,
      legCount: card.legs.length,
      sport: card.legs[0]?.pick.sport ?? "NBA",
    });
    return score.tier === "must_play";
  }).length;
}

function countStartedLegs(legs: EvPick[], nowMs: number): number {
  return legs.filter((leg) => {
    if (!leg.startTime) return false;
    const ts = Date.parse(String(leg.startTime));
    return Number.isFinite(ts) && ts <= nowMs;
  }).length;
}

export function buildTier1ScarcityAttribution(input: {
  runTimestamp: string;
  ppCards: CardEvResult[];
  udCards?: CardEvResult[];
  ppFilteredLegs: EvPick[];
  ppMergeStageAccounting?: MergeStageAccounting;
  now?: Date;
}): Tier1ScarcityAttribution {
  const nowMs = (input.now ?? new Date()).getTime();
  const ppTier1 = tier1Count(input.ppCards);
  const udTier1 = tier1Count(input.udCards ?? []);
  const totalCards = input.ppCards.length + (input.udCards?.length ?? 0);
  const totalTier1 = ppTier1 + udTier1;

  const startedLegRows = countStartedLegs(input.ppFilteredLegs, nowMs);
  const startedLegRate =
    input.ppFilteredLegs.length > 0
      ? startedLegRows / input.ppFilteredLegs.length
      : 0;

  const match = input.ppMergeStageAccounting;
  const matchRate = match
    ? match.rawRows > 0
      ? match.matchedRows / match.rawRows
      : 0
    : 0;

  const noEligible = input.ppFilteredLegs.length === 0;
  const belowTier1 = input.ppCards.length > 0 && ppTier1 === 0;
  const startedLikely = likelyImpactFromRate(startedLegRate);
  const matchLikely = likelyImpactFromRate(match ? Math.max(0, 1 - matchRate) : 0);
  const isTier1Scarce = totalTier1 === 0 || (totalCards > 0 && totalTier1 / totalCards < 0.08);

  let primaryReasonCode: Tier1ScarcityAttribution["summary"]["primaryReasonCode"] = "healthy_tier1_supply";
  if (isTier1Scarce) {
    if (noEligible) primaryReasonCode = "no_eligible_candidates_after_filtering";
    else if (belowTier1) primaryReasonCode = "all_candidates_below_tier1_threshold";
    else if (startedLikely === "high" || startedLikely === "moderate") primaryReasonCode = "started_game_time_window_exclusions";
    else if (matchLikely === "high" || matchLikely === "moderate") primaryReasonCode = "match_quality_pool_reduction";
    else primaryReasonCode = "all_candidates_below_tier1_threshold";
  }

  return {
    generatedAt: new Date().toISOString(),
    runTimestamp: input.runTimestamp,
    summary: {
      tier1Count: totalTier1,
      totalCards,
      tier1Rate: totalCards > 0 ? totalTier1 / totalCards : 0,
      isTier1Scarce,
      primaryReasonCode,
    },
    causes: {
      noEligibleCandidatesAfterFiltering: noEligible,
      candidatesPresentButBelowTier1Threshold: belowTier1,
      startedGameTimeWindowExclusions: {
        startedLegRows,
        startedLegRate,
        likelyImpact: startedLikely,
      },
      matchQualityPoolReduction: match
        ? {
            rawProps: match.rawRows,
            matchedRows: match.matchedRows,
            emittedRows: match.emittedRows,
            unmatchedPropRows: match.unmatchedPropRows,
            matchRate,
            likelyImpact: matchLikely,
          }
        : null,
    },
    bySite: {
      PP: { totalCards: input.ppCards.length, tier1Cards: ppTier1 },
      UD: { totalCards: input.udCards?.length ?? 0, tier1Cards: udTier1 },
    },
  };
}
