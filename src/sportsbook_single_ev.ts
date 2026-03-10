// src/sportsbook_single_ev.ts
// Core math delegated to math_models/single_bet_ev (locked-down canonical source)

import { Sport } from "./types";

export type OddsFormat = 'american' | 'decimal';
export { Sport };

export interface SingleBetInput {
  sport: Sport;
  marketId: string;
  book: string;
  side: string;
  odds: number;
  oddsFormat: OddsFormat;
  trueWinProb: number;
}

export interface SingleBetEVResult {
  sport: Sport;
  marketId: string;
  book: string;
  side: string;
  odds: number;
  oddsFormat: OddsFormat;
  impliedWinProb: number;
  trueWinProb: number;
  fairOddsDecimal: number;
  fairOddsAmerican: number;
  edgePct: number;
  evPerUnit: number;
  kellyFraction: number;
}

export {
  americanToDecimal,
  decimalToAmerican,
  calculateImpliedProbability,
  calculateFairOdds,
  calculateSingleBetEV,
  calculateKellyFraction,
} from '../math_models/single_bet_ev';

import {
  americanToDecimal,
  decimalToAmerican,
  calculateImpliedProbability,
  calculateFairOdds,
  calculateSingleBetEV,
  calculateKellyFraction,
} from '../math_models/single_bet_ev';

export function toDecimalOdds(odds: number, format: OddsFormat): number {
  return format === 'decimal' ? odds : americanToDecimal(odds);
}

export function toAmericanOdds(odds: number, format: OddsFormat): number {
  return format === 'american' ? odds : decimalToAmerican(odds);
}

export function evaluateSingleBetEV(input: SingleBetInput): SingleBetEVResult {
  const decimalOdds = toDecimalOdds(input.odds, input.oddsFormat);

  const impliedWinProb = calculateImpliedProbability(decimalOdds);
  const fairOddsDecimal = calculateFairOdds(input.trueWinProb);
  const fairOddsAmerican = decimalToAmerican(fairOddsDecimal);

  const evPerUnit = calculateSingleBetEV(input.trueWinProb, decimalOdds);
  const edgePct = evPerUnit * 100;

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

export function evaluateMultipleSingleBets(inputs: SingleBetInput[]): SingleBetEVResult[] {
  return inputs.map(evaluateSingleBetEV);
}

export function filterPositiveEV(results: SingleBetEVResult[]): SingleBetEVResult[] {
  return results.filter(result => result.evPerUnit > 0);
}

export function sortByEV(results: SingleBetEVResult[]): SingleBetEVResult[] {
  return [...results].sort((a, b) => b.evPerUnit - a.evPerUnit);
}

export function sortByKelly(results: SingleBetEVResult[]): SingleBetEVResult[] {
  return [...results].sort((a, b) => b.kellyFraction - a.kellyFraction);
}
