// src/kelly_staking.ts

import { Sport } from './types';

export const SPORT_KELLY_FRACTIONS: Record<Sport, number> = {
  NBA: 0.25,
  NHL: 0.20,
  NCAAB: 0.15,
  NFL: 0.30,
  MLB: 0.22,
  NCAAF: 0.18,
};

/** 1.5x conservative divisor: effective stake = full Kelly / 1.5 */
export const CONSERVATIVE_KELLY_DIVISOR = 1.5;

/** Hard dollar cap per card — prevents any single card from exceeding this */
export const MAX_STAKE_PER_CARD = 25.0;

/** Max fraction of bankroll on any single card (3.5%) */
export const MAX_BANKROLL_PCT_PER_CARD = 0.035;

/** Minimum stake floor */
export const MIN_STAKE = 1.0;

/**
 * Calculate Kelly stake for a given card EV and sport (1.5x conservative).
 *
 * Pipeline: bankroll × sportFrac × cardEv → /1.5 → clamp(min, min(maxDollar, bankroll×3.5%))
 */
export function calculateKellyStake(cardEv: number, bankroll = 600, sport: Sport): number {
  const frac = SPORT_KELLY_FRACTIONS[sport];
  const fullKellyStake = bankroll * frac * cardEv;
  const conservativeStake = fullKellyStake / CONSERVATIVE_KELLY_DIVISOR;
  const maxForBankroll = bankroll * MAX_BANKROLL_PCT_PER_CARD;
  const capped = Math.min(conservativeStake, MAX_STAKE_PER_CARD, maxForBankroll);
  return Math.max(MIN_STAKE, Math.round(capped * 100) / 100);
}

export function getKellyFraction(sport: Sport): number {
  return SPORT_KELLY_FRACTIONS[sport];
}
