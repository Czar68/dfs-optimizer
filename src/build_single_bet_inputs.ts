// src/build_single_bet_inputs.ts
// Bridge between existing odds feeds and sportsbook single-bet EV module

import { SingleBetInput, OddsFormat } from './sportsbook_single_ev';
import { Sport } from './types';
import { PlayerPropOdds } from './types';
import { americanToProb, devigTwoWay } from './odds_math';

export interface OddsFeedMarket {
  sport: Sport;
  marketId: string;
  book: string;
  side: string;          // 'over', 'under', 'home', 'away', etc.
  odds: number;          // American or decimal
  oddsFormat: OddsFormat;
  trueWinProb: number;   // 0–1, from my model or no-vig calculation
}

export function buildSingleBetInputsFromOddsFeed(
  markets: OddsFeedMarket[]
): SingleBetInput[] {
  return markets
    .filter(market => {
      // Filter out invalid markets
      const hasValidProb = market.trueWinProb > 0 && market.trueWinProb < 1;
      const hasValidOdds = Number.isFinite(market.odds) && market.odds !== 0;
      return hasValidProb && hasValidOdds;
    })
    .map(market => ({
      sport: market.sport,
      marketId: market.marketId,
      book: market.book,
      side: market.side,
      odds: market.odds,
      oddsFormat: market.oddsFormat,
      trueWinProb: market.trueWinProb,
    }));
}

export function buildOddsFeedMarketsFromExistingData(
  oddsMarkets: PlayerPropOdds[]
): OddsFeedMarket[] {
  const markets: OddsFeedMarket[] = [];

  for (const market of oddsMarkets) {
    // Skip markets without valid odds
    if (!Number.isFinite(market.overOdds) || !Number.isFinite(market.underOdds)) {
      continue;
    }

    // Skip extreme juice markets
    if (Math.abs(market.overOdds) > 250 || Math.abs(market.underOdds) > 250) {
      continue;
    }

    // Calculate true probabilities using devigging
    const overProbVigged = americanToProb(market.overOdds);
    const underProbVigged = americanToProb(market.underOdds);
    const [trueOverProb, trueUnderProb] = devigTwoWay(overProbVigged, underProbVigged);

    // Create over market
    markets.push({
      sport: market.sport,
      marketId: `${market.marketId || 'unknown'}_${market.stat}_over`,
      book: market.book,
      side: 'over',
      odds: market.overOdds,
      oddsFormat: 'american',
      trueWinProb: trueOverProb,
    });

    // Create under market
    markets.push({
      sport: market.sport,
      marketId: `${market.marketId || 'unknown'}_${market.stat}_under`,
      book: market.book,
      side: 'under',
      odds: market.underOdds,
      oddsFormat: 'american',
      trueWinProb: trueUnderProb,
    });
  }

  return markets;
}

// Helper function to create test markets for development
export function createTestMarkets(): OddsFeedMarket[] {
  return [
    {
      sport: 'NBA',
      marketId: 'curry_pts_28_5',
      book: 'DK',
      side: 'over',
      odds: -115,
      oddsFormat: 'american',
      trueWinProb: 0.542, // 54.2% true probability
    },
    {
      sport: 'NBA',
      marketId: 'curry_pts_28_5',
      book: 'DK',
      side: 'under',
      odds: -105,
      oddsFormat: 'american',
      trueWinProb: 0.458, // 45.8% true probability
    },
    {
      sport: 'NBA',
      marketId: 'jokic_reb_12_5',
      book: 'FD',
      side: 'over',
      odds: +105,
      oddsFormat: 'american',
      trueWinProb: 0.531, // 53.1% true probability
    },
    {
      sport: 'NBA',
      marketId: 'jokic_reb_12_5',
      book: 'FD',
      side: 'under',
      odds: -125,
      oddsFormat: 'american',
      trueWinProb: 0.469, // 46.9% true probability
    },
    {
      sport: 'NFL',
      marketId: 'mahomes_pass_yds_280_5',
      book: 'DK',
      side: 'over',
      odds: -110,
      oddsFormat: 'american',
      trueWinProb: 0.485, // 48.5% true probability (negative EV)
    },
    {
      sport: 'NFL',
      marketId: 'mahomes_pass_yds_280_5',
      book: 'FD',
      side: 'over',
      odds: +120,
      oddsFormat: 'american',
      trueWinProb: 0.520, // 52.0% true probability
    },
    {
      sport: 'MLB',
      marketId: 'judge_hr_1_5',
      book: 'MG',
      side: 'over',
      odds: 2.50,
      oddsFormat: 'decimal',
      trueWinProb: 0.420, // 42.0% true probability
    },
    {
      sport: 'MLB',
      marketId: 'judge_hr_1_5',
      book: 'MG',
      side: 'under',
      odds: 1.67,
      oddsFormat: 'decimal',
      trueWinProb: 0.580, // 58.0% true probability
    },
  ];
}
