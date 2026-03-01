// src/scripts/report_single_bet_ev.ts
// Generate +EV singles report from odds feed

import { 
  buildSingleBetInputsFromOddsFeed, 
  createTestMarkets,
  OddsFeedMarket,
  buildOddsFeedMarketsFromExistingData
} from '../build_single_bet_inputs';
import { evaluateSingleBetEV, SingleBetEVResult } from '../sportsbook_single_ev';
import { fetchSgoPlayerPropOdds } from '../fetch_sgo_odds';

interface ReportRow {
  sport: string;
  book: string;
  marketId: string;
  side: string;
  odds: string;
  edge: string;
  kelly: string;
  ev: string;
  trueProb: string;
  impliedProb: string;
}

function formatOdds(odds: number, format: 'american' | 'decimal'): string {
  if (format === 'american') {
    return odds >= 0 ? `+${odds}` : `${odds}`;
  } else {
    return odds.toFixed(2);
  }
}

function formatPercentage(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function formatProbability(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}

function formatEV(ev: number): string {
  return `${ev >= 0 ? '+' : ''}${ev.toFixed(3)}`;
}

function generateReportTable(results: SingleBetEVResult[]): string {
  if (results.length === 0) {
    return "No +EV bets found.";
  }

  const header = "SPORT  BOOK  MARKET_ID           SIDE   ODDS   EDGE%   KELLY   EV     TRUE   IMPLIED";
  const separator = "-----  ----  -------------------  -----  -----  ------  ------  -----  -----  -------";
  
  const rows = results.map(result => {
    const row: ReportRow = {
      sport: result.sport.padEnd(5),
      book: result.book.padEnd(4),
      marketId: (result.marketId.length > 19 ? result.marketId.substring(0, 16) + '...' : result.marketId).padEnd(19),
      side: result.side.padEnd(5),
      odds: formatOdds(result.odds, result.oddsFormat).padEnd(5),
      edge: formatPercentage(result.edgePct).padEnd(6),
      kelly: formatPercentage(result.kellyFraction * 100).padEnd(6),
      ev: formatEV(result.evPerUnit).padEnd(5),
      trueProb: formatProbability(result.trueWinProb).padEnd(5),
      impliedProb: formatProbability(result.impliedWinProb).padEnd(7),
    };
    
    return `${row.sport}  ${row.book}  ${row.marketId}  ${row.side}  ${row.odds}  ${row.edge}  ${row.kelly}  ${row.ev}  ${row.trueProb}  ${row.impliedProb}`;
  });

  return [header, separator, ...rows].join('\n');
}

async function generateTestReport(): Promise<void> {
  console.log("=== +EV Singles Report (Test Data) ===");
  console.log();

  // Create test markets
  const testMarkets = createTestMarkets();
  console.log(`Generated ${testMarkets.length} test markets`);

  // Convert to SingleBetInput
  const singleBetInputs = buildSingleBetInputsFromOddsFeed(testMarkets);
  console.log(`Converted to ${singleBetInputs.length} valid single bet inputs`);

  // Evaluate EV for each
  const evResults = singleBetInputs.map(input => evaluateSingleBetEV(input));
  console.log(`Evaluated EV for ${evResults.length} bets`);

  // Filter to +EV bets only
  const positiveEVResults = evResults.filter(result => result.evPerUnit > 0);
  console.log(`Found ${positiveEVResults.length} +EV bets`);

  // Sort by edge percentage descending
  positiveEVResults.sort((a, b) => b.edgePct - a.edgePct);

  console.log();
  console.log(generateReportTable(positiveEVResults));
  console.log();

  // Show summary statistics
  if (positiveEVResults.length > 0) {
    const totalKelly = positiveEVResults.reduce((sum, result) => sum + result.kellyFraction, 0);
    const avgEdge = positiveEVResults.reduce((sum, result) => sum + result.edgePct, 0) / positiveEVResults.length;
    const maxEdge = Math.max(...positiveEVResults.map(result => result.edgePct));
    
    console.log("Summary:");
    console.log(`  Total +EV bets: ${positiveEVResults.length}`);
    console.log(`  Average edge: ${formatPercentage(avgEdge)}`);
    console.log(`  Max edge: ${formatPercentage(maxEdge)}`);
    console.log(`  Total Kelly allocation: ${formatPercentage(totalKelly * 100)}`);
  }
}

async function generateLiveReport(): Promise<void> {
  console.log("=== +EV Singles Report (Live SGO Data) ===");
  console.log();

  try {
    // Fetch live SGO markets
    const sgoMarkets = await fetchSgoPlayerPropOdds();
    console.log(`Fetched ${sgoMarkets.length} SGO markets`);

    // Convert to odds feed markets
    const oddsFeedMarkets = buildOddsFeedMarketsFromExistingData(sgoMarkets);
    console.log(`Converted to ${oddsFeedMarkets.length} odds feed markets`);

    // Convert to SingleBetInput
    const singleBetInputs = buildSingleBetInputsFromOddsFeed(oddsFeedMarkets);
    console.log(`Converted to ${singleBetInputs.length} valid single bet inputs`);

    // Evaluate EV for each
    const evResults = singleBetInputs.map(input => evaluateSingleBetEV(input));
    console.log(`Evaluated EV for ${evResults.length} bets`);

    // Filter to +EV bets only
    const positiveEVResults = evResults.filter(result => result.evPerUnit > 0);
    console.log(`Found ${positiveEVResults.length} +EV bets`);

    // Sort by edge percentage descending
    positiveEVResults.sort((a, b) => b.edgePct - a.edgePct);

    console.log();
    console.log(generateReportTable(positiveEVResults));
    console.log();

    // Show summary statistics
    if (positiveEVResults.length > 0) {
      const totalKelly = positiveEVResults.reduce((sum, result) => sum + result.kellyFraction, 0);
      const avgEdge = positiveEVResults.reduce((sum, result) => sum + result.edgePct, 0) / positiveEVResults.length;
      const maxEdge = Math.max(...positiveEVResults.map(result => result.edgePct));
      
      console.log("Summary:");
      console.log(`  Total +EV bets: ${positiveEVResults.length}`);
      console.log(`  Average edge: ${formatPercentage(avgEdge)}`);
      console.log(`  Max edge: ${formatPercentage(maxEdge)}`);
      console.log(`  Total Kelly allocation: ${formatPercentage(totalKelly * 100)}`);
    }

  } catch (error) {
    console.error("Error generating live report:", error);
    console.log("Falling back to test data...");
    await generateTestReport();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useLive = args.includes('--live') || args.includes('-l');

  if (useLive) {
    await generateLiveReport();
  } else {
    await generateTestReport();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
