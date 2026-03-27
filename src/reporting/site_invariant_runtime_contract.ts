/**
 * Phase 17T — End-to-end site-invariant runtime contract audit (repo-backed, deterministic, additive).
 * Does not change optimizer behavior; documents PP vs UD parity vs approved irreducible variance.
 */

import fs from "fs";
import path from "path";
import { stableStringifyForObservability } from "./final_selection_observability";

export const SITE_INVARIANT_RUNTIME_CONTRACT_SCHEMA_VERSION = 1 as const;

/** Overall contract outcome. */
export const SITE_INVARIANT_VERDICT_COMPLIANT = "compliant" as const;
export const SITE_INVARIANT_VERDICT_COMPLIANT_WITH_IRREDUCIBLE =
  "compliant_with_explicit_irreducible_differences" as const;
export const SITE_INVARIANT_VERDICT_NON_COMPLIANT = "non_compliant" as const;

export type SiteInvariantRuntimeVerdict =
  | typeof SITE_INVARIANT_VERDICT_COMPLIANT
  | typeof SITE_INVARIANT_VERDICT_COMPLIANT_WITH_IRREDUCIBLE
  | typeof SITE_INVARIANT_VERDICT_NON_COMPLIANT;

/** Per-stage divergence classification (when PP/UD implementations differ). */
export const DIVERGENCE_SHARED_SAME_CANONICAL_IMPLEMENTATION = "shared_same_canonical_implementation" as const;
export const DIVERGENCE_IRREDUCIBLE_PLATFORM_MATH = "irreducible_platform_math" as const;
export const DIVERGENCE_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS = "irreducible_platform_input_semantics" as const;
export const DIVERGENCE_NON_MATH_VARIANCE_BUG = "non_math_variance_bug" as const;

export type DivergenceClassification =
  | typeof DIVERGENCE_SHARED_SAME_CANONICAL_IMPLEMENTATION
  | typeof DIVERGENCE_IRREDUCIBLE_PLATFORM_MATH
  | typeof DIVERGENCE_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS
  | typeof DIVERGENCE_NON_MATH_VARIANCE_BUG;

export interface RuntimeContractStageRow {
  /** Matches `EVALUATION_BUCKET_ORDER` where applicable; reporting stages use stable ids. */
  stageId: string;
  /** Primary PP decision/module reference (repo-relative). */
  ppCanonicalSource: string;
  /** Primary UD decision/module reference (repo-relative). */
  udCanonicalSource: string;
  /** Whether both sites route material decision logic through the same canonical modules for this stage. */
  usesSharedCanonicalDecisionPath: boolean;
  divergenceClassification: DivergenceClassification;
  /** Short operator-facing explanation. */
  notes: string;
}

export interface SiteInvariantRuntimeContractReport {
  schemaVersion: typeof SITE_INVARIANT_RUNTIME_CONTRACT_SCHEMA_VERSION;
  generatedAtUtc: string;
  runTimestampEt: string | null;
  /** Declared at repo level — updated when contract rows change. */
  contractRevisionNote: string;
  stages: RuntimeContractStageRow[];
  retainedIrreducibleDifferences: string[];
  nonMathVarianceBugs: string[];
  overallVerdict: SiteInvariantRuntimeVerdict;
  /** How `overallVerdict` was derived. */
  verdictRationale: string;
}

const JSON_NAME = "latest_site_invariant_runtime_contract.json";
const MD_NAME = "latest_site_invariant_runtime_contract.md";

export function getSiteInvariantRuntimeContractPaths(cwd: string): {
  dir: string;
  jsonPath: string;
  mdPath: string;
} {
  const dir = path.join(cwd, "data", "reports");
  return {
    dir,
    jsonPath: path.join(dir, JSON_NAME),
    mdPath: path.join(dir, MD_NAME),
  };
}

/**
 * Authoritative contract table (Phase 17N–17S centralization).
 * `non_math_variance_bug` must remain empty unless a proven defect is tracked here.
 */
