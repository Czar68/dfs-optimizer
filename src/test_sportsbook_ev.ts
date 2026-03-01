// src/test_sportsbook_ev.ts
// Test the sportsbook single-bet EV module

import { 
  evaluateSingleBetEV, 
  SingleBetInput, 
  americanToDecimal, 
  decimalToAmerican,
  calculateImpliedProbability,
  calculateFairOdds,
  Sport 
} from "./sportsbook_single_ev";

function testOddsConversions() {
  console.log("=== Testing Odds Conversions ===");
  
  // Test American to Decimal
  console.log("+110 American →", americanToDecimal(110), "Decimal");
  console.log("-110 American →", americanToDecimal(-110), "Decimal");
  console.log("+200 American →", americanToDecimal(200), "Decimal");
  console.log("-150 American →", americanToDecimal(-150), "Decimal");
  
  // Test Decimal to American
  console.log("2.10 Decimal →", decimalToAmerican(2.10), "American");
  console.log("1.91 Decimal →", decimalToAmerican(1.91), "American");
  console.log("3.00 Decimal →", decimalToAmerican(3.00), "American");
  console.log("1.67 Decimal →", decimalToAmerican(1.67), "American");
  
  console.log();
}

function testProbabilityCalculations() {
  console.log("=== Testing Probability Calculations ===");
  
  // Test implied probability from odds
  console.log("Implied prob from 2.10 decimal:", calculateImpliedProbability(2.10));
  console.log("Implied prob from 1.91 decimal:", calculateImpliedProbability(1.91));
  console.log("Implied prob from 3.00 decimal:", calculateImpliedProbability(3.00));
  
  // Test fair odds from probability
  console.log("Fair odds from 0.5 probability:", calculateFairOdds(0.5));
  console.log("Fair odds from 0.6 probability:", calculateFairOdds(0.6));
  console.log("Fair odds from 0.4 probability:", calculateFairOdds(0.4));
  
  console.log();
}

function testSingleBetEV() {
  console.log("=== Testing Single Bet EV Calculations ===");
  
  const testCases: SingleBetInput[] = [
    {
      sport: "NBA",
      marketId: "test-1",
      book: "DK",
      side: "over",
      odds: -110,
      oddsFormat: "american",
      trueWinProb: 0.55, // 55% true win probability
    },
    {
      sport: "NBA", 
      marketId: "test-2",
      book: "FD",
      side: "under",
      odds: +120,
      oddsFormat: "american", 
      trueWinProb: 0.45, // 45% true win probability
    },
    {
      sport: "NFL",
      marketId: "test-3",
      book: "DK",
      side: "over",
      odds: 2.50,
      oddsFormat: "decimal",
      trueWinProb: 0.42, // 42% true win probability
    },
    {
      sport: "MLB",
      marketId: "test-4", 
      book: "MG",
      side: "under",
      odds: 1.80,
      oddsFormat: "decimal",
      trueWinProb: 0.58, // 58% true win probability
    },
  ];
  
  testCases.forEach((testCase, index) => {
    const result = evaluateSingleBetEV(testCase);
    console.log(`\nTest Case ${index + 1}:`);
    console.log(`  Sport: ${result.sport}`);
    console.log(`  Book: ${result.book} | Side: ${result.side}`);
    console.log(`  Book Odds: ${testCase.odds} (${testCase.oddsFormat})`);
    console.log(`  True Win Prob: ${(result.trueWinProb * 100).toFixed(1)}%`);
    console.log(`  Implied Win Prob: ${(result.impliedWinProb * 100).toFixed(1)}%`);
    console.log(`  Fair Odds: ${result.fairOddsAmerican} (${result.fairOddsDecimal.toFixed(2)})`);
    console.log(`  Edge: ${result.edgePct.toFixed(2)}%`);
    console.log(`  EV per unit: ${result.evPerUnit.toFixed(3)}`);
    console.log(`  Kelly Fraction: ${(result.kellyFraction * 100).toFixed(2)}%`);
  });
  
  console.log();
}

function testEdgeCases() {
  console.log("=== Testing Edge Cases ===");
  
  // Test zero EV case
  const zeroEVCase: SingleBetInput = {
    sport: "NBA",
    marketId: "zero-ev",
    book: "DK", 
    side: "over",
    odds: -110,
    oddsFormat: "american",
    trueWinProb: 0.5, // Exactly 50% should be zero EV at -110
  };
  
  const zeroEVResult = evaluateSingleBetEV(zeroEVCase);
  console.log("Zero EV Case (50% prob at -110):");
  console.log(`  EV per unit: ${zeroEVResult.evPerUnit.toFixed(4)}`);
  console.log(`  Kelly Fraction: ${zeroEVResult.kellyFraction}`);
  
  // Test negative EV case
  const negativeEVCase: SingleBetInput = {
    sport: "NBA",
    marketId: "negative-ev",
    book: "DK",
    side: "over", 
    odds: -110,
    oddsFormat: "american",
    trueWinProb: 0.45, // Below 50% should be negative EV
  };
  
  const negativeEVResult = evaluateSingleBetEV(negativeEVCase);
  console.log("\nNegative EV Case (45% prob at -110):");
  console.log(`  EV per unit: ${negativeEVResult.evPerUnit.toFixed(4)}`);
  console.log(`  Kelly Fraction: ${negativeEVResult.kellyFraction}`);
  
  console.log();
}

async function main() {
  console.log("Sportsbook Single-Bet EV Module Test");
  console.log("=====================================");
  
  testOddsConversions();
  testProbabilityCalculations();
  testSingleBetEV();
  testEdgeCases();
  
  console.log("✅ All tests completed successfully!");
}

if (require.main === module) {
  main().catch(console.error);
}
