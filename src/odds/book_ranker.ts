// src/odds/book_ranker.ts
// Phase 7.1: Prop-specific sportsbook sharpness ranking and weighted consensus EV.
//
// CRITICAL: Player-prop sharpness != straight-bet sharpness.
// Pinnacle/Circa dominate moneylines/spreads but are NOT #1 for props.
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ RESEARCH SOURCES (2024-2026)                                               │
// │                                                                             │
// │ 1. Pikkit / BettorOdds (Jun 2024)                                          │
// │    "Which sportsbooks are sharp?" — pikkit.com/blog                        │
// │    NBA Secondary Markets (Props) weights by line-movement convergence:     │
// │    Caesars 0.995 → FanDuel 1.007 → Propbuilder 1.014 → DK 1.046           │
// │    → Circa 1.094 (1/20th sample) | Last: Kambi 0.627                      │
// │    "NBA props were more uniform — the top 5 are pretty uniform."           │
// │                                                                             │
// │ 2. Pikkit / PromoGuy (Dec 2024)                                            │
// │    pikkit.com/blog/which-sportsbooks-are-sharp-best-apps-sports-betting    │
// │    NBA Secondary Markets (Props): DraftKings #1, Pinnacle #2,              │
// │    Novig #3, Propbuilder #4, Bookmaker #5, FanDuel #6                     │
// │    NFL Secondary Markets: BetOnline #1, Circa #2, Bookmaker #3            │
// │                                                                             │
// │ 3. Shaan Chanchani (OddsJam 2024 Quant Challenge)                          │
// │    shaanchanchani.github.io — 12,624 NFL prop bets across 4 books          │
// │    "Pinnacle consistently exhibited the sharpest pricing in the dataset."  │
// │    Power + Multiplicative devig models; favorite-longshot bias documented. │
// │                                                                             │
// │ 4. BetSmart / Beehiiv (2025)                                               │
// │    "Efficient Prop Markets For Summer 2025"                                │
// │    FanDuel: highest MLB prop weight (1.236). "If FanDuel stands out        │
// │    early in the day, everyone else moves to FanDuel."                      │
// │    NBA props: "more uniform" than MLB. FanDuel one-way markets caveat.    │
// │                                                                             │
// │ 5. Unabated (2024-25 season)                                               │
// │    "The jury is still out as to which, if any, books are truly sharp       │
// │    for props." Uses median consensus across all books for projections.     │
// │    +8% ROI / +690.6 units on NBA props using market-based consensus.      │
// │                                                                             │
// │ SYNTHESIS:                                                                  │
// │  - NBA props are MORE UNIFORM than straight bets (all top books cluster)  │
// │  - DraftKings & Pinnacle lead Dec 2024; Caesars & FanDuel led Jun 2024    │
// │  - FanDuel dominates MLB props but is mid-tier for NBA                     │
// │  - Circa's sample is 1/20th → high variance on ranking                    │
// │  - Consensus/median approach (Unabated) outperforms single-book trust     │
// │  - Props are LESS LIQUID than mains → single-book trust is riskier        │
// └─────────────────────────────────────────────────────────────────────────────┘

import { readTrackerRows } from "../perf_tracker_db";
import { PerfTrackerRow } from "../perf_tracker_types";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BookWeight {
  book: string;
  /** Prop-specific weight for NBA secondary markets. Higher = sharper. */
  weight: number;
  tier: "sharp" | "semi-sharp" | "square";
  /** Which research source(s) informed this weight. */
  source: string;
}

export interface DynamicBookAccuracy {
  book: string;
  resolvedLegs: number;
  hitRate: number;
  avgImpliedProb: number;
  /** hitRate − avgImpliedProb: positive = book underestimates hit rate (edge for over bettors). */
  accuracy: number;
  /** Dynamic weight multiplier derived from 30d accuracy. 1.0 = neutral. */
  dynamicMult: number;
}

// ── Static Prior Weights (NBA Props) ──────────────────────────────────────────
//
// Derived from Pikkit Jun 2024 + Dec 2024 convergence analysis.
// NBA prop weights are intentionally FLATTER than straight-bet weights because
// "the top 5 are pretty uniform" (Pikkit Jun 2024). The spread between #1 and
// #6 for NBA props is ~0.05 in raw weight, vs ~0.2+ for MLB props.
//
// Strategy: use the Dec 2024 ranking order but with compressed weights (1.5x–3.0x
// range instead of the 0.5x–3.0x range that would be appropriate for straights).
// This respects the research finding that NBA prop markets are relatively efficient
// across all major books.