export function getSiteInvariantRuntimeContractStages(): RuntimeContractStageRow[] {
  return [
    {
      stageId: "ingest",
      ppCanonicalSource: "src/run_optimizer.ts → fetchPrizePicksRawProps (src/fetch_props.ts) | mock: createSyntheticEvPicks",
      udCanonicalSource: "src/run_underdog_optimizer.ts → fetchUnderdogRawPropsWithLogging (src/fetch_underdog_props.ts) | mock | shared legs",
      usesSharedCanonicalDecisionPath: false,
      divergenceClassification: DIVERGENCE_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS,
      notes:
        "Different sportsbook prop sources and schemas; orchestrated only in entrypoints. No shared raw-ingest module by design.",
    },
    {
      stageId: "normalize",
      ppCanonicalSource: "src/run_optimizer.ts → writePrizePicksImportedCsv (src/export_imported_csv.ts)",
      udCanonicalSource: "src/run_underdog_optimizer.ts → writeUnderdogImportedCsv",
      usesSharedCanonicalDecisionPath: false,
      divergenceClassification: DIVERGENCE_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS,
      notes: "Platform-specific CSV normalization; no EV/decision logic.",
    },
    {
      stageId: "match_merge",
      ppCanonicalSource: "src/merge_odds.ts → mergeWithSnapshot (shared OddsAPI snapshot rows)",
      udCanonicalSource: "src/merge_odds.ts → mergeWithSnapshot (shared OddsAPI snapshot rows)",
      usesSharedCanonicalDecisionPath: true,
      divergenceClassification: DIVERGENCE_SHARED_SAME_CANONICAL_IMPLEMENTATION,
      notes: "MATCH_MERGE_SHARED_ENTRYPOINT — both platforms consume the same merge path (see src/pipeline/evaluation_buckets.ts).",
    },
    {
      stageId: "shared_eligibility",
      ppCanonicalSource:
        "src/run_optimizer.ts guardrails + src/policy/runtime_decision_pipeline.ts (PP helpers) + src/policy/shared_leg_eligibility.ts (FCFS)",
      udCanonicalSource:
        "src/run_underdog_optimizer.ts guardrails + src/policy/runtime_decision_pipeline.ts → filterUdEvPicksCanonical + src/policy/shared_leg_eligibility.ts",
      usesSharedCanonicalDecisionPath: true,
      divergenceClassification: DIVERGENCE_IRREDUCIBLE_PLATFORM_MATH,
      notes:
        "Shared FCFS + export resolvers; UD adds factor-aware tiers and udMinEdge ordering (Phase 17N) — approved in APPROVED_PLATFORM_MATH_VARIANCE.",
    },
    {
      stageId: "platform_math",
      ppCanonicalSource:
        "src/calculate_ev.ts → calculateEvForMergedPicks; src/policy/runtime_decision_pipeline.ts → executePrizePicksLegEligibilityPipeline / PP_LEG_POLICY",
      udCanonicalSource:
        "src/calculate_ev.ts → calculateEvForMergedPicks; src/policy/ud_pick_factor.ts → udAdjustedLegEv; filterUdEvPicksCanonical",
      usesSharedCanonicalDecisionPath: true,
      divergenceClassification: DIVERGENCE_IRREDUCIBLE_PLATFORM_MATH,
      notes:
        "Same EV core; UD payout factor + std/boost floors are platform math (see src/pipeline/evaluation_buckets.ts APPROVED_PLATFORM_MATH_VARIANCE).",
    },
    {
      stageId: "structure_evaluation",
      ppCanonicalSource:
        "src/run_optimizer.ts → buildCardsForSize + src/card_ev.ts evaluateFlexCard + src/policy/shared_card_construction_gates.ts",
      udCanonicalSource:
        "src/run_underdog_optimizer.ts → buildUdCardsFromFiltered + src/underdog_card_ev.ts + src/policy/shared_card_construction_gates.ts",
      usesSharedCanonicalDecisionPath: true,
      divergenceClassification: DIVERGENCE_IRREDUCIBLE_PLATFORM_MATH,
      notes:
        "Shared structural gates/dedupe; card EV evaluators are platform-native (PP vs UD registry structures) — not duplicated in policy layer.",
    },
    {
      stageId: "selection_export",
      ppCanonicalSource:
        "src/policy/shared_final_selection_policy.ts + src/policy/shared_post_eligibility_optimization.ts + src/policy/shared_leg_eligibility.ts (export caps)",
      udCanonicalSource: "src/policy/shared_final_selection_policy.ts + shared_post_eligibility_optimization + shared_leg_eligibility",
      usesSharedCanonicalDecisionPath: true,
      divergenceClassification: DIVERGENCE_SHARED_SAME_CANONICAL_IMPLEMENTATION,
      notes:
        "Final selection + export slice are centralized (Phase 17Q). Resolvers resolvePrizePicksRunnerExportCardLimit vs resolveUnderdogRunnerExportCardCap differ by CLI flags only.",
    },
    {
      stageId: "render_input",
      ppCanonicalSource: "src/run_optimizer.ts render_input bucket (innovative / tracker / diagnostics — feature-flagged)",
      udCanonicalSource: "src/run_underdog_optimizer.ts render_input bucket (no-op placeholder; card writes occur in selection_export per 17L contract)",
      usesSharedCanonicalDecisionPath: true,
      divergenceClassification: DIVERGENCE_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS,
      notes:
        "Entrypoint orchestration only; PP may emit extra diagnostics. No duplicate card EV or selection logic in render_input.",
    },
    {
      stageId: "final_selection_observability",
      ppCanonicalSource: "src/reporting/final_selection_observability.ts ← PP tail arrays from shared pipeline",
      udCanonicalSource: "src/reporting/final_selection_observability.ts ← UdRunResult from shared pipeline (Phase 17R)",
      usesSharedCanonicalDecisionPath: true,
      divergenceClassification: DIVERGENCE_SHARED_SAME_CANONICAL_IMPLEMENTATION,
      notes: "Observability reads live pipeline arrays — not reconstructed from CSV.",
    },
    {
      stageId: "final_selection_reason_attribution",
      ppCanonicalSource: "src/reporting/final_selection_reason_attribution.ts + src/policy/shared_final_selection_policy.ts attribution helpers",
      udCanonicalSource: "Same reporting + policy modules; UD uses attributeFinalSelectionUdFormatEntries",
      usesSharedCanonicalDecisionPath: true,
      divergenceClassification: DIVERGENCE_SHARED_SAME_CANONICAL_IMPLEMENTATION,
      notes: "Phase 17S — reasons tied to SelectionEngine-equivalent attribution batch helpers.",
    },
  ];
}

