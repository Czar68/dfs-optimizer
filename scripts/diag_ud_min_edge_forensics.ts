/**
 * Phase AF — Read-only forensics for `UD_MIN_EDGE` rejects (distribution + slices).
 * Same merge/EV path as `diag_ud_filter_failure_attribution.ts`.
 *
 * Run:
 *   npx ts-node scripts/diag_ud_min_edge_forensics.ts --platform ud --sports NBA --bankroll 700
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
} from "../src/policy/runtime_decision_pipeline";
import { computeUdRunnerLegEligibility } from "../src/policy/eligibility_policy";
import { resolveUdFactor } from "../src/policy/ud_pick_factor";
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

function bucketDelta(edge: number, udMinEdge: number): string {
  const d = edge - udMinEdge;
  if (d > -0.001) return "within_0_001_below_floor";
  if (d > -0.003) return "from_0_001_to_0_003_below";
  if (d > -0.01) return "from_0_003_to_0_01_below";
  return "gt_0_01_below";
}

function udBoostLabel(p: EvPick): "standard" | "boosted" | "discounted" {
  const f = resolveUdFactor(p);
  if (f !== null && f < 1.0) return "discounted";
  if (f !== null && f > 1.0) return "boosted";
  return "standard";
}

async function main() {
  const sports = cli.sports;
  const rawProps = await fetchUnderdogRawPropsWithLogging(sports);
  const { odds: merged } = await mergeOddsWithPropsWithMetadata(rawProps, cli);
  const evPicks = calculateEvForMergedPicks(merged);
  const udOnly = evPicks.filter((p) => p.site === "underdog");
  const policy = computeUdRunnerLegEligibility(cli);
  const udMinEdge = policy.udMinEdge;

  const minEdgeRows: EvPick[] = [];
  for (const p of udOnly) {
    if (udLegFirstFailureCode(p, cli) === UD_FAIL_MIN_EDGE) minEdgeRows.push(p);
  }

  const buckets: Record<string, number> = {
    within_0_001_below_floor: 0,
    from_0_001_to_0_003_below: 0,
    from_0_003_to_0_01_below: 0,
    gt_0_01_below: 0,
  };

  const stdBoost = { standard: 0, boosted: 0, discounted: 0 };
  const statCounts: Record<string, number> = {};
  const bookCounts: Record<string, number> = {};
  const nonStd = { yes: 0, no: 0 };

  let minEdge = Infinity;
  let maxEdge = -Infinity;
  let sumEdge = 0;

  for (const p of minEdgeRows) {
    const d = p.edge - udMinEdge;
    buckets[bucketDelta(p.edge, udMinEdge)]++;
    stdBoost[udBoostLabel(p)]++;
    const st = String(p.stat);
    statCounts[st] = (statCounts[st] ?? 0) + 1;
    const bk = p.book ?? "(null)";
    bookCounts[bk] = (bookCounts[bk] ?? 0) + 1;
    if (p.isNonStandardOdds) nonStd.yes++;
    else nonStd.no++;
    minEdge = Math.min(minEdge, p.edge);
    maxEdge = Math.max(maxEdge, p.edge);
    sumEdge += p.edge;
  }

  const topStats = Object.entries(statCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const topBooks = Object.entries(bookCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const out = {
    udMinEdge,
    udMinEdgePct: (udMinEdge * 100).toFixed(2),
    udMinEdgeRejectCount: minEdgeRows.length,
    evUdCount: udOnly.length,
    edgeMinusUdMinEdgeDelta: {
      min: minEdgeRows.length ? minEdge - udMinEdge : null,
      max: minEdgeRows.length ? maxEdge - udMinEdge : null,
      mean: minEdgeRows.length ? (sumEdge / minEdgeRows.length - udMinEdge) : null,
    },
    rawEdgeRange: minEdgeRows.length ? { min: minEdge, max: maxEdge } : null,
    bucketByEdgeMinusFloor: buckets,
    standardVsBoostedVsDiscounted: stdBoost,
    nonStandardOddsFlag: nonStd,
    topStats,
    topBooks,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
