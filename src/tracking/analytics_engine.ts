/**
 * src/tracking/analytics_engine.ts
 * Performance stats from fully-graded tracker cards (pending + history).
 */

import fs from "fs";
import type { TrackedCard, TrackedLeg, LegResult } from "./tracker_schema";
import { getPayoutByHits } from "../config/parlay_structures";

const GRADED_RESULTS: LegResult[] = ["Win", "Loss", "Push"];

function isLegGraded(leg: TrackedLeg): boolean {
  return GRADED_RESULTS.includes(leg.result);
}

/** True if every leg has a grade (Win/Loss/Push). */
export function isCardFullyGraded(card: TrackedCard): boolean {
  if (!card.legs?.length) return false;
  return card.legs.every(isLegGraded);
}

/** Card "cashes" when no leg is a Loss (all Win or Push). */
function cardCashes(card: TrackedCard): boolean {
  return card.legs.every((leg) => leg.result === "Win" || leg.result === "Push");
}

/** Payout multiplier for a card that cashes (all legs hit). Uses structure payout for n legs. */
function getCashMultiplier(card: TrackedCard): number {
  const n = card.legs.length;
  const payouts = getPayoutByHits(card.flexType);
  if (!payouts || typeof payouts[n] !== "number") return 0;
  return payouts[n];
}

export type EvBucket = "<5%" | "5-10%" | "10%+";

function getEvBucket(projectedEv: number): EvBucket {
  const pct = projectedEv * 100;
  if (pct < 5) return "<5%";
  if (pct < 10) return "5-10%";
  return "10%+";
}

export interface BucketStats {
  total: number;
  cashed: number;
  winRatePct: number;
  roiPct: number;
}

export interface PerformanceStats {
  /** From fully-graded cards only */
  totalGradedCards: number;
  totalCashed: number;
  /** Card-level: % of graded cards that cashed */
  cardWinRatePct: number;
  /** Leg-level: wins / (wins + losses + pushes) */
  legWinRatePct: number;
  /** (totalReturn - totalStaked) / totalStaked * 100; stake = 1 per card */
  roiPct: number;
  totalStaked: number;
  totalReturn: number;
  byPlatform: Record<"PP" | "UD", BucketStats>;
  byEvBucket: Record<EvBucket, BucketStats>;
}

function loadCardsFromFile(filePath: string): TrackedCard[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as { cards?: unknown[] };
    const cards = Array.isArray(data?.cards) ? data.cards : [];
    return cards as TrackedCard[];
  } catch {
    return [];
  }
}

/**
 * Reads pending_cards.json and optional history.json, filters to fully-graded cards,
 * and computes performance stats (ROI, win rate overall, by platform, by EV bucket).
 */
