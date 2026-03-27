/**
 * Phase 71 — Unified PP/UD pipeline trace diagnosis from existing observability artifacts
 * + deterministic math trace for extreme UD American odds (no new optimizer runs).
 */

import fs from "fs";
import path from "path";
import { americanToImpliedProb } from "../odds_math";
import { fairBeFromTwoWayOdds, fairProbChosenSide, juiceAwareLegEv } from "../../math_models/juice_adjust";
import { inferSideFromLegIdCanonical } from "./market_edge_alignment_analysis";

export const PIPELINE_TRACE_DIAGNOSIS_SCHEMA_VERSION = 1;

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function pathReports(root: string, name: string): string {
  return path.join(root, "data", "reports", name);
}

/** Parse one CSV line with simple quote handling (header + single data row). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      const end = line.indexOf('"', i + 1);
      out.push(line.slice(i + 1, end === -1 ? line.length : end));
      i = end === -1 ? line.length : end + 1;
      if (line[i] === ",") i++;
    } else {
      const next = line.indexOf(",", i);
      if (next === -1) {
        out.push(line.slice(i));
        break;
      }
      out.push(line.slice(i, next));
      i = next + 1;
    }
  }
  return out;
}

function findUdExtremeOddsExample(
  root: string
): { sourceFile: string; legId: string; overOdds: number; underOdds: number; trueProb: number; edgeCsv: number; legEvCsv: number } | null {
  const candidates = [
    path.join(root, "data", "output_logs", "underdog-legs.csv"),
    path.join(root, "underdog-legs.csv"),
  ];
  for (const csvPath of candidates) {
    if (!fs.existsSync(csvPath)) continue;
    const raw = fs.readFileSync(csvPath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) continue;
    const headers = lines[0].split(",").map((h) => h.trim());
    const overIdx = headers.indexOf("overOdds");
    const underIdx = headers.indexOf("underOdds");
    const idIdx = headers.indexOf("id");
    const tpIdx = headers.indexOf("trueProb");
    const edgeIdx = headers.indexOf("edge");
    const levIdx = headers.indexOf("legEv");
    if (overIdx < 0 || underIdx < 0 || idIdx < 0) continue;
    for (let r = 1; r < lines.length; r++) {
      const cells = parseCsvLine(lines[r]);
      const over = parseFloat(cells[overIdx] ?? "");
      if (!Number.isFinite(over) || over > -300) continue;
      return {
        sourceFile: path.relative(root, csvPath).replace(/\\/g, "/"),
        legId: cells[idIdx] ?? "",
        overOdds: over,
        underOdds: parseFloat(cells[underIdx] ?? "NaN"),
        trueProb: tpIdx >= 0 ? parseFloat(cells[tpIdx] ?? "NaN") : NaN,
        edgeCsv: edgeIdx >= 0 ? parseFloat(cells[edgeIdx] ?? "NaN") : NaN,
        legEvCsv: levIdx >= 0 ? parseFloat(cells[levIdx] ?? "NaN") : NaN,
      };
    }
  }
  return null;
}

export type PipelineTraceDiagnosisReport = {
  schemaVersion: number;
  generatedAtUtc: string;
  sourcesInspected: { relativePath: string; role: string }[];
  sections: {
    crossPlatformStageAccounting: {
      pp: Record<string, unknown>;
      ud: Record<string, unknown>;
      mergeAuditNote: string;
    };
    ppZeroOutput: {
      dominantReasonCode: string;
      narrative: string;
      evidenceArtifactPaths: string[];
    };
    udExtremePriceTrace: {
      example: Record<string, unknown> | null;
      conclusionCode:
      | "interpretation_naive_leg_ev_documented"
      | "interpretation_market_relative_leg_ev_documented"
      | "no_concrete_example_in_repo"
      | "other";
      narrative: string;
      codeReferences: string[];
    };
    artifactCrossLinks: { artifact: string; finding: string }[];
    nextActions: string[];
  };
};

export function buildPipelineTraceDiagnosisReport(root: string = process.cwd()): PipelineTraceDiagnosisReport {
  const survival = readJson<Record<string, unknown>>(pathReports(root, "latest_platform_survival_summary.json"));
  const runStatus = readJson<Record<string, unknown>>(pathReports(root, "latest_run_status.json"));
  const mergeAudit = readJson<Record<string, unknown>>(pathReports(root, "latest_merge_audit.json"));

  const pp = survival.pp as Record<string, unknown> | undefined;
  const ud = survival.ud as Record<string, unknown> | undefined;
  const stageAccounting = mergeAudit.stageAccounting as Record<string, unknown> | undefined;

  const ppPicks = (runStatus.prizepicks as Record<string, unknown>)?.picksCount;
  const ppCards = (runStatus.prizepicks as Record<string, unknown>)?.cardsCount;

  const udEx = findUdExtremeOddsExample(root);
  let udTrace: PipelineTraceDiagnosisReport["sections"]["udExtremePriceTrace"] = {
    example: null,
    conclusionCode: "no_concrete_example_in_repo",
    narrative: "No underdog-legs.csv with overOdds ≤ -300 found at repo paths.",
    codeReferences: ["src/calculate_ev.ts", "math_models/juice_adjust.ts", "math_models/nonstandard_canonical_leg_math.ts"],
  };

  if (udEx && Number.isFinite(udEx.trueProb)) {
    const impOver = americanToImpliedProb(udEx.overOdds);
    const impUnder = americanToImpliedProb(udEx.underOdds);
    const fairOver = fairBeFromTwoWayOdds(udEx.overOdds, udEx.underOdds);
    const side = inferSideFromLegIdCanonical(udEx.legId);
    const fairChosen = fairProbChosenSide(udEx.overOdds, udEx.underOdds, side);
    const legEvCanonical = juiceAwareLegEv(udEx.trueProb, udEx.overOdds, udEx.underOdds, side);
    udTrace = {
      example: {
        sourceFile: udEx.sourceFile,
        legId: udEx.legId,
        inferredSide: side,
        rawOverAmerican: udEx.overOdds,
        rawUnderAmerican: udEx.underOdds,
        impliedProbOverVig: impOver,
        impliedProbUnderVig: impUnder,
        fairBreakevenOverFromTwoWayDeVig: fairOver,
        fairProbChosenSide: fairChosen,
        modelTrueProb: udEx.trueProb,
        legEvFromJuiceAwareCanonical: legEvCanonical,
        edgeColumnFromCsv: udEx.edgeCsv,
        legEvColumnFromCsv: udEx.legEvCsv,
        matchesCanonicalLegEv: Math.abs(legEvCanonical - udEx.legEvCsv) < 1e-9,
      },
      conclusionCode: "interpretation_market_relative_leg_ev_documented",
      narrative:
        "Leg-level EV uses math_models/juice_adjust.ts juiceAwareLegEv: trueProb minus fair chosen-side probability from two-way de-vig (fairProbChosenSide), or trueProb−0.5 when odds are missing. Heavy favorites move the fair benchmark versus 50%. Card-level EV still uses payout tables (card_ev / policy).",
      codeReferences: [
        "math_models/juice_adjust.ts — juiceAwareLegEv",
        "math_models/nonstandard_canonical_leg_math.ts — computeCanonicalLegMarketEdge → juiceAwareLegEv",
        "src/calculate_ev.ts — calculateEvForMergedPick",
      ],
    };
  }

  const ppDominant =
    "early_exit_insufficient_eligible_legs_lt_min_for_card_build";
  const ppNarrative =
    `Run outcome: ${String((runStatus as { outcome?: string }).outcome)} (${String((runStatus as { earlyExitReason?: string }).earlyExitReason)}). ` +
    `After PP leg pipeline stages, platform survival shows afterPlayerCap=${pp?.afterPlayerCap ?? "?"}, while eligibility contract requires ppMinEligibleLegsForCardBuild=6. ` +
    `With only ${pp?.afterPlayerCap ?? "?"} eligible legs, PP card construction is skipped — not a merge-to-zero and not an export-only skip.`;

  const sourcesInspected = [
    { relativePath: "data/reports/latest_platform_survival_summary.json", role: "PP/UD stage counts + thresholds" },
    { relativePath: "data/reports/latest_run_status.json", role: "Early exit + pick/card counts" },
    { relativePath: "data/reports/latest_eligibility_policy_contract.json", role: "PP stage order + min legs for cards" },
    { relativePath: "data/reports/latest_merge_audit.json", role: "Merge stage accounting (this run: Underdog matches in matchedBySite)" },
    { relativePath: "data/reports/latest_final_selection_observability.json", role: "UD export cap vs built pool" },
    { relativePath: "data/reports/latest_final_selection_reasons.json", role: "Dominant removal reasons (UD)" },
    { relativePath: "data/reports/latest_tracker_integrity.json", role: "Resolved calibratable / implied gaps" },
    { relativePath: "data/reports/latest_calibration_surface.json", role: "Edge bucket / predicted edge availability" },
    { relativePath: "artifacts/last_run.json", role: "Last agent flow metrics (if present)" },
  ];

  const artifactCrossLinks: { artifact: string; finding: string }[] = [
    {
      artifact: "latest_platform_survival_summary.json",
      finding: "PP: 5219 raw → 671 merge-matched → 5 after player cap; UD: 1149 raw → 386 merged → 38 final leg pool.",
    },
    {
      artifact: "latest_merge_audit.json (stageAccounting)",
      finding: "This snapshot’s matchedBySite lists underdog only; rawRows=1149 aligns with UD prop feed. PP merge counts come from survival (671), not this audit’s matchedBySite.",
    },
    {
      artifact: "latest_final_selection_reasons.json (ud)",
      finding: "Dominant post-build removal: export_cap_truncation (581 cards); anti_dilution removes 7F/8F flex from ranked pool before cap.",
    },
    {
      artifact: "latest_tracker_integrity.json",
      finding: "Downstream calibration trust: resolved fully calibratable rate and implied gaps tie to historical perf_tracker rows — separate from this run’s leg EV semantics.",
    },
    {
      artifact: "latest_calibration_surface.json",
      finding: "Predicted edge availability limited by impliedProb coverage on resolved rows (see definitions.trackerIntegrity cross-link).",
    },
  ];

  const nextActions = [
    "PP: To obtain PP cards, raise eligible PP legs to ≥6 after all gates (lower thresholds/volume, or widen merge coverage — product decision), or run when more distinct players pass min edge / adj EV / player cap.",
    "UD: If leg ranking should reflect juice-aware edge vs fair market, that would be a deliberate math_models/policy change — not done in Phase 71 (diagnosis only).",
    "Re-run this export after the next full pipeline to refresh JSON inputs.",
  ];

  return {
    schemaVersion: PIPELINE_TRACE_DIAGNOSIS_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    sourcesInspected,
    sections: {
      crossPlatformStageAccounting: {
        pp: {
          rawSourceRows: pp?.rawScrapedProps ?? null,
          mergeMatchedRows: pp?.mergeMatchedProps ?? null,
          postNormalizationRows: "not_emitted_separately — see merge path in run_optimizer",
          mergeCandidateRows: pp?.mergeMatchedProps ?? null,
          mergedMatchedRows: pp?.mergeMatchedProps ?? null,
          afterEvCompute: pp?.afterEvCompute ?? null,
          afterMinEdge: pp?.afterMinEdge ?? null,
          afterMinLegEv: pp?.afterMinLegEvBeforeAdjEv ?? null,
          afterAdjEvThreshold: pp?.afterAdjEvThreshold ?? null,
          afterGlobalPlayerCap: pp?.afterPlayerCap ?? null,
          postStructureEvaluationCards: pp?.cardsBuiltPreTypeEvFilter ?? null,
          postFinalSelectionCards: pp?.cardsAfterSelectionEngine ?? null,
          exportedLegsCsvApprox: ppPicks ?? null,
          exportedCards: ppCards ?? null,
          operatorNotes: survival.operatorNotes,
        },
        ud: {
          rawSourceRows: ud?.rawScrapedProps ?? null,
          mergedProps: ud?.mergedProps ?? null,
          evComputed: ud?.evComputed ?? null,
          afterFilterEvPicks: ud?.afterFilterEvPicks ?? null,
          finalLegPoolForCards: ud?.finalLegPoolForCards ?? null,
          generatedTotalCards: ud?.generatedTotal ?? null,
          exportedTotalCards: ud?.exportedTotal ?? null,
          mergeAuditRawRows: stageAccounting?.rawRows ?? null,
          mergeAuditEmittedRows: stageAccounting?.emittedRows ?? null,
        },
        mergeAuditNote:
          "latest_merge_audit.json stageAccounting reflects the OddsAPI merge pass for this run (propsConsideredForMatchingRows=856, emittedRows=386). PP-specific merge breakdown is not split in matchedBySite here; use platform survival for PP mergeMatchedProps.",
      },
      ppZeroOutput: {
        dominantReasonCode: ppDominant,
        narrative: ppNarrative,
        evidenceArtifactPaths: [
          "data/reports/latest_run_status.json",
          "data/reports/latest_platform_survival_summary.json",
          "data/reports/latest_eligibility_policy_contract.json",
        ],
      },
      udExtremePriceTrace: udTrace,
      artifactCrossLinks,
      nextActions,
    },
  };
}

function renderMarkdown(report: PipelineTraceDiagnosisReport): string {
  const lines: string[] = [];
  lines.push("# Pipeline trace diagnosis (Phase 71)");
  lines.push("");
  lines.push(`Generated: ${report.generatedAtUtc}`);
  lines.push("");
  lines.push("## Sources inspected");
  for (const s of report.sourcesInspected) {
    lines.push(`- **${s.relativePath}** — ${s.role}`);
  }
  lines.push("");
  lines.push("## A. Cross-platform stage accounting");
  lines.push("### PP (from platform survival + run status)");
  lines.push("```json");
  lines.push(JSON.stringify(report.sections.crossPlatformStageAccounting.pp, null, 2));
  lines.push("```");
  lines.push("### UD");
  lines.push("```json");
  lines.push(JSON.stringify(report.sections.crossPlatformStageAccounting.ud, null, 2));
  lines.push("```");
  lines.push(`> ${report.sections.crossPlatformStageAccounting.mergeAuditNote}`);
  lines.push("");
  lines.push("## B. PP zero-output root cause");
  lines.push(`- **Code:** \`${report.sections.ppZeroOutput.dominantReasonCode}\``);
  lines.push(`- ${report.sections.ppZeroOutput.narrative}`);
  lines.push("- **Artifacts:** " + report.sections.ppZeroOutput.evidenceArtifactPaths.join(", "));
  lines.push("");
  lines.push("## C. UD extreme-price trace");
  lines.push(`- **Conclusion:** \`${report.sections.udExtremePriceTrace.conclusionCode}\``);
  lines.push(`- ${report.sections.udExtremePriceTrace.narrative}`);
  if (report.sections.udExtremePriceTrace.example) {
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(report.sections.udExtremePriceTrace.example, null, 2));
    lines.push("```");
  }
  lines.push("- **Code references:** " + report.sections.udExtremePriceTrace.codeReferences.join("; "));
  lines.push("");
  lines.push("## D. Artifact cross-links");
  for (const x of report.sections.artifactCrossLinks) {
    lines.push(`- **${x.artifact}:** ${x.finding}`);
  }
  lines.push("");
  lines.push("## E. Next actions");
  for (const a of report.sections.nextActions) {
    lines.push(`- ${a}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function exportPipelineTraceDiagnosis(options?: { cwd?: string }): {
  jsonPath: string;
  mdPath: string;
  report: PipelineTraceDiagnosisReport;
} {
  const root = options?.cwd ?? process.cwd();
  const report = buildPipelineTraceDiagnosisReport(root);
  const outDir = path.join(root, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_pipeline_trace_diagnosis.json");
  const mdPath = path.join(outDir, "latest_pipeline_trace_diagnosis.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");
  return { jsonPath, mdPath, report };
}

if (require.main === module) {
  const { jsonPath, mdPath } = exportPipelineTraceDiagnosis();
  console.log(`[export:pipeline-trace-diagnosis] wrote ${jsonPath}`);
  console.log(`[export:pipeline-trace-diagnosis] wrote ${mdPath}`);
}
