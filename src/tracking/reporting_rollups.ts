/**
 * Phase 16M: time-period rollups + top leg / top card aggregates for tracker JSON.
 */

import type { TrackedCard, TrackedLeg } from "./tracker_schema";
import {
  calculatePerformanceStats,
  computePerformanceStatsFromGraded,
  loadGradedTrackedCards,
  type PerformanceStats,
} from "./analytics_engine";
import { cardInPeriod, type ReportingPeriod } from "./time_bounds";
import { computeGradedCardGrossReturn } from "./card_return";

const PERIODS: ReportingPeriod[] = ["day", "week", "month", "year", "lifetime"];

export interface TopLegAggregate {
  key: string;
  playerName: string;
  market: string;
  line: number;
  pick: "Over" | "Under";
  wins: number;
  losses: number;
  pushes: number;
  gradedLegs: number;
}

export interface TopCardAggregate {
  cardId: string;
  platform: "PP" | "UD";
  flexType: string;
  structureId?: string;
  projectedEv: number;
  timestamp: string;
  grossReturn: number;
  ambiguous: boolean;
  kellyStakeUsd?: number;
  netProfitUsd: number;
}

export interface TrackerReportingPayload extends PerformanceStats {
  periods: Record<ReportingPeriod, PerformanceStats>;
  topLegs: TopLegAggregate[];
  topCards: TopCardAggregate[];
  reportingMeta: {
    anchor: string;
    weekBucket: "Monday UTC date string (same calendar week as anchor)";
    dayMonthYear: "Card timestamps interpreted in America/New_York for day/month/year";
  };
}

function legKey(leg: TrackedLeg, card: TrackedCard): string {
  if (leg.legKey && leg.legKey.trim()) return leg.legKey.trim();
  return `${card.platform}|${leg.playerName}|${leg.market}|${leg.line}|${leg.pick}`;
}

export function buildTopLegAggregates(graded: TrackedCard[], limit = 30): TopLegAggregate[] {
  const map = new Map<string, TopLegAggregate>();
  for (const card of graded) {
    for (const leg of card.legs) {
      const key = legKey(leg, card);
      let row = map.get(key);
      if (!row) {
        row = {
          key,
          playerName: leg.playerName,
          market: leg.market,
          line: leg.line,
          pick: leg.pick,
          wins: 0,
          losses: 0,
          pushes: 0,
          gradedLegs: 0,
        };
        map.set(key, row);
      }
      row.gradedLegs += 1;
      if (leg.result === "Win") row.wins += 1;
      else if (leg.result === "Loss") row.losses += 1;
      else if (leg.result === "Push") row.pushes += 1;
    }
  }
  const list = Array.from(map.values());
  list.sort((a, b) => b.wins - a.wins || b.gradedLegs - a.gradedLegs);
  return list.slice(0, limit);
}

function stakeFor(card: TrackedCard): number {
  const k = card.kellyStakeUsd;
  if (typeof k === "number" && Number.isFinite(k) && k > 0) return k;
  return 1;
}

export function buildTopCardAggregates(graded: TrackedCard[], limit = 20): TopCardAggregate[] {
  const enriched = graded.map((card) => {
    const { gross, ambiguous } = computeGradedCardGrossReturn(card);
    const s = stakeFor(card);
    return {
      card,
      gross,
      ambiguous,
      netProfitUsd: s * (gross - 1),
    };
  });
  enriched.sort((a, b) => b.card.projectedEv - a.card.projectedEv);
  return enriched.slice(0, limit).map(({ card, gross, ambiguous, netProfitUsd }) => ({
    cardId: card.cardId,
    platform: card.platform,
    flexType: card.flexType,
    structureId: card.structureId,
    projectedEv: card.projectedEv,
    timestamp: card.timestamp,
    grossReturn: gross,
    ambiguous,
    kellyStakeUsd: card.kellyStakeUsd,
    netProfitUsd,
  }));
}

export function buildTrackerReportingPayload(
  pendingPath: string,
  historyPath: string | undefined,
  anchorInput?: string
): TrackerReportingPayload {
  const anchor = anchorInput ? new Date(anchorInput) : new Date();
  if (Number.isNaN(anchor.getTime())) {
    throw new Error("Invalid anchor date");
  }

  const gradedAll = loadGradedTrackedCards(pendingPath, historyPath);
  const lifetime = computePerformanceStatsFromGraded(gradedAll);

  const periods = {} as Record<ReportingPeriod, PerformanceStats>;
  for (const p of PERIODS) {
    if (p === "lifetime") {
      periods[p] = lifetime;
    } else {
      periods[p] = computePerformanceStatsFromGraded(gradedAll.filter((c) => cardInPeriod(c.timestamp, p, anchor)));
    }
  }

  const topLegs = buildTopLegAggregates(gradedAll);
  const topCards = buildTopCardAggregates(gradedAll);

  return {
    ...lifetime,
    periods,
    topLegs,
    topCards,
    reportingMeta: {
      anchor: anchor.toISOString(),
      weekBucket: "Monday UTC date string (same calendar week as anchor)",
      dayMonthYear: "Card timestamps interpreted in America/New_York for day/month/year",
    },
  };
}

/** Backward-compatible: stats only (no rollups) — same as calculatePerformanceStats */
export function buildTrackerStatsOnly(pendingPath: string, historyPath?: string): PerformanceStats {
  return calculatePerformanceStats(pendingPath, historyPath);
}