function computeVerdict(
  stages: RuntimeContractStageRow[],
  explicitNonMathBugs: string[]
): { verdict: SiteInvariantRuntimeVerdict; rationale: string } {
  const bugsInStages = stages.filter((s) => s.divergenceClassification === DIVERGENCE_NON_MATH_VARIANCE_BUG);
  if (explicitNonMathBugs.length > 0 || bugsInStages.length > 0) {
    return {
      verdict: SITE_INVARIANT_VERDICT_NON_COMPLIANT,
      rationale: `non_math_variance_bug present: ${explicitNonMathBugs.length} tracked issue(s); ${bugsInStages.length} stage row(s).`,
    };
  }
  const hasIrreducible = stages.some(
    (s) =>
      s.divergenceClassification === DIVERGENCE_IRREDUCIBLE_PLATFORM_MATH ||
      s.divergenceClassification === DIVERGENCE_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS
  );
  if (hasIrreducible) {
    return {
      verdict: SITE_INVARIANT_VERDICT_COMPLIANT_WITH_IRREDUCIBLE,
      rationale:
        "No non-math variance bugs in contract table; PP/UD differences are classified as irreducible platform math or input semantics only.",
    };
  }
  return {
    verdict: SITE_INVARIANT_VERDICT_COMPLIANT,
    rationale: "All audited stages report shared canonical implementation with no irreducible divergences in table.",
  };
}

