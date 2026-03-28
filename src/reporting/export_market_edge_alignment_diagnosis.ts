/**
 * Phase 72 — Cross-platform market-edge alignment diagnosis (read-only).
 */

import fs from "fs";
import path from "path";
import { getDefaultCliArgs } from "../cli_args";
import {
  computePpRunnerLegEligibility,
  computeUdRunnerLegEligibility,
  computeUdFilterEvPicksStandardFloors,
} from "../policy/eligibility_policy";
import {
  enrichMetrics,
  filterExtremePrice,
  loadLegCsv,
  MARKET_EDGE_ALIGNMENT_SCHEMA_VERSION,
  pickTopOverstatements,
  type ParsedLegRow,
} from "./market_edge_alignment_analysis";

function resolveLegPaths(root: string): { pp: string | null; ud: string | null } {
  const candidatesPp = [path.join(root, "prizepicks-legs.csv"), path.join(root, "data", "output_logs", "prizepicks-legs.csv")];
  const candidatesUd = [path.join(root, "underdog-legs.csv"), path.join(root, "data", "output_logs", "underdog-legs.csv")];
  const pp = candidatesPp.find((p) => fs.existsSync(p)) ?? null;
  const ud = candidatesUd.find((p) => fs.existsSync(p)) ?? null;
  return { pp, ud };
}

function simulatePpStages(
  legs: ParsedLegRow[],
  policy: ReturnType<typeof computePpRunnerLegEligibility>
): {
  current: { afterMinEdge: number; afterMinLegEv: number; afterEffectiveEv: number };
  marketFair: { afterMinEdge: number; afterMinLegEv: number; afterEffectiveEv: number };
} {
  const enriched = enrichMetrics(legs);
  // @ts-ignore
  const { minEdgePerLeg, minLegEv, adjustedEvThreshold } = policy;

  const cur1 = enriched.filter((r) => r.edge >= minEdgePerLeg);
  const cur2 = cur1.filter((r) => r.legEv >= minLegEv);
  const cur3 = cur2.filter((r) => (r.legEv ?? 0) >= adjustedEvThreshold);

  const m1 = enriched.filter((r) => r.marketEdgeFair >= minEdgePerLeg);
  const m2 = m1.filter((r) => r.marketEdgeFair >= minLegEv);
  const m3 = m2.filter((r) => r.marketEdgeFair >= adjustedEvThreshold);

  return {
    current: { afterMinEdge: cur1.length, afterMinLegEv: cur2.length, afterEffectiveEv: cur3.length },
    marketFair: { afterMinEdge: m1.length, afterMinLegEv: m2.length, afterEffectiveEv: m3.length },
  };
}

function simulateUdGates(
  legs: ParsedLegRow[],
  udPol: ReturnType<typeof computeUdRunnerLegEligibility>
): {
  current: { afterEdgeAndStdLegEv: number };
  marketFair: { afterEdgeAndStdLegEv: number };
} {
  // @ts-ignore
  const std = computeUdFilterEvPicksStandardFloors(udPol.udVolume).standardPickMinLegEv;
  const enriched = enrichMetrics(legs);
  const { udMinEdge } = udPol;

  const cur = enriched.filter((r) => r.edge >= udMinEdge && r.legEv >= std);
  const mkt = enriched.filter((r) => r.marketEdgeFair >= udMinEdge && r.marketEdgeFair >= std);

  return {
    current: { afterEdgeAndStdLegEv: cur.length },
    marketFair: { afterEdgeAndStdLegEv: mkt.length },
  };
}

