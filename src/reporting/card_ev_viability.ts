/**
 * Phase 79 — Card EV / structure viability diagnosis (read-only).
 * Uses the same `getStructureEV` / i.i.d. path as `evaluateFlexCard` + registry breakeven.
 * Does not modify EV math, payouts, or gating.
 */

import fs from "fs";
import path from "path";
import type { EvPick, FlexType, Sport } from "../types";
import { getStructureEV, resetPerformanceCounters } from "../engine_interface";
import { getBreakevenThreshold } from "../../math_models/breakeven_from_registry";
import { computeLocalEvDP } from "../../math_models/ev_dp_prizepicks";
import { getEvaluateFlexCardSportThreshold } from "../card_ev";
import { buildPpCardBuilderPool } from "../policy/pp_card_builder_pool";
import {
  CARD_GATE_PASS,
  firstCardConstructionGateFailure,
} from "../policy/shared_card_construction_gates";

export const CARD_EV_VIABILITY_SCHEMA_VERSION = 1 as const;

/** Mirrors PP `run_optimizer` viable-structure list for sampling. */
export const PP_CARD_VIABILITY_SLIP_SPECS: { size: number; flexType: FlexType }[] = [
  { size: 5, flexType: "5F" },
  { size: 6, flexType: "6F" },
  { size: 5, flexType: "5P" },
  { size: 6, flexType: "6P" },
  { size: 4, flexType: "4F" },
  { size: 4, flexType: "4P" },
  { size: 3, flexType: "3F" },
  { size: 3, flexType: "3P" },
  { size: 2, flexType: "2P" },
];

function* kCombinationsLexFirst<T>(arr: T[], k: number, maxCombos: number): Generator<T[]> {
  const n = arr.length;
  if (k === 0 || k > n) return;
  const indices = Array.from({ length: k }, (_, i) => i);
  let count = 0;
  while (true) {
    if (count >= maxCombos) return;
    yield indices.map((i) => arr[i]);
    count++;
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) break;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
}

/** Greedy max-trueProb legs with unique players (upper bound on avg leg prob for a k-leg card). */
function greedyHighestAvgProbCombo(pool: EvPick[], k: number): EvPick[] {
  const sorted = [...pool].sort((a, b) => b.trueProb - a.trueProb);
  const out: EvPick[] = [];
  const seen = new Set<string>();
  for (const leg of sorted) {
    if (out.length >= k) break;
    if (seen.has(leg.player)) continue;
    seen.add(leg.player);
    out.push(leg);
  }
  return out;
}

export type CardEvViabilityHistogramBin = { label: string; count: number };

export type CardEvViabilityStructureBlock = {
  flexType: FlexType;
  size: number;
  requiredBreakevenAvgLegProb: number;
  sportCardEvThreshold: number;
  samplesAttempted: number;
  samplesAfterConstructionGate: number;
  gateSkipped: number;
  rawEvMin: number | null;
  rawEvMax: number | null;
  rawEvMedian: number | null;
  /** Count of samples with raw EV >= sport threshold (would pass `evaluateFlexCard` EV gate if structureEV returned). */
  countPassingSportThreshold: number;
  /** i.i.d. EV at greedy max-avgProb combo (same engine as production). */
  bestCaseAvgProb: number | null;
  bestCaseRawEvIid: number | null;
  /** DP exact EV on same legs — diagnostic contrast only; production path uses i.i.d. in `getStructureEV`. */
  bestCaseRawEvDp: number | null;
  bestCaseAvgProbVsBreakevenGap: number | null;
  histogram: CardEvViabilityHistogramBin[];
};

export type CardEvViabilityNearMiss = {
  flexType: FlexType;
  legIds: string[];
  legTrueProbs: number[];
  avgProb: number;
  roundedAvgProb: number;
  rawEvIid: number;
  rawEvDp: number;
  sportThreshold: number;
  requiredBreakevenAvgLegProb: number;
  gapAvgProbToBreakeven: number;
  gapRawEvToThreshold: number;
  wouldPassEvaluateFlexCard: boolean;
};

