/**
 * Phase AG — Compare full UD EV pool vs first-failure subsets: trueProb floor vs shared min-edge (read-only).
 * Same merge/EV path as `diag_ud_min_edge_forensics.ts`.
 *
 * Run:
 *   npx ts-node scripts/diag_ud_min_edge_population_compare.ts --platform ud --sports NBA --bankroll 700
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
} from "../src/policy/runtime_decision_pipeline";
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

function factorGroup(p: EvPick): "standard" | "boosted" | "discounted" {
  const f = resolveUdFactor(p);
  if (f !== null && f < 1.0) return "discounted";
  if (f !== null && f > 1.0) return "boosted";
  return "standard";
}

function summarizeDistribution<T extends string>(
  rows: EvPick[],
  keyFn: (p: EvPick) => T
): { counts: Record<string, number>; pct: Record<string, number> } {
  const n = rows.length;
  const counts: Record<string, number> = {};
  for (const p of rows) {
    const k = keyFn(p);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const pct: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    pct[k] = n ? Math.round((10000 * v) / n) / 100 : 0;
  }
  return { counts, pct };
}

function topEntries(
  counts: Record<string, number>,
  n: number
): { key: string; count: number; pct: number }[] {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({
      key,
      count,
      pct: total ? Math.round((10000 * count) / total) / 100 : 0,
    }));
}

function summarizePopulation(label: string, rows: EvPick[]) {
  const n = rows.length;
  const nonStd = rows.filter((p) => p.isNonStandardOdds).length;
  const stdNonStd = { yes: nonStd, no: n - nonStd };
  const stdNonStdPct = {
    yes: n ? Math.round((10000 * nonStd) / n) / 100 : 0,
    no: n ? Math.round((10000 * (n - nonStd)) / n) / 100 : 0,
  };
  const fg = summarizeDistribution(rows, factorGroup);
  const books = summarizeDistribution(rows, (p) => p.book ?? "(null)");
  const stats = summarizeDistribution(rows, (p) => String(p.stat));
  const mc: Record<string, number> = {};
  const mr: Record<string, number> = {};
  for (const p of rows) {
    const c = p.modelingClass ?? "(null)";
    const r = p.modelingReason ?? "(null)";
    mc[c] = (mc[c] ?? 0) + 1;
    mr[r] = (mr[r] ?? 0) + 1;
  }
  return {
    label,
    count: n,
    isNonStandardOdds: { ...stdNonStd, pct: stdNonStdPct },
    factorGroup: { counts: fg.counts, pct: fg.pct },
    bookTop: topEntries(books.counts, 6),
    statTop: topEntries(stats.counts, 8),
    modelingClassTop: topEntries(mc, 8),
    modelingReasonTop: topEntries(mr, 8),
  };
}

function skewDelta(
  fullPct: number,
  subPct: number
): { ppPoints: number; note: string } {
  const d = Math.round((subPct - fullPct) * 100) / 100;
  return {
    ppPoints: d,
    note: d === 0 ? "same" : d > 0 ? `subset +${d} pp vs full` : `subset ${d} pp vs full`,
  };
}

async function main() {
  const sports = cli.sports;
  const rawProps = await fetchUnderdogRawPropsWithLogging(sports);
  const { odds: merged } = await mergeOddsWithPropsWithMetadata(rawProps, cli);
  const evPicks = calculateEvForMergedPicks(merged);
  const udAll = evPicks.filter((p) => p.site === "underdog");
  const trueProbFloorRows = udAll.filter((p) => udLegFirstFailureCode(p, cli) === UD_FAIL_MIN_EDGE);
  const sharedMinEdgeRows = udAll.filter((p) => udLegFirstFailureCode(p, cli) === UD_FAIL_SHARED_MIN_EDGE);

  const fullSummary = summarizePopulation("full_ud_ev", udAll);
  const trueProbFloorSummary = summarizePopulation("ud_true_prob_floor_first_fail", trueProbFloorRows);
  const sharedMinEdgeSummary = summarizePopulation("ud_shared_min_edge_first_fail", sharedMinEdgeRows);

  const fullNs = fullSummary.isNonStandardOdds.pct.yes;
  const tpfNs = trueProbFloorSummary.isNonStandardOdds.pct.yes;
  const smeNs = sharedMinEdgeSummary.isNonStandardOdds.pct.yes;
  const skewsTrueProbFloor = {
    isNonStandardOdds_yes_pp: skewDelta(fullNs, tpfNs),
    factorGroup: {
      standard: skewDelta(fullSummary.factorGroup.pct.standard ?? 0, trueProbFloorSummary.factorGroup.pct.standard ?? 0),
      boosted: skewDelta(fullSummary.factorGroup.pct.boosted ?? 0, trueProbFloorSummary.factorGroup.pct.boosted ?? 0),
      discounted: skewDelta(
        fullSummary.factorGroup.pct.discounted ?? 0,
        trueProbFloorSummary.factorGroup.pct.discounted ?? 0
      ),
    },
  };
  const skewsSharedMinEdge = {
    isNonStandardOdds_yes_pp: skewDelta(fullNs, smeNs),
    factorGroup: {
      standard: skewDelta(fullSummary.factorGroup.pct.standard ?? 0, sharedMinEdgeSummary.factorGroup.pct.standard ?? 0),
      boosted: skewDelta(fullSummary.factorGroup.pct.boosted ?? 0, sharedMinEdgeSummary.factorGroup.pct.boosted ?? 0),
      discounted: skewDelta(
        fullSummary.factorGroup.pct.discounted ?? 0,
        sharedMinEdgeSummary.factorGroup.pct.discounted ?? 0
      ),
    },
  };

  const out = {
    pipeline: {
      rawProps: rawProps.length,
      merged: merged.length,
      evUd: udAll.length,
      udTrueProbFloorSubset: trueProbFloorRows.length,
      udSharedMinEdgeSubset: sharedMinEdgeRows.length,
    },
    fullSummary,
    trueProbFloorSummary,
    sharedMinEdgeSummary,
    skewVersusFull_trueProbFloor: skewsTrueProbFloor,
    skewVersusFull_sharedMinEdge: skewsSharedMinEdge,
    interpretationHint:
      "UD_FAIL_MIN_EDGE = trueProb floor; UD_FAIL_SHARED_MIN_EDGE = leg.edge < udMinEdge. Compare skews separately — they are different rejection modes.",
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