export function buildMarketEdgeAlignmentDiagnosis(root: string = process.cwd()) {
  const cli = getDefaultCliArgs();
  const ppPolicy = computePpRunnerLegEligibility(cli);
  const udPolicy = computeUdRunnerLegEligibility(cli);

  const { pp: ppPath, ud: udPath } = resolveLegPaths(root);
  const ppLegs = ppPath ? loadLegCsv(ppPath) : [];
  const udLegs = udPath ? loadLegCsv(udPath) : [];

  const ppEnriched = enrichMetrics(ppLegs);
  const udEnriched = enrichMetrics(udLegs);

  const ppStages = ppLegs.length ? simulatePpStages(ppLegs, ppPolicy) : null;
  const udGates = udLegs.length ? simulateUdGates(udLegs, udPolicy) : null;

  const ppExtreme = filterExtremePrice(ppEnriched, -300);
  const udExtreme = filterExtremePrice(udEnriched, -300);

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    schemaVersion: MARKET_EDGE_ALIGNMENT_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    metricDefinitions: {
      currentSurvivalMetric:
        "leg.edge / leg.legEv from CSV — produced by calculate_ev → computeCanonicalLegMarketEdge → juiceAwareLegEv (Phase 73+: trueProb − fairProbChosenSide when both American prices exist; else trueProb−0.5; uses effectiveTrueProb after calibration/haircut).",
      naiveLegMetricRecomputed: "trueProb − 0.5 using CSV trueProb (legacy naive comparator; see EvPick.legacyNaiveLegMetric on fresh exports).",
      marketEdgeFair: "trueProb − fairProbChosenSide where fair uses math_models/juice_adjust.fairProbChosenSide (two-way de-vig), side from leg id (-over/-under or default over).",
      marketEdgeVig: "trueProb − americanToImpliedProb on chosen side (single-side vigged implied).",
      deltaNaiveVsMarketFair: "naiveLegMetric − marketEdgeFair = fairChosen − 0.5 (algebraic identity when trueProb cancels).",
      analogousThresholdSimulation:
        "Apply same numeric floors (PP: minEdgePerLeg, minLegEv, adjustedEvThreshold; UD: udMinEdge + standardPickMinLegEv) to marketEdgeFair instead of naive edge/legEv — diagnosis only.",
    },
    sourcesInspected: {
      prizepicksLegsCsv: ppPath ? path.relative(root, ppPath).replace(/\\/g, "/") : null,
      underdogLegsCsv: udPath ? path.relative(root, udPath).replace(/\\/g, "/") : null,
      policySource: "getDefaultCliArgs() + computePpRunnerLegEligibility / computeUdRunnerLegEligibility (matches non-CLI-override defaults).",
    },
    thresholds: {
      pp: {
      // @ts-ignore
        minEdgePerLeg: ppPolicy.minEdgePerLeg,
      // @ts-ignore
        minLegEv: ppPolicy.minLegEv,
      // @ts-ignore
        adjustedEvThreshold: ppPolicy.adjustedEvThreshold,
        ppMinEligibleLegsForCardBuild: 6,
      },
      ud: {
        udMinEdge: udPolicy.udMinEdge,
      // @ts-ignore
        udMinLegEv: udPolicy.udMinLegEv,
      // @ts-ignore
        standardPickMinLegEv: computeUdFilterEvPicksStandardFloors(udPolicy.udVolume).standardPickMinLegEv,
      },
    },
    pp: {
      legCount: ppLegs.length,
      stages: ppStages,
      topOverstatementsVsMarketFair: pickTopOverstatements(ppEnriched, 5),
      extremePriceLeCount300: ppExtreme.length,
      extremePriceAvg: ppExtreme.length
        ? {
            avgNaiveLegEv: avg(ppExtreme.map((r) => r.legEv)),
            avgMarketEdgeFair: avg(ppExtreme.map((r) => r.marketEdgeFair)),
          }
        : null,
    },
    ud: {
      legCount: udLegs.length,
      gates: udGates,
      topOverstatementsVsMarketFair: pickTopOverstatements(udEnriched, 5),
      extremePriceLeCount300: udExtreme.length,
      extremePriceAvg: udExtreme.length
        ? {
            avgNaiveLegEv: avg(udExtreme.map((r) => r.legEv)),
            avgMarketEdgeFair: avg(udExtreme.map((r) => r.marketEdgeFair)),
          }
        : null,
    },
    rootCauseConclusion: {
      classification: "metric_definition_mismatch_plus_threshold_stacking",
      narrative:
        "Phase 72 baselines used juiceAwareLegEv = trueProb−0.5. Phase 73 switches production gating to market-relative juiceAwareLegEv (trueProb−fairProbChosenSide when odds exist). Re-run exports after a fresh optimizer pass so CSV leg.edge/legEv align with the new comparator; Phase 72 stage tables that compare ‘current’ vs ‘marketFair’ collapse once CSV is regenerated.",
    },
    nextActions: [
      "Phase 73 implemented fair-book-relative juiceAwareLegEv in math_models/juice_adjust.ts — re-run this export after fresh legs CSV to validate alignment.",
      "Treat PP ‘5 legs’ vs ‘6 required’ as structural — either relax PP structures or accept no cards until pool size rises; orthogonal to edge definition but visible when naive pool is already thin.",
    ],
  };
}

function renderMarkdown(data: ReturnType<typeof buildMarketEdgeAlignmentDiagnosis>): string {
  const lines: string[] = [];
  lines.push("# Market edge alignment diagnosis (Phase 72)");
  lines.push("");
  lines.push(`Generated: ${data.generatedAtUtc}`);
  lines.push("");
  lines.push("## Sources");
  lines.push(`- PP legs: ${data.sourcesInspected.prizepicksLegsCsv ?? "missing"}`);
  lines.push(`- UD legs: ${data.sourcesInspected.underdogLegsCsv ?? "missing"}`);
  lines.push(`- ${data.sourcesInspected.policySource}`);
  lines.push("");
  lines.push("## Metric definitions");
  for (const [k, v] of Object.entries(data.metricDefinitions)) {
    lines.push(`- **${k}:** ${v}`);
  }
  lines.push("");
  lines.push("## Thresholds (defaults)");
  lines.push("```json");
  lines.push(JSON.stringify(data.thresholds, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## PP — stage simulation (analogous thresholds)");
  lines.push("```json");
  lines.push(JSON.stringify(data.pp, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## UD — gate simulation");
  lines.push("```json");
  lines.push(JSON.stringify(data.ud, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Root-cause conclusion");
  lines.push(`- **Classification:** ${data.rootCauseConclusion.classification}`);
  lines.push(`- ${data.rootCauseConclusion.narrative}`);
  lines.push("");
  lines.push("## Next actions");
  for (const a of data.nextActions) {
    lines.push(`- ${a}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function exportMarketEdgeAlignmentDiagnosis(options?: { cwd?: string }): {
  jsonPath: string;
  mdPath: string;
  report: ReturnType<typeof buildMarketEdgeAlignmentDiagnosis>;
} {
  const root = options?.cwd ?? process.cwd();
  const report = buildMarketEdgeAlignmentDiagnosis(root);
  const outDir = path.join(root, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_market_edge_alignment_diagnosis.json");
  const mdPath = path.join(outDir, "latest_market_edge_alignment_diagnosis.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");
  return { jsonPath, mdPath, report };
}

if (require.main === module) {
  const { jsonPath, mdPath } = exportMarketEdgeAlignmentDiagnosis();
  console.log(`[export:market-edge-alignment-diagnosis] wrote ${jsonPath}`);
  console.log(`[export:market-edge-alignment-diagnosis] wrote ${mdPath}`);
}
