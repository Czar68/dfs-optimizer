/**
 * Read-only PP post-merge edge bucket summary (Phases J–L diagnostic shape).
 * Run: npx ts-node scripts/diag_pp_post_merge_edge_buckets.ts
 */
import { calculateEvForMergedPicks } from "../src/calculate_ev";
import { getDefaultCliArgs } from "../src/cli_args";
import { fetchPrizePicksRawProps } from "../src/fetch_props";
import { mergeOddsWithPropsWithMetadata } from "../src/merge_odds";
import { fairProbChosenSide, juiceAwareLegEv } from "../math_models/juice_adjust";

function countMinEdge(
  ev: ReturnType<typeof calculateEvForMergedPicks>,
  getEdge: (row: (typeof ev)[0]) => number,
  getFair: (row: (typeof ev)[0]) => number
) {
  const minEdge = 0.015;
  let below015 = 0;
  let atOrAbove015 = 0;
  let fair50n = 0;
  let fair50pass = 0;
  for (const row of ev) {
    const fp = getFair(row);
    const e = getEdge(row);
    if (e < minEdge) below015++;
    else atOrAbove015++;
    if (fp >= 0.5) {
      fair50n++;
      if (e >= minEdge) fair50pass++;
    }
  }
  return { below015, atOrAbove015, fairGte050: { n: fair50n, pass: fair50pass, passRate: fair50n ? fair50pass / fair50n : 0 } };
}

async function main() {
  const cli = getDefaultCliArgs();
  const raw = await fetchPrizePicksRawProps(["NBA"]);
  const { odds: merged } = await mergeOddsWithPropsWithMetadata(raw, cli);
  const pp = merged.filter((m) => m.site === "prizepicks");
  const ev = calculateEvForMergedPicks(pp);

  // Phase L A/B on identical rows: pre-L used matched-book two-way for fair; post-L uses merge parity pair.
  let meanDeltaEdge = 0;
  let nDelta = 0;
  for (const row of ev) {
    const eff = (row.legacyNaiveLegMetric ?? 0) + 0.5;
    const pre = juiceAwareLegEv(eff, row.overOdds, row.underOdds, row.outcome);
    const post = row.edge ?? 0;
    meanDeltaEdge += post - pre;
    nDelta++;
  }
  if (nDelta) meanDeltaEdge /= nDelta;

  const parity = countMinEdge(
    ev,
    (r) => r.edge ?? 0,
    (r) => r.fairProbChosenSide ?? 0.5
  );
  const bookFair = countMinEdge(
    ev,
    (r) => {
      const eff = (r.legacyNaiveLegMetric ?? 0) + 0.5;
      return juiceAwareLegEv(eff, r.overOdds, r.underOdds, r.outcome);
    },
    (r) =>
      r.overOdds != null &&
      r.underOdds != null &&
      Number.isFinite(r.overOdds) &&
      Number.isFinite(r.underOdds)
        ? fairProbChosenSide(r.overOdds, r.underOdds, r.outcome)
        : 0.5
  );

  console.log(
    JSON.stringify({
      totalEvRows: ev.length,
      meanDeltaEdgeParityMinusBookFair: meanDeltaEdge,
      parityFairBasis: { minEdge: 0.015, ...parity },
      bookTwoWayFairBasis: { minEdge: 0.015, ...bookFair },
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