export type CardEvViabilityPayload = {
  schemaVersion: typeof CARD_EV_VIABILITY_SCHEMA_VERSION;
  generatedAtUtc: string;
  legsSourcePath: string;
  eligibleLegsLoaded: number;
  poolLegsUsed: number;
  sport: Sport;
  minCardEvFallback: number;
  /** Same floor as `evaluateFlexCard` (sport-specific or fallback). */
  sportCardEvThreshold: number;
  noteProductionPath: string;
  structures: CardEvViabilityStructureBlock[];
  /** Highest raw EV among gated samples (or null). */
  globalRawEvMax: number | null;
  /** Best raw EV among gated samples (i.i.d. engine). */
  exampleTraceBestOverall: CardEvViabilityNearMiss | null;
  /** Best raw EV among samples still below sport floor (near-miss). */
  exampleTraceNearMissBelowFloor: CardEvViabilityNearMiss | null;
  rootCauseClassification: string;
  nextActionHint: string;
  /** Structure with highest greedy best-case i.i.d. raw EV (closest economic viability). */
  closestStructureByBestCaseRawEv: { flexType: FlexType; bestCaseRawEvIid: number | null } | null;
};

function medianSorted(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildHistogram(values: number[]): CardEvViabilityHistogramBin[] {
  const bins: { label: string; test: (x: number) => boolean }[] = [
    { label: "ev < -0.10", test: (x) => x < -0.1 },
    { label: "-0.10 <= ev < -0.05", test: (x) => x >= -0.1 && x < -0.05 },
    { label: "-0.05 <= ev < 0", test: (x) => x >= -0.05 && x < 0 },
    { label: "0 <= ev < 0.004", test: (x) => x >= 0 && x < 0.004 },
    { label: "0.004 <= ev < 0.008", test: (x) => x >= 0.004 && x < 0.008 },
    { label: "0.008 <= ev < 0.012", test: (x) => x >= 0.008 && x < 0.012 },
    { label: "ev >= 0.012", test: (x) => x >= 0.012 },
  ];
  return bins.map((b) => ({
    label: b.label,
    count: values.filter(b.test).length,
  }));
}

function classifyAndHint(payload: Pick<CardEvViabilityPayload, "structures" | "globalRawEvMax"> & {
  sportThreshold: number;
}): { rootCauseClassification: string; nextActionHint: string } {
  const maxEv = payload.globalRawEvMax;
  const th = payload.sportThreshold;
  if (maxEv == null || !Number.isFinite(maxEv)) {
    return {
      rootCauseClassification: "no_gated_samples_or_ev_unavailable",
      nextActionHint: "Increase pool size / check leg JSON; confirm ENGINE_MODE allows local EV.",
    };
  }
  if (maxEv < th) {
    const anyNear = payload.structures.some(
      (s) => s.bestCaseRawEvIid != null && s.bestCaseRawEvIid >= th
    );
    if (anyNear) {
      return {
        rootCauseClassification: "sampler_missed_high_ev_combos_threshold_still_binding",
        nextActionHint: "Best-case i.i.d. EV can pass threshold for some structures; builder sampling may not hit those combos — review combinatorics volume, not payout math.",
      };
    }
    const allBestNegative = payload.structures.every(
      (s) => s.bestCaseRawEvIid == null || s.bestCaseRawEvIid < 0
    );
    if (allBestNegative) {
      return {
        rootCauseClassification: "expected_negative_ev_at_best_avg_prob_slate_too_tight",
        nextActionHint: "Leg pool average win rates are below what payouts require (see breakeven vs best-case avgProb). Wait for better lines or relax leg filters (product decision) — not an EV-engine bug.",
      };
    }
    return {
      rootCauseClassification: "all_sampled_combos_below_sport_card_ev_floor",
      nextActionHint: `Raw card EV (i.i.d. engine) stays below sport floor ${(th * 100).toFixed(2)}% for sampled gated combos — typical when avg leg prob is only modestly above 50%.`,
    };
  }
  return {
    rootCauseClassification: "at_least_one_combo_meets_raw_ev_floor_abnormal_if_still_zero_exports",
    nextActionHint: "If optimizer still exports 0 cards, failure is after raw EV (per-type min EV in builder, or SelectionEngine) — use pre-diversification diagnosis.",
  };
}

export interface BuildCardEvViabilityOptions {
  cwd?: string;
  legsRelativePath?: string;
  maxSamplesPerStructure?: number;
  minCardEvFallback?: number;
}

export async function buildCardEvViabilityPayload(
  legs: EvPick[],
  options?: BuildCardEvViabilityOptions
): Promise<CardEvViabilityPayload> {
  const cwd = options?.cwd ?? process.cwd();
  const legsRelativePath = options?.legsRelativePath ?? "prizepicks-legs.json";
  const maxSamples = options?.maxSamplesPerStructure ?? 300;
  const minCardEvFallback =
    options?.minCardEvFallback ?? Number(process.env.MIN_CARD_EV ?? 0.008);

  resetPerformanceCounters();

  const sport = (legs[0]?.sport as Sport) ?? "NBA";
  const sportThreshold = getEvaluateFlexCardSportThreshold(sport, minCardEvFallback);

  const pool = buildPpCardBuilderPool(legs);
  const structures: CardEvViabilityStructureBlock[] = [];
  const allRawEvs: number[] = [];
  let bestOverall: CardEvViabilityNearMiss | null = null;
  let bestOverallRaw = -Infinity;
  let bestBelowFloor: CardEvViabilityNearMiss | null = null;
  let bestBelowFloorRaw = -Infinity;

  for (const { size, flexType } of PP_CARD_VIABILITY_SLIP_SPECS) {
    const pStar = getBreakevenThreshold(flexType);
    const rawEvs: number[] = [];
    let samplesAfterGate = 0;
    let gateSkipped = 0;
    let attempted = 0;

    for (const combo of kCombinationsLexFirst(pool, size, maxSamples)) {
      attempted++;
      if (firstCardConstructionGateFailure(combo) !== CARD_GATE_PASS) {
        gateSkipped++;
        continue;
      }
      samplesAfterGate++;
      const avgProb = combo.reduce((s, l) => s + l.trueProb, 0) / size;
      const roundedAvgProb = Math.round(avgProb * 10000) / 10000;
      const sev = await getStructureEV(flexType, roundedAvgProb);
      const raw = sev?.ev ?? NaN;
      if (Number.isFinite(raw)) {
        rawEvs.push(raw);
        allRawEvs.push(raw);
        const probs = combo.map((l) => l.trueProb);
        const trace: CardEvViabilityNearMiss = {
          flexType,
          legIds: combo.map((l) => l.id),
          legTrueProbs: probs,
          avgProb,
          roundedAvgProb,
          rawEvIid: raw,
          rawEvDp: computeLocalEvDP(flexType, probs),
          sportThreshold,
          requiredBreakevenAvgLegProb: pStar,
          gapAvgProbToBreakeven: avgProb - pStar,
          gapRawEvToThreshold: raw - sportThreshold,
          wouldPassEvaluateFlexCard: raw >= sportThreshold,
        };
        if (raw > bestOverallRaw) {
          bestOverallRaw = raw;
          bestOverall = trace;
        }
        if (raw < sportThreshold && raw > bestBelowFloorRaw) {
          bestBelowFloorRaw = raw;
          bestBelowFloor = trace;
        }
      }
    }

    const sorted = [...rawEvs].sort((a, b) => a - b);
    const greedy = greedyHighestAvgProbCombo(pool, size);
    let bestAvg: number | null = null;
    let bestIid: number | null = null;
    let bestDp: number | null = null;
    if (greedy.length === size) {
      bestAvg = greedy.reduce((s, l) => s + l.trueProb, 0) / size;
      const rounded = Math.round(bestAvg * 10000) / 10000;
      const sev = await getStructureEV(flexType, rounded);
      bestIid = sev?.ev ?? null;
      bestDp = computeLocalEvDP(
        flexType,
        greedy.map((l) => l.trueProb)
      );
    }

    const passCount = rawEvs.filter((e) => e >= sportThreshold).length;
    structures.push({
      flexType,
      size,
      requiredBreakevenAvgLegProb: pStar,
      sportCardEvThreshold: sportThreshold,
      samplesAttempted: attempted,
      samplesAfterConstructionGate: samplesAfterGate,
      gateSkipped,
      rawEvMin: sorted.length ? sorted[0] : null,
      rawEvMax: sorted.length ? sorted[sorted.length - 1] : null,
      rawEvMedian: medianSorted(sorted),
      countPassingSportThreshold: passCount,
      bestCaseAvgProb: bestAvg,
      bestCaseRawEvIid: bestIid,
      bestCaseRawEvDp: bestDp,
      bestCaseAvgProbVsBreakevenGap: bestAvg != null ? bestAvg - pStar : null,
      histogram: buildHistogram(rawEvs),
    });
  }

  const globalRawEvMax = allRawEvs.length ? Math.max(...allRawEvs) : null;

  let closestStructureByBestCaseRawEv: CardEvViabilityPayload["closestStructureByBestCaseRawEv"] = null;
  let bestCaseEvBest = -Infinity;
  for (const s of structures) {
    if (s.bestCaseRawEvIid != null && Number.isFinite(s.bestCaseRawEvIid) && s.bestCaseRawEvIid > bestCaseEvBest) {
      bestCaseEvBest = s.bestCaseRawEvIid;
      closestStructureByBestCaseRawEv = { flexType: s.flexType, bestCaseRawEvIid: s.bestCaseRawEvIid };
    }
  }

  const { rootCauseClassification, nextActionHint } = classifyAndHint({
    structures,
    globalRawEvMax,
    sportThreshold,
  });

  return {
    schemaVersion: CARD_EV_VIABILITY_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    legsSourcePath: path.join(cwd, legsRelativePath),
    eligibleLegsLoaded: legs.length,
    poolLegsUsed: pool.length,
    sport,
    minCardEvFallback,
    sportCardEvThreshold: sportThreshold,
    noteProductionPath:
      "Card raw EV uses `getStructureEV` → local i.i.d. binomial (`math_models/ev_dp_prizepicks.computeLocalEv`), same as `evaluateFlexCard`. Threshold from `getEvaluateFlexCardSportThreshold`.",
    structures,
    globalRawEvMax,
    exampleTraceBestOverall: bestOverall,
    exampleTraceNearMissBelowFloor: bestBelowFloor,
    rootCauseClassification,
    nextActionHint,
    closestStructureByBestCaseRawEv,
  };
}

export function loadPrizepicksLegsJson(cwd: string, relativePath = "prizepicks-legs.json"): EvPick[] {
  const p = path.join(cwd, relativePath);
  const raw = fs.readFileSync(p, "utf8");
  const data = JSON.parse(raw) as unknown;
  if (!Array.isArray(data)) throw new Error(`Expected JSON array at ${p}`);
  return data as EvPick[];
}

export async function buildCardEvViabilityPayloadFromFile(
  options?: BuildCardEvViabilityOptions
): Promise<CardEvViabilityPayload> {
  const cwd = options?.cwd ?? process.cwd();
  const rel = options?.legsRelativePath ?? "prizepicks-legs.json";
  const legs = loadPrizepicksLegsJson(cwd, rel);
  return buildCardEvViabilityPayload(legs, { ...options, cwd, legsRelativePath: rel });
}

export function writeCardEvViabilityArtifacts(
  cwd: string,
  payload: CardEvViabilityPayload
): void {
  const outDir = path.join(cwd, "data", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "latest_card_ev_viability.json"),
    JSON.stringify(payload, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "latest_card_ev_viability.md"),
    formatCardEvViabilityMarkdown(payload),
    "utf8"
  );
}

