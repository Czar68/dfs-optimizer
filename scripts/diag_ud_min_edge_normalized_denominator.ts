/**
 * Phase AH — Compare `UD_MIN_EDGE` subset vs fair denominator (UD EV rows with factor >= 1).
 * Same merge/EV path as Phase AG. Read-only.
 *
 * Run:
 *   npx ts-node scripts/diag_ud_min_edge_normalized_denominator.ts --platform ud --sports NBA --bankroll 700
 */
import "../src/load_env";
import path from "path";
import { parseArgs, setCliArgsForProcess, handleCliArgsEarlyExit } from "../src/cli_args";
import { calculateEvForMergedPicks } from "../src/calculate_ev";
import { mergeOddsWithPropsWithMetadata } from "../src/merge_odds";
import { fetchUnderdogRawProps } from "../src/fetch_underdog_props";
import { loadUnderdogPropsFromFile } from "../src/load_underdog_props";
import { udLegFirstFailureCode, UD_FAIL_MIN_EDGE } from "../src/policy/runtime_decision_pipeline";
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

/** Matches first gate in `udLegFirstFailureCode`: factor < 1 fails before edge. */
function factorGte1(p: EvPick): boolean {
  const f = resolveUdFactor(p);
  return f === null || f >= 1.0;
}

function stdBoostOnly(p: EvPick): "standard" | "boosted" {
  const f = resolveUdFactor(p);
  return f !== null && f > 1.0 ? "boosted" : "standard";
}

function edgeSummary(rows: EvPick[]) {
  const n = rows.length;
  if (!n) return { n: 0, min: null, max: null, mean: null, median: null };
  const sorted = rows.map((p) => p.edge).sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mid = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    n,
    min: sorted[0],
    max: sorted[n - 1],
    mean: sum / n,
    median,
  };
}

function pctMap(counts: Record<string, number>, total: number): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    o[k] = total ? Math.round((10000 * v) / total) / 100 : 0;
  }
  return o;
}

function topN(counts: Record<string, number>, n: number) {
  const tot = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({
      key,
      count,
      pct: tot ? Math.round((10000 * count) / tot) / 100 : 0,
    }));
}

function collectCounts(rows: EvPick[], key: (p: EvPick) => string) {
  const c: Record<string, number> = {};
  for (const p of rows) {
    const k = key(p);
    c[k] = (c[k] ?? 0) + 1;
  }
  return c;
}

function ppDiff(a: number, b: number) {
  return Math.round((b - a) * 100) / 100;
}

async function main() {
  const sports = cli.sports;
  const rawProps = await fetchUnderdogRawPropsWithLogging(sports);
  const { odds: merged } = await mergeOddsWithPropsWithMetadata(rawProps, cli);
  const evPicks = calculateEvForMergedPicks(merged);
  const udAll = evPicks.filter((p) => p.site === "underdog");
  const fair = udAll.filter(factorGte1);
  const minEdge = udAll.filter((p) => udLegFirstFailureCode(p, cli) === UD_FAIL_MIN_EDGE);

  const fairStdBoost = summarizeDistribution(fair, stdBoostOnly);
  const meStdBoost = summarizeDistribution(minEdge, stdBoostOnly);
  const fairBooks = collectCounts(fair, (p) => p.book ?? "(null)");
  const meBooks = collectCounts(minEdge, (p) => p.book ?? "(null)");
  const fairStats = collectCounts(fair, (p) => String(p.stat));
  const meStats = collectCounts(minEdge, (p) => String(p.stat));

  const topBookFair = topN(fairBooks, 1)[0];
  const topBookMe = topN(meBooks, 1)[0];
  const topStatFair = topN(fairStats, 1)[0];
  const topStatMe = topN(meStats, 1)[0];

  const modelingUniq = (rows: EvPick[]) => ({
    modelingClass: [...new Set(rows.map((p) => p.modelingClass ?? "(null)"))],
    modelingReason: [...new Set(rows.map((p) => p.modelingReason ?? "(null)"))],
  });

  const normalizedSkews = {
    standard_pp: ppDiff(fairStdBoost.pct.standard ?? 0, meStdBoost.pct.standard ?? 0),
    boosted_pp: ppDiff(fairStdBoost.pct.boosted ?? 0, meStdBoost.pct.boosted ?? 0),
    topBookFanDuel_or_first: {
      fair: topBookFair,
      minEdge: topBookMe,
      pctPointDiff: topBookFair && topBookMe && topBookFair.key === topBookMe.key
        ? ppDiff(topBookFair.pct, topBookMe.pct)
        : null,
    },
    topStatPoints_or_first: {
      fair: topStatFair,
      minEdge: topStatMe,
      pctPointDiff:
        topStatFair && topStatMe && topStatFair.key === topStatMe.key
          ? ppDiff(topStatFair.pct, topStatMe.pct)
          : null,
    },
  };

  const out = {
    pipeline: {
      rawProps: rawProps.length,
      merged: merged.length,
      allUdEv: udAll.length,
      fairDenominatorFactorGte1: fair.length,
      udMinEdgeSubset: minEdge.length,
      sanity: { everyMinEdgeInFair: minEdge.every((p) => fair.includes(p)) },
    },
    allUdEv_count: udAll.length,
    fairDenominator: {
      count: fair.length,
      stdVsBoosted: { counts: fairStdBoost.counts, pct: fairStdBoost.pct },
      bookTop5: topN(fairBooks, 5),
      statTop5: topN(fairStats, 5),
      edge: edgeSummary(fair),
      modeling: modelingUniq(fair),
    },
    udMinEdgeSubset: {
      count: minEdge.length,
      stdVsBoosted: { counts: meStdBoost.counts, pct: meStdBoost.pct },
      bookTop5: topN(meBooks, 5),
      statTop5: topN(meStats, 5),
      edge: edgeSummary(minEdge),
      modeling: modelingUniq(minEdge),
    },
    normalizedSkews_ppVersusFairDenominator: normalizedSkews,
    note:
      "MIN_EDGE rows are subset of fair denominator by construction (edge fails after factor gate). Compare std/boost, book, stat Deltas for residual skew.",
  };

  console.log(JSON.stringify(out, null, 2));
}

function summarizeDistribution(rows: EvPick[], keyFn: (p: EvPick) => string) {
  const n = rows.length;
  const counts: Record<string, number> = {};
  for (const p of rows) {
    const k = keyFn(p);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { counts, pct: pctMap(counts, n) };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
