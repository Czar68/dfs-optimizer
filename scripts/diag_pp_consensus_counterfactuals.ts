/**
 * Phase O — PP merge consensus counterfactuals (read-only).
 * Same merged PP rows + same odds snapshot as merge; alternate aggregators vs production `trueProb` / parity fair.
 *
 * Run: npx ts-node scripts/diag_pp_consensus_counterfactuals.ts
 */
import { americanToProb, devigTwoWay } from "../src/odds_math";
import { getDefaultCliArgs } from "../src/cli_args";
import { fetchPrizePicksRawProps } from "../src/fetch_props";
import {
  buildPpConsensusBookMatchesForDiagnostics,
  getLastMergeOddsMarketsSnapshot,
  mergeOddsWithPropsWithMetadata,
} from "../src/merge_odds";
import { computeDynamicBookAccuracy, getEffectiveBookWeight } from "../src/odds/book_ranker";
import { fairProbChosenSide } from "../math_models/juice_adjust";
import { readTrackerRows } from "../src/perf_tracker_db";
import type { InternalPlayerPropOdds, MergedPick, RawPick } from "../src/types";

const ECON = 1e-6;
const MAT015 = 0.015;
const MAT010 = 0.01;

function median(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN;
}

function pickByBookFilter(books: InternalPlayerPropOdds[], pred: (b: string) => boolean): InternalPlayerPropOdds[] {
  return books.filter((o) => pred(String(o.book ?? "").trim().toLowerCase()));
}

function aggregateFromBooks(
  books: InternalPlayerPropOdds[],
  dynamicAcc: ReturnType<typeof computeDynamicBookAccuracy>
): {
  weighted_mean: number;
  unweighted_mean: number;
  median: number;
  max_weight_book: number;
  min_weight_book: number;
  trim_mean: number;
  draftkings_only: number | null;
  fanduel_only: number | null;
  pinnacle_only: number | null;
} {
  const devO = books.map((bm) => devigTwoWay(americanToProb(bm.overOdds), americanToProb(bm.underOdds))[0]);
  const w = books.map((bm) => getEffectiveBookWeight(bm.book, dynamicAcc));
  const sumW = w.reduce((a, b) => a + b, 0);
  const weighted_mean = sumW > 0 ? books.reduce((s, bm, i) => s + w[i]! * devO[i]!, 0) / sumW : devO[0] ?? 0.5;
  const unweighted_mean = mean(devO);
  const med = median(devO);
  const ixMax = w.indexOf(Math.max(...w));
  const ixMin = w.indexOf(Math.min(...w));
  const max_weight_book = devO[ixMax] ?? weighted_mean;
  const min_weight_book = devO[ixMin] ?? weighted_mean;
  let trim_mean = weighted_mean;
  if (devO.length >= 3) {
    const sorted = [...devO].sort((a, b) => a - b);
    sorted.shift();
    sorted.pop();
    trim_mean = mean(sorted);
  }
  const dk = pickByBookFilter(books, (b) => b.includes("draftking"));
  const fd = pickByBookFilter(books, (b) => b.includes("fanduel"));
  const pin = pickByBookFilter(books, (b) => b.includes("pinnacle"));
  const one = (rows: InternalPlayerPropOdds[]) =>
    rows.length
      ? devigTwoWay(americanToProb(rows[0]!.overOdds), americanToProb(rows[0]!.underOdds))[0]
      : null;
  return {
    weighted_mean,
    unweighted_mean,
    median: med,
    max_weight_book,
    min_weight_book,
    trim_mean,
    draftkings_only: one(dk),
    fanduel_only: one(fd),
    pinnacle_only: one(pin),
  };
}

function summarizeResidualAgainstParityFair(
  rows: { prod: number; parityFair: number; alts: Record<string, number> }[]
): Record<
  string,
  {
    n: number;
    meanResidual: number;
    maxResidual: number;
    minResidual: number;
    nAbsGte0010: number;
    nAbsGte0015: number;
    nPosGteEcon: number;
  }
> {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.alts)) keys.add(k);
  const out: Record<string, {
    n: number;
    meanResidual: number;
    maxResidual: number;
    minResidual: number;
    nAbsGte0010: number;
    nAbsGte0015: number;
    nPosGteEcon: number;
  }> = {};
  for (const k of keys) {
    const res: number[] = [];
    for (const r of rows) {
      const v = r.alts[k];
      if (v != null && Number.isFinite(v)) res.push(v - r.parityFair);
    }
    if (res.length === 0) continue;
    out[k] = {
      n: res.length,
      meanResidual: mean(res),
      maxResidual: Math.max(...res),
      minResidual: Math.min(...res),
      nAbsGte0010: res.filter((x) => Math.abs(x) >= MAT010).length,
      nAbsGte0015: res.filter((x) => Math.abs(x) >= MAT015).length,
      nPosGteEcon: res.filter((x) => x > ECON).length,
    };
  }
  return out;
}

