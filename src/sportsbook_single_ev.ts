// src/sportsbook_single_ev.ts
// Sports-agnostic single-bet EV + Kelly module for sportsbooks

import { Sport } from "./types";

export type OddsFormat = 'american' | 'decimal';

// Re-export Sport for convenience
export { Sport };

export interface SingleBetInput {
  sport: Sport;
  marketId: string;     // internal id for the prop/market
  book: string;         // sportsbook name, e.g. 'DK', 'FD'
  side: string;         // e.g. 'over', 'under', 'teamA', 'teamB'
  odds: number;         // American or decimal, see below
  oddsFormat: OddsFormat;
  trueWinProb: number;  // model or no-vig probability, 0–1
}

export interface SingleBetEVResult {
  sport: Sport;
  marketId: string;
  book: string;
  side: string;
  odds: number;
  oddsFormat: OddsFormat;
  impliedWinProb: number;   // from odds
  trueWinProb: number;      // input
  fairOddsDecimal: number;
  fairOddsAmerican: number;
  edgePct: number;          // (EV / stake) in %
  evPerUnit: number;        // EV per 1 unit stake
  kellyFraction: number;    // Kelly fraction of bankroll
}

/**
 * Convert American odds to decimal odds
 * American odds: +110 → 2.10, -110 → 1.91
 */
export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) {
    return (americanOdds / 100) + 1;
  } else {
    return (100 / Math.abs(americanOdds)) + 1;
  }
}

/**
 * Convert decimal odds to American odds
 * Decimal odds: 2.10 → +110, 1.91 → -110
 */
export function decimalToAmerican(decimalOdds: number): number {
  if (decimalOdds >= 2) {
    return Math.round((decimalOdds - 1) * 100);
  } else {
    return Math.round(-100 / (decimalOdds - 1));
  }
}

/**
 * Convert odds to decimal format (ensures decimal for calculations)
 */
export function toDecimalOdds(odds: number, format: OddsFormat): number {
  return format === 'decimal' ? odds : americanToDecimal(odds);
}

/**
 * Convert odds to American format (ensures American for display)
 */
export function toAmericanOdds(odds: number, format: OddsFormat): number {
  return format === 'american' ? odds : decimalToAmerican(odds);
}

/**
 * Calculate implied win probability from odds (ignoring vig)
 * Formula: impliedProb = 1 / decimalOdds
 */
export function calculateImpliedProbability(decimalOdds: number): number {
  return 1 / decimalOdds;
}

/**
 * Calculate fair decimal odds from true win probability
 * Formula: fairOdds = 1 / trueProb
 */
export function calculateFairOdds(trueWinProb: number): number {
  return 1 / trueWinProb;
}

/**
 * Calculate single-bet EV for a unit stake
 * EV = p * (payout) - (1 - p) * 1
 * where payout = decimalOdds - 1 (net profit per unit stake)
 */
export function calculateSingleBetEV(trueWinProb: number, decimalOdds: number): number {
  const netProfit = decimalOdds - 1; // profit per unit stake if win
  const ev = (trueWinProb * netProfit) - ((1 - trueWinProb) * 1);
  return ev;
}

/**
 * Calculate Kelly fraction for a single bet
 * Kelly formula: f* = (bp - q) / b
 * where b = decimal net odds, p = trueWinProb, q = 1 - p
 */
export function calculateKellyFraction(trueWinProb: number, decimalOdds: number): number {
  const b = decimalOdds - 1; // net odds (decimal profit per unit)
  const p = trueWinProb;
  const q = 1 - p;
  
  const kelly = (b * p - q) / b;
  
  // Clamp to [0, 1] and set to 0 if EV ≤ 0
  const ev = calculateSingleBetEV(p, decimalOdds);
  if (ev <= 0) {
    return 0;
  }
  
  return Math.max(0, Math.min(1, kelly));
}

/**
 * Main evaluation function for single-bet EV and Kelly
 */
export function evaluateSingleBetEV(input: SingleBetInput): SingleBetEVResult {
  // Convert odds to decimal for calculations
  const decimalOdds = toDecimalOdds(input.odds, input.oddsFormat);
  const americanOdds = toAmericanOdds(input.odds, input.oddsFormat);
  
  // Calculate probabilities and fair odds
  const impliedWinProb = calculateImpliedProbability(decimalOdds);
  const fairOddsDecimal = calculateFairOdds(input.trueWinProb);
  const fairOddsAmerican = decimalToAmerican(fairOddsDecimal);
  
  // Calculate EV and edge
  const evPerUnit = calculateSingleBetEV(input.trueWinProb, decimalOdds);
  const edgePct = evPerUnit * 100; // Convert to percentage
  
  // Calculate Kelly fraction
  const kellyFraction = calculateKellyFraction(input.trueWinProb, decimalOdds);
  
  return {
    sport: input.sport,
    marketId: input.marketId,
    book: input.book,
    side: input.side,
    odds: input.odds,
    oddsFormat: input.oddsFormat,
    impliedWinProb,
    trueWinProb: input.trueWinProb,
    fairOddsDecimal,
    fairOddsAmerican,
    edgePct,
    evPerUnit,
    kellyFraction,
  };
}

/**
 * Batch evaluate multiple single bets
 */
export function evaluateMultipleSingleBets(inputs: SingleBetInput[]): SingleBetEVResult[] {
  return inputs.map(evaluateSingleBetEV);
}

/**
 * Filter positive EV bets from results
 */
export function filterPositiveEV(results: SingleBetEVResult[]): SingleBetEVResult[] {
  return results.filter(result => result.evPerUnit > 0);
}

/**
 * Sort bets by EV (descending)
 */
export function sortByEV(results: SingleBetEVResult[]): SingleBetEVResult[] {
  return [...results].sort((a, b) => b.evPerUnit - a.evPerUnit);
}

/**
 * Sort bets by Kelly fraction (descending)
 */
export function sortByKelly(results: SingleBetEVResult[]): SingleBetEVResult[] {
  return [...results].sort((a, b) => b.kellyFraction - a.kellyFraction);
}

// TODO: Map existing odds feeds to SingleBetInput[]
// This function will connect your existing SGO / sportsbook odds model to SingleBetInput
/*
export function buildSingleBetInputsFromOddsFeed(/* odds feed types * /): SingleBetInput[] {
  // Map each market where we have a true probability and a book price
  // Example structure:
  // - Extract sport from league/market data
  // - Use marketId from your odds feed
  // - Map book names (DK, FD, etc.)
  // - Normalize sides (over/under, team names)
  // - Convert odds to appropriate format
  // - Use your model's trueWinProb from existing calculations
  
  return [];
}
*/