export function formatCardEvViabilityMarkdown(p: CardEvViabilityPayload): string {
  const lines: string[] = [
    "# Phase 79 — Card EV / structure viability",
    "",
    `Generated: **${p.generatedAtUtc}**`,
    "",
    `- **Legs file:** \`${p.legsSourcePath}\``,
    `- **Legs loaded:** ${p.eligibleLegsLoaded} → **builder pool:** ${p.poolLegsUsed}`,
    `- **Sport:** ${p.sport} | **evaluateFlexCard sport floor:** ${(p.sportCardEvThreshold * 100).toFixed(3)}% (minCardEvFallback=${p.minCardEvFallback})`,
    "",
    `> ${p.noteProductionPath}`,
    "",
    "## Summary",
    "",
    `- **Global max raw EV (i.i.d. engine, sampled):** ${p.globalRawEvMax == null ? "n/a" : (p.globalRawEvMax * 100).toFixed(3)}%`,
    `- **Closest structure (greedy best-case i.i.d. raw EV):** ${
      p.closestStructureByBestCaseRawEv == null
        ? "n/a"
        : `${p.closestStructureByBestCaseRawEv.flexType} (${(p.closestStructureByBestCaseRawEv.bestCaseRawEvIid! * 100).toFixed(3)}%)`
    }`,
    `- **Root cause (classification):** \`${p.rootCauseClassification}\``,
    `- **Next action hint:** ${p.nextActionHint}`,
    "",
  ];

  if (p.exampleTraceBestOverall) {
    const n = p.exampleTraceBestOverall;
    lines.push(
      "## Example trace — best raw EV (sampled, gated)",
      "",
      `- **Structure:** ${n.flexType}`,
      `- **Leg IDs:** ${n.legIds.join(", ")}`,
      `- **Leg true probs:** ${n.legTrueProbs.map((x) => x.toFixed(4)).join(", ")}`,
      `- **avgProb:** ${n.avgProb.toFixed(6)} (rounded ${n.roundedAvgProb})`,
      `- **Raw EV (i.i.d., production path):** ${(n.rawEvIid * 100).toFixed(3)}%`,
      `- **Raw EV (DP exact, diagnostic):** ${(n.rawEvDp * 100).toFixed(3)}%`,
      `- **Required breakeven avg leg prob (registry):** ${(n.requiredBreakevenAvgLegProb * 100).toFixed(2)}%`,
      `- **avgProb − p\\*:** ${(n.gapAvgProbToBreakeven * 100).toFixed(3)} pp`,
      `- **Sport EV floor:** ${(n.sportThreshold * 100).toFixed(3)}% | **raw EV − floor:** ${(n.gapRawEvToThreshold * 100).toFixed(3)} pp`,
      `- **Would pass evaluateFlexCard EV gate:** ${n.wouldPassEvaluateFlexCard ? "yes" : "no"}`,
      ""
    );
  }

  if (p.exampleTraceNearMissBelowFloor) {
    const n = p.exampleTraceNearMissBelowFloor;
    lines.push(
      "## Example trace — near-miss (highest raw EV below sport floor)",
      "",
      `- **Structure:** ${n.flexType}`,
      `- **Leg IDs:** ${n.legIds.join(", ")}`,
      `- **Raw EV (i.i.d.):** ${(n.rawEvIid * 100).toFixed(3)}% (floor ${(n.sportThreshold * 100).toFixed(3)}%)`,
      ""
    );
  }

  lines.push("## By structure", "");
  for (const s of p.structures) {
    lines.push(
      `### ${s.flexType} (${s.size} legs)`,
      "",
      "| Metric | Value |",
      "|---|---:|",
      `| Registry breakeven p* (avg leg) | ${(s.requiredBreakevenAvgLegProb * 100).toFixed(2)}% |`,
      `| Sport card EV floor | ${(s.sportCardEvThreshold * 100).toFixed(3)}% |`,
      `| Samples (combinations tried) | ${s.samplesAttempted} |`,
      `| After construction gate | ${s.samplesAfterConstructionGate} (skipped ${s.gateSkipped}) |`,
      `| raw EV min / median / max | ${s.rawEvMin == null ? "n/a" : (s.rawEvMin * 100).toFixed(3)}% / ${s.rawEvMedian == null ? "n/a" : (s.rawEvMedian * 100).toFixed(3)}% / ${s.rawEvMax == null ? "n/a" : (s.rawEvMax * 100).toFixed(3)}% |`,
      `| Count ≥ sport floor | ${s.countPassingSportThreshold} |`,
      `| Greedy best-case avgProb | ${s.bestCaseAvgProb == null ? "n/a" : (s.bestCaseAvgProb * 100).toFixed(2)}% |`,
      `| Greedy best-case raw EV (i.i.d.) | ${s.bestCaseRawEvIid == null ? "n/a" : (s.bestCaseRawEvIid * 100).toFixed(3)}% |`,
      `| Greedy best-case raw EV (DP) | ${s.bestCaseRawEvDp == null ? "n/a" : (s.bestCaseRawEvDp * 100).toFixed(3)}% |`,
      `| best avgProb − p* | ${s.bestCaseAvgProbVsBreakevenGap == null ? "n/a" : (s.bestCaseAvgProbVsBreakevenGap * 100).toFixed(3)} pp |`,
      "",
      "**Histogram (raw EV, gated samples)**",
      "",
      "| Bin | Count |",
      "|---|---:|",
      ...s.histogram.map((h) => `| ${h.label} | ${h.count} |`),
      ""
    );
  }

  return lines.join("\n");
}