export function calculatePerformanceStats(
  pendingPath: string,
  historyPath?: string
): PerformanceStats {
  const pending = loadCardsFromFile(pendingPath);
  const history = historyPath ? loadCardsFromFile(historyPath) : [];
  const all = [...pending, ...history];
  const graded = all.filter(isCardFullyGraded);

  // Recompute ROI and bucket ROIs with proper per-card return
  let totalStaked = 0;
  let totalReturn = 0;
  const byPlatform: Record<"PP" | "UD", { total: number; cashed: number; staked: number; return: number }> = {
    PP: { total: 0, cashed: 0, staked: 0, return: 0 },
    UD: { total: 0, cashed: 0, staked: 0, return: 0 },
  };
  const byEvBucket: Record<EvBucket, { total: number; cashed: number; staked: number; return: number }> = {
    "<5%": { total: 0, cashed: 0, staked: 0, return: 0 },
    "5-10%": { total: 0, cashed: 0, staked: 0, return: 0 },
    "10%+": { total: 0, cashed: 0, staked: 0, return: 0 },
  };
  let legWins = 0;
  let legLosses = 0;
  let legPushes = 0;

  for (const card of graded) {
    const cashed = cardCashes(card);
    const mult = getCashMultiplier(card);
    totalStaked += 1;
    totalReturn += cashed ? mult : 0;

    for (const leg of card.legs) {
      if (leg.result === "Win") legWins += 1;
      else if (leg.result === "Loss") legLosses += 1;
      else if (leg.result === "Push") legPushes += 1;
    }

    const platform = card.platform;
    byPlatform[platform].total += 1;
    byPlatform[platform].staked += 1;
    if (cashed) {
      byPlatform[platform].cashed += 1;
      byPlatform[platform].return += mult;
    }

    const bucket = getEvBucket(card.projectedEv);
    byEvBucket[bucket].total += 1;
    byEvBucket[bucket].staked += 1;
    if (cashed) {
      byEvBucket[bucket].cashed += 1;
      byEvBucket[bucket].return += mult;
    }
  }

  const legTotal = legWins + legLosses + legPushes;
  const legWinRatePct = legTotal === 0 ? 0 : (legWins / legTotal) * 100;
  const roiPct = totalStaked === 0 ? 0 : ((totalReturn - totalStaked) / totalStaked) * 100;
  const totalCashed = graded.filter(cardCashes).length;
  const cardWinRatePct = graded.length === 0 ? 0 : (totalCashed / graded.length) * 100;

  const platformStats: Record<"PP" | "UD", BucketStats> = {
    PP: {
      total: byPlatform.PP.total,
      cashed: byPlatform.PP.cashed,
      winRatePct: byPlatform.PP.total === 0 ? 0 : (byPlatform.PP.cashed / byPlatform.PP.total) * 100,
      roiPct: byPlatform.PP.staked === 0 ? 0 : ((byPlatform.PP.return - byPlatform.PP.staked) / byPlatform.PP.staked) * 100,
    },
    UD: {
      total: byPlatform.UD.total,
      cashed: byPlatform.UD.cashed,
      winRatePct: byPlatform.UD.total === 0 ? 0 : (byPlatform.UD.cashed / byPlatform.UD.total) * 100,
      roiPct: byPlatform.UD.staked === 0 ? 0 : ((byPlatform.UD.return - byPlatform.UD.staked) / byPlatform.UD.staked) * 100,
    },
  };

  const bucketStats: Record<EvBucket, BucketStats> = {
    "<5%": {
      total: byEvBucket["<5%"].total,
      cashed: byEvBucket["<5%"].cashed,
      winRatePct: byEvBucket["<5%"].total === 0 ? 0 : (byEvBucket["<5%"].cashed / byEvBucket["<5%"].total) * 100,
      roiPct: byEvBucket["<5%"].staked === 0 ? 0 : ((byEvBucket["<5%"].return - byEvBucket["<5%"].staked) / byEvBucket["<5%"].staked) * 100,
    },
    "5-10%": {
      total: byEvBucket["5-10%"].total,
      cashed: byEvBucket["5-10%"].cashed,
      winRatePct: byEvBucket["5-10%"].total === 0 ? 0 : (byEvBucket["5-10%"].cashed / byEvBucket["5-10%"].total) * 100,
      roiPct: byEvBucket["5-10%"].staked === 0 ? 0 : ((byEvBucket["5-10%"].return - byEvBucket["5-10%"].staked) / byEvBucket["5-10%"].staked) * 100,
    },
    "10%+": {
      total: byEvBucket["10%+"].total,
      cashed: byEvBucket["10%+"].cashed,
      winRatePct: byEvBucket["10%+"].total === 0 ? 0 : (byEvBucket["10%+"].cashed / byEvBucket["10%+"].total) * 100,
      roiPct: byEvBucket["10%+"].staked === 0 ? 0 : ((byEvBucket["10%+"].return - byEvBucket["10%+"].staked) / byEvBucket["10%+"].staked) * 100,
    },
  };

  return {
    totalGradedCards: graded.length,
    totalCashed,
    cardWinRatePct,
    legWinRatePct,
    roiPct,
    totalStaked,
    totalReturn,
    byPlatform: platformStats,
    byEvBucket: bucketStats,
  };
}
