/**
 * Phase 17U / 17V — Repo hygiene and dead-code audit (deterministic, additive).
 * Classifies maintenance candidates; does not auto-delete. Safe removals and Phase 17V archive/remove execution are recorded when applied in-repo.
 */

import fs from "fs";
import path from "path";
import { stableStringifyForObservability } from "./final_selection_observability";

export const REPO_HYGIENE_AUDIT_SCHEMA_VERSION = 2 as const;

/** Exactly one bucket per candidate. */
export const REPO_HYGIENE_SAFE_REMOVE = "safe_remove" as const;
export const REPO_HYGIENE_SAFE_ARCHIVE = "safe_archive" as const;
export const REPO_HYGIENE_KEEP_ACTIVE = "keep_active" as const;
export const REPO_HYGIENE_KEEP_NEEDS_REVIEW = "keep_needs_review" as const;

export type RepoHygieneClassification =
  | typeof REPO_HYGIENE_SAFE_REMOVE
  | typeof REPO_HYGIENE_SAFE_ARCHIVE
  | typeof REPO_HYGIENE_KEEP_ACTIVE
  | typeof REPO_HYGIENE_KEEP_NEEDS_REVIEW;

export interface RepoHygieneCandidate {
  /** Repo-relative POSIX-style path or stable id (e.g. stale-doc-reference). */
  candidatePath: string;
  classification: RepoHygieneClassification;
  rationale: string;
  /** Canonical replacement / owner module when superseded. */
  canonicalOwnerOrReplacement: string | null;
}

export interface RepoHygieneAuditReport {
  schemaVersion: typeof REPO_HYGIENE_AUDIT_SCHEMA_VERSION;
  generatedAtUtc: string;
  runTimestampEt: string | null;
  auditRevisionNote: string;
  candidates: RepoHygieneCandidate[];
  /** Human-readable actions completed during the Phase 17U pass (may be empty). */
  safeRemovalsPerformed: string[];
  /** Phase 17V: evidence-backed archive moves (reversible). */
  archivedThisPhase: string[];
  /** Phase 17V: file deletes only when zero active references (this pass may be empty). */
  removedThisPhase: string[];
  /** Phase 17V: deferred or ambiguous items not executed. */
  skippedNeedsReview: string[];
  summaryLine: string;
}

const JSON_NAME = "latest_repo_hygiene_audit.json";
const MD_NAME = "latest_repo_hygiene_audit.md";

