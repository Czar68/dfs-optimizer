/**
 * Phase 73 — Post-correction report: market-relative gating vs legacy naive metric.
 */

import fs from "fs";
import path from "path";
import { buildMarketEdgeAlignmentDiagnosis } from "./export_market_edge_alignment_diagnosis";

export const GATING_METRIC_CORRECTION_SCHEMA_VERSION = 1;

export function buildGatingMetricCorrectionReport(root: string = process.cwd()) {
  const phase72 = buildMarketEdgeAlignmentDiagnosis(root);
  const ppStages = phase72.pp.stages;
  const udGates = phase72.ud.gates;
  const minLegs = phase72.thresholds.pp.ppMinEligibleLegsForCardBuild;

  const ppAfter = ppStages?.marketFair.afterEffectiveEv ?? null;
  const ppLikelyNonViable =
    ppStages == null ? null : ppAfter !== null && ppAfter < minLegs;

  const udBefore = udGates?.current.afterEdgeAndStdLegEv ?? null;
  const udAfter = udGates?.marketFair.afterEdgeAndStdLegEv ?? null;
  const udCompresses =
    udBefore != null && udAfter != null ? udBefore > udAfter : null;

  return {
    schemaVersion: GATING_METRIC_CORRECTION_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    phase: 73,
    metricDefinitions: {
      marketEdgeFairCanonical:
        "juiceAwareLegEv in math_models/juice_adjust.ts — trueProb − fairProbChosenSide (two-way de-vig via fairBeFromTwoWayOdds) when both American prices exist; otherwise trueProb − 0.5.",
      legacyNaiveLegMetric:
        "EvPick.legacyNaiveLegMetric = effectiveTrueProb − 0.5 in calculate_ev (diagnostic; same probability basis as gating edge before haircut vs after is isolated to effectiveTrueProb).",
      phase72TableSemantics:
        "Survival counts reuse Phase 72 CSV simulation: ‘current’ used CSV edge/legEv from prior exports (naive era); ‘marketFair’ applies the same numeric thresholds to recomputed trueProb − fair chosen. After a fresh optimizer run, exported edge/legEv should align with marketFair.",
    },
    codePathsChanged: [
      "math_models/juice_adjust.ts — fairProbChosenSide, marketRelativeLegEdge, legacyNaiveLegMetric, juiceAwareLegEv",
      "math_models/nonstandard_canonical_leg_math.ts — outcome on CanonicalLegMathInput; computeCanonicalLegMarketEdge",
      "src/nonstandard_canonical_mapping.ts — outcome on canonicalLeg",
      "src/calculate_ev.ts — edge/legEv + legacyNaiveLegMetric + fairProbChosenSide",
      "src/types.ts — optional legacyNaiveLegMetric, fairProbChosenSide",
      "src/ev/juice_adjust.ts — re-exports",
      "src/ev/leg_ev_pipeline.ts — outcome passed to juiceAwareLegEv",
      "src/run_optimizer.ts / src/run_underdog_optimizer.ts — legs CSV columns",
      "src/reporting/market_edge_alignment_analysis.ts — fairProbChosenSide / naive from math_models",
      "src/reporting/export_market_edge_alignment_diagnosis.ts — definition text",
      "src/reporting/export_pipeline_trace_diagnosis.ts — side-aware canonical trace",
    ],
    beforeAfterSimulationSameAsPhase72Methodology: {
      pp: { stages: ppStages },
      ud: { gates: udGates },
    },
    postCorrectionAssessment: {
      ppSurvivorsAtMarketFairGate: ppAfter,
      ppMinEligibleLegsForCardBuild: minLegs,
      ppLikelyNonViableAfterCorrection: ppLikelyNonViable,
      udSurvivorsBeforeNaiveCsv: udBefore,
      udSurvivorsAtMarketFairGate: udAfter,
      udCompressesTowardRealisticSurvival: udCompresses,
    },
    thresholdFollowUpRecommendation:
      "Phase 73 does not retune floors. If PP remains at zero effective survivors at market-relative gates after fresh exports, next phase should choose between threshold retuning versus PP-specific source/pool work.",
    sources: phase72.sourcesInspected,
    thresholds: phase72.thresholds,
  };
}

function renderMarkdown(data: ReturnType<typeof buildGatingMetricCorrectionReport>): string {
  const lines: string[] = [];
  lines.push("# Gating metric correction (Phase 73)");
  lines.push("");
  lines.push(`Generated: ${data.generatedAtUtc}`);
  lines.push("");
  lines.push("## Metric definitions");
  for (const [k, v] of Object.entries(data.metricDefinitions)) {
    lines.push(`- **${k}:** ${v}`);
  }
  lines.push("");
  lines.push("## Code paths changed");
  for (const p of data.codePathsChanged) {
    lines.push(`- ${p}`);
  }
  lines.push("");
  lines.push("## Before / after (Phase 72 methodology on latest legs CSV)");
  lines.push("```json");
  lines.push(JSON.stringify(data.beforeAfterSimulationSameAsPhase72Methodology, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Post-correction assessment");
  lines.push("```json");
  lines.push(JSON.stringify(data.postCorrectionAssessment, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Threshold follow-up");
  lines.push(data.thresholdFollowUpRecommendation);
  lines.push("");
  return lines.join("\n");
}

export function exportGatingMetricCorrection(options?: { cwd?: string }): {
  jsonPath: string;
  mdPath: string;
  report: ReturnType<typeof buildGatingMetricCorrectionReport>;
} {
  const root = options?.cwd ?? process.cwd();
  const report = buildGatingMetricCorrectionReport(root);
  const outDir = path.join(root, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_gating_metric_correction.json");
  const mdPath = path.join(outDir, "latest_gating_metric_correction.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");
  return { jsonPath, mdPath, report };
}

if (require.main === module) {
  const { jsonPath, mdPath } = exportGatingMetricCorrection();
  console.log(`[export:gating-metric-correction] wrote ${jsonPath}`);
  console.log(`[export:gating-metric-correction] wrote ${mdPath}`);
}