async function main() {
  const cli = getDefaultCliArgs();
  const maxLineDiff = cli.exactLine ? 0 : 0.5;
  const raw = await fetchPrizePicksRawProps(["NBA"]);
  const { odds: merged } = await mergeOddsWithPropsWithMetadata(raw, cli);
  const oddsMarkets = getLastMergeOddsMarketsSnapshot();
  if (!oddsMarkets?.length) {
    console.log(JSON.stringify({ error: "no_odds_snapshot_after_merge" }));
    process.exit(1);
  }

  let dynamicAcc: ReturnType<typeof computeDynamicBookAccuracy> = [];
  try {
    const tr = readTrackerRows();
    if (tr.length >= 10) dynamicAcc = computeDynamicBookAccuracy(tr, 30);
  } catch {
    /* ignore */
  }

  const pp = merged.filter((m) => m.site === "prizepicks");
  const perRow: {
    prod: number;
    parityFair: number;
    bookSpread: number;
    nBooks: number;
    alts: Record<string, number>;
    stat: string;
  }[] = [];

  let weightedMismatch = 0;
  for (const m of pp) {
    const pick = m as MergedPick & RawPick;
    const books = buildPpConsensusBookMatchesForDiagnostics(pick, oddsMarkets, maxLineDiff);
    if (books.length === 0) continue;
    const ag = aggregateFromBooks(books, dynamicAcc);
    if (books.length > 1 && Math.abs(ag.weighted_mean - m.trueProb) > 1e-5) weightedMismatch++;

    const devO = books.map((bm) => devigTwoWay(americanToProb(bm.overOdds), americanToProb(bm.underOdds))[0]);
    const bookSpread = devO.length ? Math.max(...devO) - Math.min(...devO) : 0;

    const parityFair = fairProbChosenSide(m.fairOverOdds, m.fairUnderOdds, "over");
    const alts: Record<string, number> = {
      weighted_mean: ag.weighted_mean,
      unweighted_mean: ag.unweighted_mean,
      median: ag.median,
      max_weight_book: ag.max_weight_book,
      min_weight_book: ag.min_weight_book,
      trim_mean: ag.trim_mean,
    };
    if (ag.draftkings_only != null) alts.draftkings_only = ag.draftkings_only;
    if (ag.fanduel_only != null) alts.fanduel_only = ag.fanduel_only;
    if (ag.pinnacle_only != null) alts.pinnacle_only = ag.pinnacle_only;

    perRow.push({
      prod: m.trueProb,
      parityFair,
      bookSpread,
      nBooks: books.length,
      alts,
      stat: m.stat,
    });
  }

  const rowInputs = perRow.map((r) => ({
    prod: r.prod,
    parityFair: r.parityFair,
    alts: r.alts,
  }));
  const altSummary = summarizeResidualAgainstParityFair(rowInputs);

  const spreadByStat = new Map<string, number[]>();
  const crossAltSpread = perRow.map((r) => {
    const vals = Object.values(r.alts);
    return vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  });
  for (let i = 0; i < perRow.length; i++) {
    const r = perRow[i]!;
    spreadByStat.set(r.stat, [...(spreadByStat.get(r.stat) ?? []), crossAltSpread[i]!]);
  }

  const statSlice = [...spreadByStat.entries()]
    .map(([stat, sp]) => ({ stat, meanCrossAltSpread: mean(sp), n: sp.length }))
    .sort((a, b) => b.meanCrossAltSpread - a.meanCrossAltSpread);

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        parityNote: "residual = alt_trueOver − fairProbChosenSide(production fairOver/fairUnder) ≈ alt − production trueProb",
        nPpMerged: pp.length,
        nRowsCounterfactual: perRow.length,
        weightedRecomputeMismatchCount: weightedMismatch,
        meanBookDevigSpread: mean(perRow.map((r) => r.bookSpread)),
        p95BookDevigSpread: (() => {
          const s = [...perRow.map((r) => r.bookSpread)].sort((a, b) => a - b);
          return s[Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1)))] ?? 0;
        })(),
        meanCrossAggregatorSpreadPerRow: mean(crossAltSpread),
        altVsParityFair: altSummary,
        topStatsByCrossAltSpread: statSlice.slice(0, 6),
        nMultiBook: perRow.filter((r) => r.nBooks > 1).length,
      },
      null,
      0
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