export const PROP_WEIGHTS = [
  { book: "pinnacle",   weight: 3.0, tier: "sharp",      source: "Sharpest overall; benchmark for true odds" },
  { book: "fanduel",    weight: 2.8, tier: "sharp",      source: "Pikkit Jun 2024: #2 NBA props (1.007); MLB props leader (1.236)" },
  { book: "draftkings", weight: 2.8, tier: "sharp",      source: "Pikkit Dec 2024: #1 NBA props; tied with FD" },
  { book: "lowvig",     weight: 2.5, tier: "sharp",      source: "Low-vig sharp book; tracks Pinnacle closely" },
  { book: "espnbet",    weight: 1.8, tier: "semi-sharp", source: "Reasonable line quality, growing sharp action" },
  { book: "betmgm",     weight: 1.2, tier: "square",     source: "Retail book; minor consensus anchor" },
];

const PROP_WEIGHT_MAP = new Map(PROP_WEIGHTS.map((b) => [b.book.toLowerCase().trim(), b]));
const DEFAULT_WEIGHT: BookWeight = {
  book: "unknown", weight: 1.0, tier: "square",
  source: "Unknown book — neutral weight"
};

// ── Static Lookups ────────────────────────────────────────────────────────────

/**
 * Get the prop-specific weight configuration for a sportsbook.
 * Falls back to 1.0 (neutral) for unknown books.
 */
export function getBookWeight(book: string): BookWeight {
  const norm = book.toLowerCase().trim();
  return PROP_WEIGHT_MAP.get(norm) ?? { ...DEFAULT_WEIGHT, book: norm };
}

/**
 * Get the raw numeric weight for a book name.
 */
export function getBookWeightValue(book: string): number {
  return getBookWeight(book).weight;
}

/** All registered books with prop weights, for reporting. */
export function getAllBookWeights(): BookWeight[] {
  return [...PROP_WEIGHTS];
}

/**
 * Check if a book is eligible for consensus calculation.
 * Only books with explicit weights in PROP_WEIGHTS are eligible.
 */
export function isConsensusEligible(book: string): boolean {
  const norm = book.toLowerCase().trim();
  return PROP_WEIGHT_MAP.has(norm);
}

// ── Dynamic Accuracy (30d rolling from perf_tracker) ──────────────────────────

/**
 * Compute per-book accuracy from resolved perf_tracker.jsonl rows.
 * Compares each book's implied probability at play time (trueProb) against
 * actual result (hit/miss), producing a dynamicMult that adjusts the
 * static weight up (book is sharper than expected) or down.
 */
export function computeDynamicBookAccuracy(
  rows: PerfTrackerRow[],
  daysBack: number = 30,
  refDate: Date = new Date()
): DynamicBookAccuracy[] {
  const cutoff = new Date(refDate.getTime() - daysBack * 86_400_000);
  const resolved = rows.filter(
    (r) =>
      (r.result === 0 || r.result === 1) &&
      r.book &&
      new Date(r.date) >= cutoff
  );

  const byBook = new Map<string, PerfTrackerRow[]>();
  for (const r of resolved) {
    const norm = r.book.toLowerCase().trim();
    const list = byBook.get(norm) ?? [];
    list.push(r);
    byBook.set(norm, list);
  }

  const results: DynamicBookAccuracy[] = [];
  for (const [book, legs] of byBook) {
    if (legs.length < 5) continue; // need minimum sample
    const hits = legs.filter((r) => r.result === 1).length;
    const hitRate = hits / legs.length;
    const avgImpliedProb = legs.reduce((s, r) => s + r.trueProb, 0) / legs.length;
    const accuracy = hitRate - avgImpliedProb;

    // Dynamic multiplier: if book's implied prob is well-calibrated
    // (accuracy near 0), mult = 1.0. If accuracy > 0.03 (book is
    // conservative → edges exist), boost weight. If < -0.03, penalize.
    let dynamicMult = 1.0;
    if (legs.length >= 20) {
      dynamicMult = 1.0 + Math.max(-0.3, Math.min(0.3, accuracy * 3));
    }

    results.push({
      book,
      resolvedLegs: legs.length,
      hitRate,
      avgImpliedProb,
      accuracy,
      dynamicMult,
    });
  }

  return results.sort((a, b) => b.accuracy - a.accuracy);
}