export function buildRetainedIrreducibleDifferencesList(stages: RuntimeContractStageRow[]): string[] {
  const out: string[] = [];
  for (const s of stages) {
    if (
      s.divergenceClassification === DIVERGENCE_IRREDUCIBLE_PLATFORM_MATH ||
      s.divergenceClassification === DIVERGENCE_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS
    ) {
      out.push(`[${s.stageId}] ${s.divergenceClassification}: ${s.notes}`);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function buildSiteInvariantRuntimeContractReport(params: {
  generatedAtUtc: string;
  runTimestampEt: string | null;
  /** Append-only list of proven non-math bugs; default none. */
  explicitNonMathVarianceBugs?: string[];
}): SiteInvariantRuntimeContractReport {
  const stages = getSiteInvariantRuntimeContractStages();
  const nonMathVarianceBugs = [...(params.explicitNonMathVarianceBugs ?? [])].sort((a, b) => a.localeCompare(b));
  const { verdict, rationale } = computeVerdict(stages, nonMathVarianceBugs);
  const retainedIrreducibleDifferences = buildRetainedIrreducibleDifferencesList(stages);

  return {
    schemaVersion: SITE_INVARIANT_RUNTIME_CONTRACT_SCHEMA_VERSION,
    generatedAtUtc: params.generatedAtUtc,
    runTimestampEt: params.runTimestampEt,
    contractRevisionNote:
      "Phase 17T baseline — aligns with EVALUATION_BUCKET_ORDER, Phase 17N–17S shared modules, APPROVED_PLATFORM_MATH_VARIANCE in evaluation_buckets.ts.",
    stages,
    retainedIrreducibleDifferences,
    nonMathVarianceBugs,
    overallVerdict: verdict,
    verdictRationale: rationale,
  };
}

export function formatSiteInvariantRuntimeContractMarkdown(report: SiteInvariantRuntimeContractReport): string {
  const lines: string[] = [];
  lines.push("# Site-invariant runtime contract audit");
  lines.push("");
  lines.push(`- **schemaVersion:** ${report.schemaVersion}`);
  lines.push(`- **generatedAtUtc:** ${report.generatedAtUtc}`);
  lines.push(`- **runTimestampEt:** ${report.runTimestampEt ?? "— (static audit write)"}`);
  lines.push(`- **overallVerdict:** \`${report.overallVerdict}\``);
  lines.push(`- **verdictRationale:** ${report.verdictRationale}`);
  lines.push(`- **contractRevisionNote:** ${report.contractRevisionNote}`);
  lines.push("");

  lines.push("## Overall verdict");
  lines.push(`- **${report.overallVerdict}**`);
  lines.push("");

  lines.push("## Retained irreducible differences");
  if (report.retainedIrreducibleDifferences.length === 0) {
    lines.push("- (none in contract table)");
  } else {
    for (const r of report.retainedIrreducibleDifferences) {
      lines.push(`- ${r}`);
    }
  }
  lines.push("");

  lines.push("## Non-math variance bugs (must be empty for production contract)");
  if (report.nonMathVarianceBugs.length === 0) {
    lines.push("- **none recorded**");
  } else {
    for (const b of report.nonMathVarianceBugs) {
      lines.push(`- **BUG:** ${b}`);
    }
  }
  lines.push("");

  lines.push("## Stage-by-stage contract");
  for (const s of report.stages) {
    lines.push(`### ${s.stageId}`);
    lines.push(`- **divergenceClassification:** \`${s.divergenceClassification}\``);
    lines.push(`- **usesSharedCanonicalDecisionPath:** ${s.usesSharedCanonicalDecisionPath}`);
    lines.push(`- **PP:** ${s.ppCanonicalSource}`);
    lines.push(`- **UD:** ${s.udCanonicalSource}`);
    lines.push(`- **notes:** ${s.notes}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function writeSiteInvariantRuntimeContractArtifacts(
  cwd: string,
  report: SiteInvariantRuntimeContractReport
): void {
  const { dir, jsonPath, mdPath } = getSiteInvariantRuntimeContractPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, stableStringifyForObservability(report), "utf8");
  fs.writeFileSync(mdPath, formatSiteInvariantRuntimeContractMarkdown(report), "utf8");
}

/** Convenience: build + write with timestamps from a run. */
export function writeSiteInvariantRuntimeContractFromRun(cwd: string, runTimestampEt: string | null): void {
  const report = buildSiteInvariantRuntimeContractReport({
    generatedAtUtc: new Date().toISOString(),
    runTimestampEt,
  });
  writeSiteInvariantRuntimeContractArtifacts(cwd, report);
}
