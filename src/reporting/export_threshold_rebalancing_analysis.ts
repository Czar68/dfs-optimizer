/**
 * Phase 74 — Threshold rebalancing analysis export (JSON + Markdown).
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
  enrichLegsWithPlayer,
  findMinimalCombinedFloorTStar,
  findMinimalUdCombinedFloorForGoal,
  loadLegCsvWithPlayer,
  ppBindingStageFromDrops,
  ppCombinedFloor,
  ppSequentialMarketFairStages,
  resolveLegPaths,
  sweepPpRelaxEffectiveEv,
  countPpAfterCombinedFloorAndCap,
  udCombinedFloor,
  udStandardPathCount,
  THRESHOLD_REBALANCING_SCHEMA_VERSION,
  PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD,
} from "./threshold_rebalancing_analysis";

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

export function recommendPpThresholdsFromTStar(
  tStar: number | null,
  baseline: { minEdgePerLeg: number; minLegEv: number; adjustedEvThreshold: number }
): { minEdgePerLeg: number; minLegEv: number; adjustedEvThreshold: number; rationale: string } {
  if (tStar == null) {
    const eff = Math.max(0.004, baseline.adjustedEvThreshold - 0.005);
    const legEv = Math.max(0.004, Math.min(baseline.minLegEv, eff));
    return {
      minEdgePerLeg: round4(Math.min(baseline.minEdgePerLeg, legEv)),
      minLegEv: round4(legEv),
      adjustedEvThreshold: round4(eff),
      rationale:
        "PP goal not reachable with current CSV pool at any T; apply conservative -0.005 effective EV step (and align minLegEv) to improve marginal pass-through — rerun merge for ≥6 legs.",
    };
  }
  const minEdge = Math.min(baseline.minEdgePerLeg, tStar);
  const minLegEv = Math.min(baseline.minLegEv, tStar);
  const eff = Math.min(baseline.adjustedEvThreshold, tStar);
  return {
    minEdgePerLeg: round4(minEdge),
    minLegEv: round4(minLegEv),
    adjustedEvThreshold: round4(eff),
    rationale:
      "Floors capped so sequential gates with identical marketEdgeFair require m >= max(minEdge,minLegEv,eff) ≤ T* from binary search on FCFS-capped pool.",
  };
}

export function recommendUdMinEdgeFromTStar(
  tStar: number | null,
  baselineUdMinEdge: number,
  standardPickMinLegEv: number
): { udMinEdge: number; rationale: string } {
  if (tStar == null) {
    return {
      udMinEdge: round4(Math.max(0.004, baselineUdMinEdge - 0.002)),
      rationale: "UD goal not achievable at current pool; conservative -0.002 udMinEdge step.",
    };
  }
  const combinedNeeded = tStar;
  const udMinEdge = Math.min(baselineUdMinEdge, Math.max(combinedNeeded, standardPickMinLegEv));
  return {
    udMinEdge: round4(udMinEdge),
    rationale: "Set udMinEdge so max(udMinEdge, standardPickMinLegEv) matches minimal T* for goal leg count (standard-path simulation).",
  };
}

export function buildThresholdRebalancingAnalysis(root: string = process.cwd()) {
  const cli = getDefaultCliArgs();
  const ppBase = computePpRunnerLegEligibility(cli);
  const udBase = computeUdRunnerLegEligibility(cli);
  // @ts-ignore
  const udStd = computeUdFilterEvPicksStandardFloors(udBase.udVolume).standardPickMinLegEv;

  const { pp: ppPath, ud: udPath } = resolveLegPaths(root);

  const ppRaw = ppPath ? loadLegCsvWithPlayer(ppPath) : [];
  const udRaw = udPath ? loadLegCsvWithPlayer(udPath) : [];

  const ppEnriched = enrichLegsWithPlayer(ppRaw);
  const udEnriched = enrichLegsWithPlayer(udRaw);

  const ppBaselineSeq = ppEnriched.length
    // @ts-ignore
    ? ppSequentialMarketFairStages(ppEnriched, ppBase.minEdgePerLeg, ppBase.minLegEv, ppBase.adjustedEvThreshold)
    : null;
  const ppBinding = ppBaselineSeq ? ppBindingStageFromDrops(ppBaselineSeq.drops) : "none";
  // @ts-ignore
  const ppCombinedBaseline = ppCombinedFloor(ppBase.minEdgePerLeg, ppBase.minLegEv, ppBase.adjustedEvThreshold);

  const ppT = findMinimalCombinedFloorTStar(ppEnriched, ppBase.maxLegsPerPlayerGlobal, PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD);
  const ppRec = recommendPpThresholdsFromTStar(ppT.tStar, {
    // @ts-ignore
    minEdgePerLeg: ppBase.minEdgePerLeg,
    // @ts-ignore
    minLegEv: ppBase.minLegEv,
    // @ts-ignore
    adjustedEvThreshold: ppBase.adjustedEvThreshold,
  });

  const effSweep = ppEnriched.length
    ? sweepPpRelaxEffectiveEv(
        ppEnriched,
        {
        // @ts-ignore
          minEdgePerLeg: ppBase.minEdgePerLeg,
        // @ts-ignore
          minLegEv: ppBase.minLegEv,
        // @ts-ignore
          adjustedEvThreshold: ppBase.adjustedEvThreshold,
          maxLegsPerPlayer: ppBase.maxLegsPerPlayerGlobal,
        },
        [0.03, 0.0275, 0.025, 0.0225, 0.02, 0.0175, 0.015]
      )
    : [];

  const udGoalLegs = 8;
  const udBaselineCount = udEnriched.length ? udStandardPathCount(udEnriched, udBase.udMinEdge, udStd) : 0;
  const udT = udEnriched.length ? findMinimalUdCombinedFloorForGoal(udEnriched, udGoalLegs) : { tStar: null, maxLegs: 0, impossibleForGoal: true };
  const udRec = recommendUdMinEdgeFromTStar(udT.tStar, udBase.udMinEdge, udStd);

  const udCombined = udCombinedFloor(udBase.udMinEdge, udStd);

  return {
    schemaVersion: THRESHOLD_REBALANCING_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    phase: 74,
    prePhase74ReferenceDefaults: {
      note: "Historical runner defaults before Phase 74 code change (for delta context in audits).",
      pp: { adjustedEvThreshold: 0.03 },
      ud: { udMinEdge: 0.008 },
    },
    methodology: {
      signal: "marketEdgeFair (trueProb − fairProbChosenSide) — same as Phase 73 gating; no naive metrics.",
      ppSimulation:
        "Sequential stages minEdge → minLegEv → adjustedEv on marketEdgeFair; then FCFS player cap (max 1 per player, CSV order).",
      udSimulation:
        "Standard-path UD filter: marketEdgeFair >= udMinEdge && marketEdgeFair >= standardPickMinLegEv (matches Phase 72 CSV diagnosis; boosted pick factor path not in CSV).",
      ppGoalLegs: PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD,
      udGoalLegs,
    },
    sources: {
      prizepicksLegsCsv: ppPath ? path.relative(root, ppPath).replace(/\\/g, "/") : null,
      underdogLegsCsv: udPath ? path.relative(root, udPath).replace(/\\/g, "/") : null,
      cliPolicySource: "getDefaultCliArgs() + computePpRunnerLegEligibility / computeUdRunnerLegEligibility",
    },
    baseline: {
      pp: {
      // @ts-ignore
        minEdgePerLeg: ppBase.minEdgePerLeg,
      // @ts-ignore
        minLegEv: ppBase.minLegEv,
      // @ts-ignore
        adjustedEvThreshold: ppBase.adjustedEvThreshold,
        combinedFloor: ppCombinedBaseline,
        maxLegsPerPlayerGlobal: ppBase.maxLegsPerPlayerGlobal,
        volumeMode: ppBase.volumeMode,
      },
      ud: {
        udMinEdge: udBase.udMinEdge,
        udMinLegEv: udBase.udMinLegEv,
        standardPickMinLegEv: udStd,
        udVolume: udBase.udVolume,
        combinedFloor: udCombined,
      },
    },
    pp: {
      legCountInCsv: ppRaw.length,
      bindingStage: ppBinding,
      stageDrops: ppBaselineSeq?.drops ?? [],
      survivalAfterBaselineSequential: ppBaselineSeq
        ? {
            afterMinEdge: ppBaselineSeq.afterMinEdge,
            afterMinLegEv: ppBaselineSeq.afterMinLegEv,
            afterEffectiveEv: ppBaselineSeq.afterEffectiveEv,
          }
        : null,
      afterPlayerCapAtBaselineCombined: ppEnriched.length
        ? countPpAfterCombinedFloorAndCap(ppEnriched, ppCombinedBaseline, ppBase.maxLegsPerPlayerGlobal)
        : 0,
      minimalCombinedFloorSearch: ppT,
      sensitivitySweepEffectiveEv: effSweep,
      recommended: ppRec,
    },
    ud: {
      legCountInCsv: udRaw.length,
      baselineStandardPathCount: udBaselineCount,
      minimalCombinedFloorForGoal: udT,
      recommended: udRec,
    },
    riskAssessment: {
      pp:
        "Lowering effective EV / combined floor increases tail inclusion; prefer smallest T* or smallest eff reduction that clears PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD.",
      ud:
        "Lowering udMinEdge raises false-positive rate vs market; verify with tracker CLV after deploy.",
      data:
        "If prizepicks-legs.csv has fewer than 6 legs, no threshold can unlock PP card build — merge/source issue.",
    },
  };
}

function renderMarkdown(data: ReturnType<typeof buildThresholdRebalancingAnalysis>): string {
  const lines: string[] = [];
  lines.push("# Threshold rebalancing analysis (Phase 74)");
  lines.push("");
  lines.push(`Generated: ${data.generatedAtUtc}`);
  lines.push("");
  lines.push("## Methodology");
  lines.push("```json");
  lines.push(JSON.stringify(data.methodology, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Baseline thresholds");
  lines.push("```json");
  lines.push(JSON.stringify(data.baseline, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## PP — binding / survival / recommendations");
  lines.push("```json");
  lines.push(JSON.stringify(data.pp, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## UD — survival / recommendations");
  lines.push("```json");
  lines.push(JSON.stringify(data.ud, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Risk");
  lines.push("```json");
  lines.push(JSON.stringify(data.riskAssessment, null, 2));
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

export function exportThresholdRebalancingAnalysis(options?: { cwd?: string }): {
  jsonPath: string;
  mdPath: string;
  report: ReturnType<typeof buildThresholdRebalancingAnalysis>;
} {
  const root = options?.cwd ?? process.cwd();
  const report = buildThresholdRebalancingAnalysis(root);
  const outDir = path.join(root, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_threshold_rebalancing_analysis.json");
  const mdPath = path.join(outDir, "latest_threshold_rebalancing_analysis.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");
  return { jsonPath, mdPath, report };
}

if (require.main === module) {
  const { jsonPath, mdPath } = exportThresholdRebalancingAnalysis();
  console.log(`[export:threshold-rebalancing-analysis] wrote ${jsonPath}`);
  console.log(`[export:threshold-rebalancing-analysis] wrote ${mdPath}`);
}