export function getRepoHygieneAuditPaths(cwd: string): {
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
 * Curated audit snapshot (Phase 17U baseline). Update when architecture or ownership changes.
 * `safe_remove` entries must have strong evidence before acting; list resolved items in `safeRemovalsPerformed` at write time.
 */
export function getRepoHygieneAuditCandidates(): RepoHygieneCandidate[] {
  return [
    {
      candidatePath: "math_models/**",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Canonical breakeven / registry / combinatorics — never treated as dead code.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/policy/runtime_decision_pipeline.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Phase 17K+ canonical PP/UD leg eligibility; replaces scattered runner thresholds.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/policy/shared_leg_eligibility.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Phase 17N FCFS + export resolvers shared by PP/UD.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/policy/shared_card_construction_gates.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Phase 17O shared structural gates + dedupe.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/policy/shared_post_eligibility_optimization.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Phase 17P shared ranking / duplicate-player penalty.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/policy/shared_final_selection_policy.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Phase 17Q–17S final selection + attribution hooks.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/pipeline/evaluation_buckets.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Phase 17L canonical bucket order + runBucketSlice.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/reporting/final_selection_observability.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Phase 17R observability from pipeline arrays.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/reporting/final_selection_reason_attribution.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Phase 17S reason attribution from shared policy helpers.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/reporting/site_invariant_runtime_contract.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Phase 17T runtime contract table.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "docs/PROJECT_STATE.md",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Authoritative project state; required living doc.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "stale-doc-reference:refactor_report.md",
      classification: REPO_HYGIENE_SAFE_REMOVE,
      rationale: "Broken reference to non-existent refactor_report.md in PROJECT_STATE (Phase 17U hygiene fix).",
      canonicalOwnerOrReplacement: "docs/PROJECT_STATE.md (self-contained)",
    },
    {
      candidatePath: "tests/phase16_tier1_scarcity_attribution.spec.ts",
      classification: REPO_HYGIENE_KEEP_NEEDS_REVIEW,
      rationale: "Tier1 scarcity tests exist but were outside verify:canonical until Phase 17U alignment.",
      canonicalOwnerOrReplacement: "npm run verify:canonical (add spec to bundle)",
    },
    {
      candidatePath: "src/fetch_props.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Active PrizePicks projections fetch for run_optimizer / fantasy_analyzer / run_nfl_raw_export.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/fetch_oddsapi_props.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Primary Odds API fetch for snapshot + merge.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/fetch_oddsapi_legacy_alias.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale:
        "Phase 17W canonical module: OddsAPI legacy alias (fetchSgoPlayerPropOdds + DEFAULT_MARKETS re-export). Primary script import: report_single_bet_ev.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "src/fetch_oddsapi_odds.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale:
        "Phase 17W compatibility shim: re-exports fetch_oddsapi_legacy_alias.ts for legacy import paths (explicit re-export only).",
      canonicalOwnerOrReplacement: "src/fetch_oddsapi_legacy_alias.ts",
    },
    {
      candidatePath: "src/scripts/scrape_underdog_champions.ts",
      classification: REPO_HYGIENE_KEEP_NEEDS_REVIEW,
      rationale: "Manual Playwright CLI (not package.json); supports underdog_props_scraped.json for UD ingest.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "tools/archive/validation/tweak_backtest.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale:
        "Phase 17V: offline tweak backtest CLI archived here (moved from src/validation/tweak_backtest.ts); not wired to optimizer entrypoints.",
      canonicalOwnerOrReplacement: "Manual: npx ts-node tools/archive/validation/tweak_backtest.ts",
    },
    {
      candidatePath: "src/server.ts",
      classification: REPO_HYGIENE_KEEP_ACTIVE,
      rationale: "Express dashboard API — active server-side path for web-dashboard.",
      canonicalOwnerOrReplacement: null,
    },
    {
      candidatePath: "dist/**",
      classification: REPO_HYGIENE_KEEP_NEEDS_REVIEW,
      rationale: "Build output — gitignored; should not be hand-edited or treated as source.",
      canonicalOwnerOrReplacement: "TypeScript build",
    },
  ].sort((a, b) => a.candidatePath.localeCompare(b.candidatePath));
}

export function buildRepoHygieneAuditReport(params: {
  generatedAtUtc: string;
  runTimestampEt: string | null;
  safeRemovalsPerformed: string[];
  archivedThisPhase?: string[];
  removedThisPhase?: string[];
  skippedNeedsReview?: string[];
}): RepoHygieneAuditReport {
  const candidates = getRepoHygieneAuditCandidates();
  const countBy = (cl: RepoHygieneClassification) => candidates.filter((x) => x.classification === cl).length;
  const archivedThisPhase = [...(params.archivedThisPhase ?? [])].sort((a, b) => a.localeCompare(b));
  const removedThisPhase = [...(params.removedThisPhase ?? [])].sort((a, b) => a.localeCompare(b));
  const skippedNeedsReview = [...(params.skippedNeedsReview ?? [])].sort((a, b) => a.localeCompare(b));
  const summaryLine = [
    `candidates=${candidates.length}`,
    `safe_remove=${countBy(REPO_HYGIENE_SAFE_REMOVE)}`,
    `safe_archive=${countBy(REPO_HYGIENE_SAFE_ARCHIVE)}`,
    `keep_active=${countBy(REPO_HYGIENE_KEEP_ACTIVE)}`,
    `keep_needs_review=${countBy(REPO_HYGIENE_KEEP_NEEDS_REVIEW)}`,
    `safe_removals_applied=${params.safeRemovalsPerformed.length}`,
    `archived_this_phase=${archivedThisPhase.length}`,
    `removed_this_phase=${removedThisPhase.length}`,
    `skipped_needs_review=${skippedNeedsReview.length}`,
  ].join("; ");

  return {
    schemaVersion: REPO_HYGIENE_AUDIT_SCHEMA_VERSION,
    generatedAtUtc: params.generatedAtUtc,
    runTimestampEt: params.runTimestampEt,
    auditRevisionNote:
      "Phase 17U baseline — curated classifications; Phase 17V adds archivedThisPhase / removedThisPhase / skippedNeedsReview execution fields. Conservative execution only.",
    candidates,
    safeRemovalsPerformed: [...params.safeRemovalsPerformed].sort((a, b) => a.localeCompare(b)),
    archivedThisPhase,
    removedThisPhase,
    skippedNeedsReview,
    summaryLine,
  };
}

export function formatRepoHygieneAuditMarkdown(report: RepoHygieneAuditReport): string {
  const lines: string[] = [];
  lines.push("# Repo hygiene audit");
  lines.push("");
  lines.push(`- **schemaVersion:** ${report.schemaVersion}`);
  lines.push(`- **generatedAtUtc:** ${report.generatedAtUtc}`);
  lines.push(`- **runTimestampEt:** ${report.runTimestampEt ?? "—"}`);
  lines.push(`- **summary:** ${report.summaryLine}`);
  lines.push(`- **auditRevisionNote:** ${report.auditRevisionNote}`);
  lines.push("");

  lines.push("## Safe removals performed (this pass)");
  if (report.safeRemovalsPerformed.length === 0) {
    lines.push("- (none)");
  } else {
    for (const s of report.safeRemovalsPerformed) {
      lines.push(`- ${s}`);
    }
  }
  lines.push("");

  lines.push("## Archived this phase (Phase 17V)");
  if (report.archivedThisPhase.length === 0) {
    lines.push("- (none)");
  } else {
    for (const s of report.archivedThisPhase) {
      lines.push(`- ${s}`);
    }
  }
  lines.push("");

  lines.push("## Removed this phase (Phase 17V)");
  if (report.removedThisPhase.length === 0) {
    lines.push("- (none)");
  } else {
    for (const s of report.removedThisPhase) {
      lines.push(`- ${s}`);
    }
  }
  lines.push("");

  lines.push("## Skipped (needs review)");
  if (report.skippedNeedsReview.length === 0) {
    lines.push("- (none)");
  } else {
    for (const s of report.skippedNeedsReview) {
      lines.push(`- ${s}`);
    }
  }
  lines.push("");

  lines.push("## Candidates (sorted by path)");
  for (const c of report.candidates) {
    lines.push(`### \`${c.candidatePath}\``);
    lines.push(`- **classification:** \`${c.classification}\``);
    lines.push(`- **rationale:** ${c.rationale}`);
    lines.push(`- **canonicalOwnerOrReplacement:** ${c.canonicalOwnerOrReplacement ?? "—"}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function writeRepoHygieneAuditArtifacts(cwd: string, report: RepoHygieneAuditReport): void {
  const { dir, jsonPath, mdPath } = getRepoHygieneAuditPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, stableStringifyForObservability(report), "utf8");
  fs.writeFileSync(mdPath, formatRepoHygieneAuditMarkdown(report), "utf8");
}

/** Default safe removals already applied in-repo for Phase 17U (documentation hygiene). */
export const PHASE17U_DEFAULT_SAFE_REMOVALS_PERFORMED = [
  "docs: removed broken external refactor-report link from PROJECT_STATE CURRENT_OBJECTIVE (living index is this file + Phase 17T)",
  "tests: added tests/phase16_tier1_scarcity_attribution.spec.ts to npm run verify:canonical bundle (was orphaned from canonical Jest run)",
] as const;

/** Evidence-backed archive moves executed in Phase 17V (conservative). */
export const PHASE17V_ARCHIVED_THIS_PHASE = [
  "src/validation/tweak_backtest.ts → tools/archive/validation/tweak_backtest.ts (offline CLI; not in src/ tsc root; run: npx ts-node tools/archive/validation/tweak_backtest.ts)",
] as const;

/** Phase 17V: no hard deletes (ambiguous safe_remove candidates deferred). */
export const PHASE17V_REMOVED_THIS_PHASE: readonly string[] = [] as const;

/** Items explicitly not executed in 17V (needs review or deferred from 17U). Phase 17W removed fetch_oddsapi_odds rename deferral (resolved). */
export const PHASE17V_SKIPPED_NEEDS_REVIEW = [
  "src/scripts/scrape_underdog_champions.ts — manual Playwright CLI (not package.json)",
  "dist/** — build output; policy unchanged",
  "safe_remove file targets — no ambiguous mass deletes in Phase 17V",
] as const;

/** Deterministic summary for Phase 17W legacy naming cleanup (repo hygiene + tests). */
export const PHASE17W_LEGACY_NAMING_CLEANUP_SUMMARY = [
  "fetch_oddsapi_odds.ts → canonical fetch_oddsapi_legacy_alias.ts + compatibility re-export shim; report_single_bet_ev imports canonical module",
] as const;

export function writeRepoHygieneAuditFromRun(cwd: string, runTimestampEt: string | null): void {
  const report = buildRepoHygieneAuditReport({
    generatedAtUtc: new Date().toISOString(),
    runTimestampEt,
    safeRemovalsPerformed: [...PHASE17U_DEFAULT_SAFE_REMOVALS_PERFORMED],
    archivedThisPhase: [...PHASE17V_ARCHIVED_THIS_PHASE],
    removedThisPhase: [...PHASE17V_REMOVED_THIS_PHASE],
    skippedNeedsReview: [...PHASE17V_SKIPPED_NEEDS_REVIEW],
  });
  writeRepoHygieneAuditArtifacts(cwd, report);
}
