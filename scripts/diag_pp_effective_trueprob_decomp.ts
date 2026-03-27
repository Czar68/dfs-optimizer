/**
 * Phase N — PP raw / calibrated / effective true-prob decomposition (read-only).
 * Runs `calculateEvForMergedPicks` twice: USE_ODDS_BUCKET_CALIB=0 vs =1 (process env only).
 *
 * Run:
 *   npx ts-node scripts/diag_pp_effective_trueprob_decomp.ts
 */
import { calculateEvForMergedPicks } from "../src/calculate_ev";
import { getDefaultCliArgs } from "../src/cli_args";
import { fetchPrizePicksRawProps } from "../src/fetch_props";
import { getActiveProbabilityCalibration } from "../src/modeling/probability_calibration";
import { mergeOddsWithPropsWithMetadata } from "../src/merge_odds";
import type { EvPick } from "../src/types";

const EPS = 1e-9;
const ECON = 1e-6;

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[i]!;
}

function summarize(ev: EvPick[], label: string, oddsCalibEnv: string, calibrationArtifactActive: boolean) {
  const raw = ev.map((r) => r.rawTrueProb ?? 0.5);
  const cal = ev.map((r) => r.calibratedTrueProb ?? r.trueProb);
  const eff = ev.map((r) => (r.legacyNaiveLegMetric ?? 0) + 0.5);
  const dc = cal.map((c, i) => c - raw[i]!);
  const ec = eff.map((e, i) => e - cal[i]!);
  const posCal = dc.filter((x) => x > EPS).length;
  const negCal = dc.filter((x) => x < -EPS).length;
  const zeroCal = dc.length - posCal - negCal;
  const haircutN = ec.filter((x) => x < -EPS).length;
  const edges = ev.map((r) => r.edge ?? 0);
  const econPos = edges.filter((e) => e > ECON).length;
  const appliedN = ev.filter((r) => r.probCalibrationApplied).length;

  const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : Number.NaN);
  const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

  return {
    label,
    oddsBucketCalibEnv: oddsCalibEnv,
    n: ev.length,
    probCalibrationArtifactActive: calibrationArtifactActive,
    rowsProbCalibrationApplied: appliedN,
    rawTrueProb: { mean: mean(raw), p05: pct(sorted(raw), 0.05), p50: pct(sorted(raw), 0.5), p95: pct(sorted(raw), 0.95) },
    calibratedTrueProb: { mean: mean(cal), p50: pct(sorted(cal), 0.5) },
    effectiveTrueProb: { mean: mean(eff), p50: pct(sorted(eff), 0.5) },
    delta_calibrated_minus_raw: { mean: mean(dc), min: Math.min(...dc), max: Math.max(...dc), nPos: posCal, nNeg: negCal, nZero: zeroCal },
    delta_effective_minus_calibrated: { mean: mean(ec), nHaircutStrict: haircutN },
    parityLegEdge: { mean: mean(edges), countGtEcon: econPos, countGte0015: edges.filter((e) => e >= 0.015).length },
  };
}

async function main() {
  const cli = getDefaultCliArgs();
  const raw = await fetchPrizePicksRawProps(["NBA"]);
  const { odds: merged } = await mergeOddsWithPropsWithMetadata(raw, cli);
  const pp = merged.filter((m) => m.site === "prizepicks");

  const artifactActive = getActiveProbabilityCalibration() != null;
  const calState = {
    activeProbabilityCalibration: artifactActive,
    note: "artifact artifacts/probability_calibration.json + readiness gate",
  };

  process.env.USE_ODDS_BUCKET_CALIB = "0";
  const evOff = calculateEvForMergedPicks(pp);
  const off = summarize(evOff, "USE_ODDS_BUCKET_CALIB=0", process.env.USE_ODDS_BUCKET_CALIB ?? "0", artifactActive);

  process.env.USE_ODDS_BUCKET_CALIB = "1";
  const evOn = calculateEvForMergedPicks(pp);
  const on = summarize(evOn, "USE_ODDS_BUCKET_CALIB=1", process.env.USE_ODDS_BUCKET_CALIB ?? "1", artifactActive);

  // reset env to default
  process.env.USE_ODDS_BUCKET_CALIB = "0";

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        parityPhase: "Phase L fairOver/fairUnder for leg edge",
        calibrationGate: calState,
        off,
        on,
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