/**
 * Get the effective weight for a book, combining static prop weight with
 * dynamic accuracy multiplier from historical data.
 *
 * effectiveWeight = staticWeight × dynamicMult
 */
export function getEffectiveBookWeight(
  book: string,
  dynamicAccuracy?: DynamicBookAccuracy[]
): number {
  const staticW = getBookWeightValue(book);
  if (!dynamicAccuracy || dynamicAccuracy.length === 0) return staticW;

  const norm = book.toLowerCase().trim();
  const dyn = dynamicAccuracy.find((d) => d.book === norm);
  if (!dyn) return staticW;

  return staticW * dyn.dynamicMult;
}

// ── Weighted Consensus ────────────────────────────────────────────────────────

/**
 * Compute a sharp-weighted consensus probability from multiple book odds.
 * Uses prop-specific weights defined in PROP_WEIGHTS array.
 * instead of straight-bet weights.
 *
 * @param bookProbs Array of { book, trueProb } from different sportsbooks
 * @param dynamicAccuracy Optional 30d rolling accuracy adjustments
 * @returns Weighted average trueProb
 */
export function weightedConsensusProb(
  bookProbs: { book: string; trueProb: number }[],
  dynamicAccuracy?: DynamicBookAccuracy[]
): number {
  if (bookProbs.length === 0) return 0.5;
  if (bookProbs.length === 1) return bookProbs[0].trueProb;

  let sumW = 0;
  let sumWP = 0;
  for (const { book, trueProb } of bookProbs) {
    const w = getEffectiveBookWeight(book, dynamicAccuracy);
    sumW += w;
    sumWP += w * trueProb;
  }
  return sumW > 0 ? sumWP / sumW : bookProbs[0].trueProb;
}

/**
 * Compute the "sharp edge" — difference between a single book's de-vigged
 * prob and the prop-weighted consensus. Positive = book is softer than
 * the sharp consensus on the over (exploitable edge for DFS overs).
 */
export function sharpEdge(
  bookProb: number,
  consensusProb: number
): number {
  return bookProb - consensusProb;
}

/**
 * Log the book weight table to console (for --debug or calibration reports).
 */
export function printBookWeightTable(dynamicAccuracy?: DynamicBookAccuracy[]): void {
  console.log("\n┌──────────────────────────────────────────────────────────────────────────────────┐");
  console.log("│  PROP-SPECIFIC BOOK SHARPNESS (NBA Secondary Markets)                           │");
  console.log("├───────────────┬────────┬──────────┬─────────┬────────────────────────────────────┤");
  console.log("│ Book          │ Weight │ Tier     │ DynMult │ Source                             │");
  console.log("├───────────────┼────────┼──────────┼─────────┼────────────────────────────────────┤");

  for (const bw of PROP_WEIGHTS) {
    const dyn = dynamicAccuracy?.find((d) => d.book === bw.book);
    const dynStr = dyn ? dyn.dynamicMult.toFixed(2) + "x" : "  —  ";
    const src = bw.source.substring(0, 36);
    const line = [
      bw.book.padEnd(14),
      (bw.weight.toFixed(1) + "x").padStart(6),
      bw.tier.padEnd(10),
      dynStr.padStart(7),
      src,
    ].join(" │ ");
    console.log(`│ ${line} │`);
  }
  console.log("└───────────────┴────────┴──────────┴─────────┴────────────────────────────────────┘\n");

  if (dynamicAccuracy && dynamicAccuracy.length > 0) {
    console.log("Dynamic accuracy (30d rolling):");
    for (const d of dynamicAccuracy.slice(0, 10)) {
      const sign = d.accuracy >= 0 ? "+" : "";
      console.log(
        `  ${d.book.padEnd(14)} n=${String(d.resolvedLegs).padStart(4)}  ` +
          `hit=${(d.hitRate * 100).toFixed(1)}%  ` +
          `implied=${(d.avgImpliedProb * 100).toFixed(1)}%  ` +
          `accuracy=${sign}${(d.accuracy * 100).toFixed(1)}%  ` +
          `dynMult=${d.dynamicMult.toFixed(2)}x`
      );
    }
  }
}
