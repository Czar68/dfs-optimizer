// Quick Phase 8 verification — run with: npx ts-node src/validation/phase8_verify.ts

import { trueBeFromOdds, fairBeFromTwoWayOdds, juiceAwareLegEv, structureBreakeven } from "../ev/juice_adjust";
import { getOppAdjustment, applyOppAdjust } from "../matchups/opp_adjust";
import { getCorrelationAdjustment } from "../stats/correlation_matrix";
import { EvPick } from "../types";

let pass = 0;
let fail = 0;

function assert(label: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
    console.log(`  PASS: ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL: ${label}${detail ? ` (${detail})` : ""}`);
  }
}

function approx(a: number, b: number, tol = 0.005): boolean {
  return Math.abs(a - b) < tol;
}

console.log("\n=== Phase 8 Verification ===\n");

// 1. Juice awareness
console.log("--- Tweak 1: Juice Awareness ---");
const be110 = trueBeFromOdds(-110);
assert("-110 BE ~52.38%", approx(be110, 0.5238), `${(be110 * 100).toFixed(2)}%`);

const be150 = trueBeFromOdds(150);
assert("+150 BE ~40.0%", approx(be150, 0.40), `${(be150 * 100).toFixed(2)}%`);

const fairBE = fairBeFromTwoWayOdds(-110, -110);
assert("-110/-110 fair BE = 50%", approx(fairBE, 0.50), `${(fairBE * 100).toFixed(2)}%`);

const fairBE2 = fairBeFromTwoWayOdds(-120, +100);
assert("-120/+100 fair BE ~52.2% (de-vigged)", approx(fairBE2, 0.5217, 0.01), `${(fairBE2 * 100).toFixed(2)}%`);

const juiceEv = juiceAwareLegEv(0.55, -110, -110, "over");
assert("55% prob at -110/-110: edge=+5%", approx(juiceEv, 0.05), `${(juiceEv * 100).toFixed(2)}%`);

const noOddsEv = juiceAwareLegEv(0.55, null, null);
assert("55% prob no odds: edge=+5% (fallback)", approx(noOddsEv, 0.05), `${(noOddsEv * 100).toFixed(2)}%`);

const viggyEv = juiceAwareLegEv(0.55, -130, +100, "over");
assert("55% at -130/+100: edge < 5% (fair over > 0.5)", viggyEv < 0.05, `${(viggyEv * 100).toFixed(2)}%`);

const underSym = juiceAwareLegEv(0.55, -110, -110, "under");
assert("55% under at -110/-110: edge=+5%", approx(underSym, 0.05), `${(underSym * 100).toFixed(2)}%`);

// Structure breakevens
console.log("\n--- Structure Breakevens ---");
const pp4p = structureBreakeven("PP", "4P");
assert("PP 4P BE = 56.23%", approx(pp4p, 0.5623), `${(pp4p * 100).toFixed(2)}%`);

const pp3f = structureBreakeven("PP", "3F");
assert("PP 3F BE = 59.80%", approx(pp3f, 0.598), `${(pp3f * 100).toFixed(2)}%`);

const ud2s = structureBreakeven("UD", "2P");
assert("UD 2S BE = 53.45%", approx(ud2s, 0.5345), `${(ud2s * 100).toFixed(2)}%`);

// 2. Opponent adjustment
console.log("\n--- Tweak 2: Opponent Adjustment ---");
const wizAdj = getOppAdjustment("WAS", "points");
assert("WAS pts: high rank (bad D)", wizAdj != null && wizAdj.defRank >= 25, `rank=${wizAdj?.defRank}`);
assert("WAS pts: positive shift", wizAdj != null && wizAdj.shift > 0, `shift=${wizAdj?.shift?.toFixed(3)}`);

const okcAdj = getOppAdjustment("OKC", "points");
assert("OKC pts: rank 1 (best D)", okcAdj != null && okcAdj.defRank === 1, `rank=${okcAdj?.defRank}`);
assert("OKC pts: negative shift", okcAdj != null && okcAdj.shift < 0, `shift=${okcAdj?.shift?.toFixed(3)}`);

const nullAdj = getOppAdjustment(null, "points");
assert("null opponent: no adjustment", nullAdj === null);

const aliasAdj = getOppAdjustment("GS", "ast");
assert("GS alias -> GSW works", aliasAdj != null, `rank=${aliasAdj?.defRank}`);

const applyResult = applyOppAdjust(0.55, "WAS", "points");
assert("apply opp adjust: prob increases vs bad D", applyResult.adjProb > 0.55, `${(applyResult.adjProb * 100).toFixed(2)}%`);

// 3. Correlation adjustment
console.log("\n--- Tweak 3: Stat Correlation ---");
const ptsLeg = { player: "LeBron James", stat: "points", trueProb: 0.60, overOdds: -110, underOdds: -110 } as EvPick;
const rebLeg = { player: "LeBron James", stat: "rebounds", trueProb: 0.55, overOdds: -110, underOdds: -110 } as EvPick;
const astLeg = { player: "LeBron James", stat: "assists", trueProb: 0.50, overOdds: -110, underOdds: -110 } as EvPick;
const praLeg = { player: "LeBron James", stat: "pra", trueProb: 0.52, overOdds: -110, underOdds: -110 } as EvPick;

const corrAdj = getCorrelationAdjustment(praLeg, [ptsLeg, rebLeg, astLeg, praLeg]);
assert("PRA correlation found", corrAdj != null);
if (corrAdj) {
  assert("PRA component mean > combo prob", corrAdj.componentMean > corrAdj.comboProb, 
    `mean=${(corrAdj.componentMean*100).toFixed(1)}% vs combo=${(corrAdj.comboProb*100).toFixed(1)}%`);
  assert("PRA shift positive (boost)", corrAdj.shift > 0, `shift=${(corrAdj.shift*100).toFixed(2)}%`);
}

const noCorrLeg = { player: "LeBron James", stat: "points", trueProb: 0.55 } as EvPick;
const noCorrAdj = getCorrelationAdjustment(noCorrLeg, [noCorrLeg]);
assert("Non-combo stat: no adjustment", noCorrAdj === null);

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);

if (fail > 0) process.exit(1);
