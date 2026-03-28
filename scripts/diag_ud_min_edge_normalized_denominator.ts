/**
 * Phase AH — Compare first-failure subsets vs fair denominator (UD EV rows with factor >= 1):
 * `UD_FAIL_MIN_EDGE` (trueProb floor) vs `UD_FAIL_SHARED_MIN_EDGE` (leg.edge < udMinEdge).
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
  const trueProbFloor = udAll.filter((p) => udLegFirstFailureCode(p, cli) === UD_FAIL_MIN_EDGE);
  const sharedMinEdge = udAll.filter((p) => udLegFirstFailureCode(p, cli) === UD_FAIL_SHARED_MIN_EDGE);

  const fairStdBoost = summarizeDistribution(fair, stdBoostOnly);
  const tpfStdBoost = summarizeDistribution(trueProbFloor, stdBoostOnly);
  const smeStdBoost = summarizeDistribution(sharedMinEdge, stdBoostOnly);
  const fairBooks = collectCounts(fair, (p) => p.book ?? "(null)");
  const tpfBooks = collectCounts(trueProbFloor, (p) => p.book ?? "(null)");
  const smeBooks = collectCounts(sharedMinEdge, (p) => p.book ?? "(null)");
  const fairStats = collectCounts(fair, (p) => String(p.stat));
  const tpfStats = collectCounts(trueProbFloor, (p) => String(p.stat));
  const smeStats = collectCounts(sharedMinEdge, (p) => String(p.stat));

  const topBookFair = topN(fairBooks, 1)[0];
  const topBookTpf = topN(tpfBooks, 1)[0];
  const topBookSme = topN(smeBooks, 1)[0];
  const topStatFair = topN(fairStats, 1)[0];
  const topStatTpf = topN(tpfStats, 1)[0];
  const topStatSme = topN(smeStats, 1)[0];

  const modelingUniq = (rows: EvPick[]) => ({
    modelingClass: [...new Set(rows.map((p) => p.modelingClass ?? "(null)"))],
    modelingReason: [...new Set(rows.map((p) => p.modelingReason ?? "(null)"))],
  });

  const normalizedSkewsTrueProbFloor = {
    standard_pp: ppDiff(fairStdBoost.pct.standard ?? 0, tpfStdBoost.pct.standard ?? 0),
    boosted_pp: ppDiff(fairStdBoost.pct.boosted ?? 0, tpfStdBoost.pct.boosted ?? 0),
    topBookFanDuel_or_first: {
      fair: topBookFair,
      trueProbFloor: topBookTpf,
      pctPointDiff: topBookFair && topBookTpf && topBookFair.key === topBookTpf.key
        ? ppDiff(topBookFair.pct, topBookTpf.pct)
        : null,
    },
    topStatPoints_or_first: {
      fair: topStatFair,
      trueProbFloor: topStatTpf,
      pctPointDiff:
        topStatFair && topStatTpf && topStatFair.key === topStatTpf.key
          ? ppDiff(topStatFair.pct, topStatTpf.pct)
          : null,
    },
  };

  const normalizedSkewsSharedMinEdge = {
    standard_pp: ppDiff(fairStdBoost.pct.standard ?? 0, smeStdBoost.pct.standard ?? 0),
    boosted_pp: ppDiff(fairStdBoost.pct.boosted ?? 0, smeStdBoost.pct.boosted ?? 0),
    topBookFanDuel_or_first: {
      fair: topBookFair,
      sharedMinEdge: topBookSme,
      pctPointDiff: topBookFair && topBookSme && topBookFair.key === topBookSme.key
        ? ppDiff(topBookFair.pct, topBookSme.pct)
        : null,
    },
    topStatPoints_or_first: {
      fair: topStatFair,
      sharedMinEdge: topStatSme,
      pctPointDiff:
        topStatFair && topStatSme && topStatFair.key === topStatSme.key
          ? ppDiff(topStatFair.pct, topStatSme.pct)
          : null,
    },
  };

  const out = {
    pipeline: {
      rawProps: rawProps.length,
      merged: merged.length,
      allUdEv: udAll.length,
      fairDenominatorFactorGte1: fair.length,
      udTrueProbFloorSubset: trueProbFloor.length,
      udSharedMinEdgeSubset: sharedMinEdge.length,
      sanity: {
        everyTrueProbFloorInFair: trueProbFloor.every((p) => fair.includes(p)),
        everySharedMinEdgeInFair: sharedMinEdge.every((p) => fair.includes(p)),
      },
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
    udTrueProbFloorSubset: {
      count: trueProbFloor.length,
      code: UD_FAIL_MIN_EDGE,
      stdVsBoosted: { counts: tpfStdBoost.counts, pct: tpfStdBoost.pct },
      bookTop5: topN(tpfBooks, 5),
      statTop5: topN(tpfStats, 5),
      edge: edgeSummary(trueProbFloor),
      modeling: modelingUniq(trueProbFloor),
    },
    udSharedMinEdgeSubset: {
      count: sharedMinEdge.length,
      code: UD_FAIL_SHARED_MIN_EDGE,
      stdVsBoosted: { counts: smeStdBoost.counts, pct: smeStdBoost.pct },
      bookTop5: topN(smeBooks, 5),
      statTop5: topN(smeStats, 5),
      edge: edgeSummary(sharedMinEdge),
      modeling: modelingUniq(sharedMinEdge),
    },
    normalizedSkews_ppVersusFairDenominator_trueProbFloor: normalizedSkewsTrueProbFloor,
    normalizedSkews_ppVersusFairDenominator_sharedMinEdge: normalizedSkewsSharedMinEdge,
    note:
      "UD_FAIL_MIN_EDGE = trueProb < UD_MIN_TRUE_PROB; UD_FAIL_SHARED_MIN_EDGE = leg.edge < udMinEdge. Both first-fail after factor gate, so rows ⊆ fair (factor ≥ 1).",
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
