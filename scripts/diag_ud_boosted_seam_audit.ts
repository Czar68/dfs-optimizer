/**
 * Phase AI — Boosted seam: first-fail attribution (shared min-edge vs trueProb floor vs boosted adj).
 * Fair denominator = factor >= 1. Read-only.
 *
 * Run:
 *   npx ts-node scripts/diag_ud_boosted_seam_audit.ts --platform ud --sports NBA --bankroll 700
 */
import "../src/load_env";
import path from "path";
import { parseArgs, setCliArgsForProcess, handleCliArgsEarlyExit } from "../src/cli_args";
import { calculateEvForMergedPicks } from "../src/calculate_ev";
import { mergeOddsWithPropsWithMetadata } from "../src/merge_odds";
import { fetchUnderdogRawProps } from "../src/fetch_underdog_props";
import { loadUnderdogPropsFromFile } from "../src/load_underdog_props";
import {
  udLegFirstFailureCode,
  UD_FAIL_MIN_EDGE,
  UD_FAIL_SHARED_MIN_EDGE,
  UD_FAIL_BOOSTED_ADJ_EV,
  UD_PASS,
} from "../src/policy/runtime_decision_pipeline";
import { computeUdRunnerLegEligibility, computeUdFilterBoostedFloors } from "../src/policy/eligibility_policy";
import { resolveUdFactor, udAdjustedLegEv } from "../src/policy/ud_pick_factor";
import type { EvPick, RawPick, Sport } from "../src/types";

const cli = parseArgs(process.argv.slice(2));
handleCliArgsEarlyExit(cli);
setCliArgsForProcess(cli);

async function fetchUnderdogRawPropsWithLogging(sports: Sport[]): Promise<RawPick[]> {
  const scrapedFilePath = path.join(process.cwd(), "underdog_props_scraped.json");
  const manualFilePath = path.join(process.cwd(), "underdog_manual_props.json");
  const scrapedProps = await loadUnderdogPropsFromFile(scrapedFilePath, "scraped");
  if (scrapedProps.length > 0) return scrapedProps;
  try {
    const apiProps = await fetchUnderdogRawProps(sports);
    if (apiProps.length > 0) return apiProps;
  } catch {
    /* fall through */
  }
  const manualProps = await loadUnderdogPropsFromFile(manualFilePath, "manual");
  return manualProps.length > 0 ? manualProps : [];
}

function factorGte1(p: EvPick): boolean {
  const f = resolveUdFactor(p);
  return f === null || f >= 1.0;
}

function isBoosted(p: EvPick): boolean {
  const f = resolveUdFactor(p);
  return f !== null && f > 1.0;
}

function pct(n: number, d: number): number {
  return d ? Math.round((10000 * n) / d) / 100 : 0;
}

async function main() {
  const sports = cli.sports;
  const rawProps = await fetchUnderdogRawPropsWithLogging(sports);
  const { odds: merged } = await mergeOddsWithPropsWithMetadata(rawProps, cli);
  const evPicks = calculateEvForMergedPicks(merged);
  const udAll = evPicks.filter((p) => p.site === "underdog");
  const fair = udAll.filter(factorGte1);
  const policy = computeUdRunnerLegEligibility(cli);
  const boostedFloor = computeUdFilterBoostedFloors(policy.udVolume).boostedAdjLegEvFloor;

  const fairBoosted = fair.filter(isBoosted);
  const allTrueProbFloor = udAll.filter((p) => udLegFirstFailureCode(p, cli) === UD_FAIL_MIN_EDGE);
  const allSharedMinEdge = udAll.filter((p) => udLegFirstFailureCode(p, cli) === UD_FAIL_SHARED_MIN_EDGE);

  let boostedPass = 0;
  let boostedFailTrueProbFloor = 0;
  let boostedFailSharedMinEdge = 0;
  let boostedFailBoostedAdj = 0;

  /** Boosted legs whose first failure is trueProb floor but adjEv >= boosted floor (hypothetical if earlier gates ignored). */
  let seamTrueProbFloorCount = 0;
  /** Boosted legs whose first failure is shared min-edge but adjEv >= boosted floor. */
  let seamSharedMinEdgeCount = 0;

  for (const p of fairBoosted) {
    const code = udLegFirstFailureCode(p, cli);
    if (code === UD_PASS) boostedPass++;
    else if (code === UD_FAIL_MIN_EDGE) {
      boostedFailTrueProbFloor++;
      if (udAdjustedLegEv(p) >= boostedFloor) seamTrueProbFloorCount++;
    } else if (code === UD_FAIL_SHARED_MIN_EDGE) {
      boostedFailSharedMinEdge++;
      if (udAdjustedLegEv(p) >= boostedFloor) seamSharedMinEdgeCount++;
    } else if (code === UD_FAIL_BOOSTED_ADJ_EV) boostedFailBoostedAdj++;
  }

  const out = {
    pipeline: { evUd: udAll.length, fairFactorGte1: fair.length, fairBoosted: fairBoosted.length },
    policyContext: {
      udMinEdge: policy.udMinEdge,
      udVolume: policy.udVolume,
      boostedAdjLegEvFloor: boostedFloor,
    },
    fairBoosted_firstFailure: {
      UD_PASS: boostedPass,
      UD_FAIL_SHARED_MIN_EDGE: boostedFailSharedMinEdge,
      UD_FAIL_MIN_EDGE: boostedFailTrueProbFloor,
      UD_FAIL_BOOSTED_ADJ_EV: boostedFailBoostedAdj,
      pctOfFairBoosted: {
        UD_PASS: pct(boostedPass, fairBoosted.length),
        UD_FAIL_SHARED_MIN_EDGE: pct(boostedFailSharedMinEdge, fairBoosted.length),
        UD_FAIL_MIN_EDGE: pct(boostedFailTrueProbFloor, fairBoosted.length),
        UD_FAIL_BOOSTED_ADJ_EV: pct(boostedFailBoostedAdj, fairBoosted.length),
      },
    },
    boostedSeam: {
      trueProbFloor: {
        count: seamTrueProbFloorCount,
        definition:
          "boosted + firstFail UD_FAIL_MIN_EDGE (trueProb floor) + udAdjustedLegEv >= boostedAdjLegEvFloor",
        pctOfFairDenominator: pct(seamTrueProbFloorCount, fair.length),
        pctOfFairBoosted: pct(seamTrueProbFloorCount, fairBoosted.length),
        pctOfAllUdTrueProbFloorBucket: pct(seamTrueProbFloorCount, allTrueProbFloor.length),
      },
      sharedMinEdge: {
        count: seamSharedMinEdgeCount,
        definition:
          "boosted + firstFail UD_FAIL_SHARED_MIN_EDGE (leg.edge < udMinEdge) + udAdjustedLegEv >= boostedAdjLegEvFloor",
        pctOfFairDenominator: pct(seamSharedMinEdgeCount, fair.length),
        pctOfFairBoosted: pct(seamSharedMinEdgeCount, fairBoosted.length),
        pctOfAllUdSharedMinEdgeBucket: pct(seamSharedMinEdgeCount, allSharedMinEdge.length),
      },
    },
    allUdTrueProbFloorCount: allTrueProbFloor.length,
    allUdSharedMinEdgeCount: allSharedMinEdge.length,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
