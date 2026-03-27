/**
 * Phase M — PP post-parity leg edge grouped summary (read-only).
 * Run: npx ts-node scripts/diag_pp_post_parity_signal.ts
 */
import { calculateEvForMergedPicks } from "../src/calculate_ev";
import { getDefaultCliArgs } from "../src/cli_args";
import { fetchPrizePicksRawProps } from "../src/fetch_props";
import { getOddsBucket } from "../src/odds_buckets";
import { mergeOddsWithPropsWithMetadata } from "../src/merge_odds";
import type { EvPick } from "../src/types";

type Agg = {
  n: number;
  sumEdge: number;
  minEdge: number;
  maxEdge: number;
  positiveN: number;
  gte0015: number;
};

function emptyAgg(): Agg {
  return { n: 0, sumEdge: 0, minEdge: Infinity, maxEdge: -Infinity, positiveN: 0, gte0015: 0 };
}

function add(a: Agg, edge: number): void {
  a.n++;
  a.sumEdge += edge;
  a.minEdge = Math.min(a.minEdge, edge);
  a.maxEdge = Math.max(a.maxEdge, edge);
  if (edge > 0) a.positiveN++;
  if (edge >= 0.015) a.gte0015++;
}

function finalize(a: Agg): Record<string, number> {
  if (a.n === 0) return { n: 0 };
  return {
    n: a.n,
    meanEdge: a.sumEdge / a.n,
    minEdge: a.minEdge,
    maxEdge: a.maxEdge,
    positiveN: a.positiveN,
    positiveShare: a.positiveN / a.n,
    gte0015: a.gte0015,
    gte0015Share: a.gte0015 / a.n,
  };
}

function roll(map: Map<string, Agg>, key: string, edge: number): void {
  let a = map.get(key);
  if (!a) {
    a = emptyAgg();
    map.set(key, a);
  }
  add(a, edge);
}

function topGroups(map: Map<string, Agg>, k: number, by: "meanEdge" | "positiveShare" | "maxEdge"): string[] {
  type Row = {
    key: string;
    n: number;
    meanEdge: number;
    minEdge: number;
    maxEdge: number;
    positiveN: number;
    positiveShare: number;
    gte0015: number;
    gte0015Share: number;
  };
  const rows: Row[] = [];
  for (const [key, a] of map.entries()) {
    if (a.n < 5) continue;
    const f = finalize(a);
    if (f.n === 0 || f.meanEdge === undefined) continue;
    rows.push({
      key,
      n: f.n,
      meanEdge: f.meanEdge,
      minEdge: f.minEdge!,
      maxEdge: f.maxEdge!,
      positiveN: f.positiveN!,
      positiveShare: f.positiveShare!,
      gte0015: f.gte0015!,
      gte0015Share: f.gte0015Share!,
    });
  }

  if (by === "meanEdge") rows.sort((x, y) => y.meanEdge - x.meanEdge);
  else if (by === "maxEdge") rows.sort((x, y) => y.maxEdge - x.maxEdge);
  else rows.sort((x, y) => y.positiveShare - x.positiveShare);

  return rows
    .slice(0, k)
    .map(
      (r) =>
        `${r.key}|n=${r.n}|mean=${r.meanEdge.toFixed(5)}|max=${r.maxEdge.toFixed(5)}|pos%=${(r.positiveShare * 100).toFixed(1)}`
    );
}

function lineBucket(line: number): string {
  return String(Math.round(line * 2) / 2);
}

function haircutLabel(row: EvPick): string {
  const eff = (row.legacyNaiveLegMetric ?? 0) + 0.5;
  const cal = row.calibratedTrueProb ?? row.trueProb;
  const h = cal - eff;
  if (h > 1e-5) return `haircut_${h.toFixed(4)}`;
  return "no_haircut";
}

async function main() {
  const cli = getDefaultCliArgs();
  const raw = await fetchPrizePicksRawProps(["NBA"]);
  const { odds: merged } = await mergeOddsWithPropsWithMetadata(raw, cli);
  const pp = merged.filter((m) => m.site === "prizepicks");
  const ev = calculateEvForMergedPicks(pp);

  const edges = ev.map((r) => r.edge ?? 0).sort((a, b) => a - b);
  const pct = (p: number) => edges[Math.min(edges.length - 1, Math.floor(p * (edges.length - 1)))] ?? 0;

  const global = emptyAgg();
  for (const e of edges) add(global, e);

  const economicEpsilon = 1e-6;
  const economicPositive = edges.filter((e) => e > economicEpsilon).length;

  const byStat = new Map<string, Agg>();
  const byBook = new Map<string, Agg>();
  const bySide = new Map<string, Agg>();
  const byLine = new Map<string, Agg>();
  const byHaircut = new Map<string, Agg>();
  const byOddsBucket = new Map<string, Agg>();

  for (const row of ev) {
    const edge = row.edge ?? 0;
    roll(byStat, row.stat, edge);
    roll(byBook, row.book ?? "null", edge);
    roll(bySide, row.outcome, edge);
    roll(byLine, lineBucket(row.line), edge);
    roll(byHaircut, haircutLabel(row), edge);
    const ob = getOddsBucket(row.overOdds ?? undefined, row.underOdds ?? undefined, row.outcome) ?? "unknown";
    roll(byOddsBucket, ob, edge);
  }

  const calibrationNote = process.env.USE_ODDS_BUCKET_CALIB === "1" ? "USE_ODDS_BUCKET_CALIB=1" : "USE_ODDS_BUCKET_CALIB off (default)";

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        parityNote: "edge = Phase L parity-benchmark leg edge (consensus fair pair)",
        totalEvRows: ev.length,
        oddsBucketHaircutEnv: calibrationNote,
        global: {
          ...finalize(global),
          economicEpsilon,
          countEdgeGtEpsilon: economicPositive,
          p05: pct(0.05),
          p50: pct(0.5),
          p95: pct(0.95),
        },
        topMeanEdgeByStat: topGroups(byStat, 8, "meanEdge"),
        topMaxEdgeByBook: topGroups(byBook, 8, "maxEdge"),
        bySide: Object.fromEntries([...bySide.entries()].map(([k, a]) => [k, finalize(a)])),
        topMeanEdgeByLineBucket: topGroups(byLine, 6, "meanEdge"),
        byHaircut: Object.fromEntries([...byHaircut.entries()].map(([k, a]) => [k, finalize(a)])),
        topPositiveShareByOddsBucket: topGroups(byOddsBucket, 8, "positiveShare"),
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
