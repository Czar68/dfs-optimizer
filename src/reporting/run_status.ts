/**
 * Phase 17F/17G/17H: Canonical post-run status (operator-facing, additive).
 * Consumes existing run outputs only — no EV / breakeven / ranking recomputation.
 */

import fs from "fs";
import path from "path";
import type { CardEvResult } from "../types";
import { computeBestBetScore } from "../best_bets_score";
import type { OptimizerEdgeQualityRunStatusSummary } from "./optimizer_edge_quality_audit";

export const RUN_STATUS_JSON_REL = "data/reports/latest_run_status.json";
export const RUN_STATUS_MD_REL = "data/reports/latest_run_status.md";

/** Stable machine-readable early-exit reasons (only real orchestration branches). */
export const EARLY_EXIT_REASON = {
  insufficient_eligible_legs: "insufficient_eligible_legs",
  no_viable_structures: "no_viable_structures",
} as const;

/** Stable machine-readable fatal reasons (only real orchestration branches). */
export const FATAL_REASON = {
  validation_failure: "validation_failure",
  no_positive_ev_legs: "no_positive_ev_legs",
  json_output_failure: "json_output_failure",
  uncaught_run_error: "uncaught_run_error",
} as const;

export type RunOutcome = "full_success" | "early_exit" | "fatal_exit";
export type RunHealth =
  | "success"
  | "degraded_success"
  | "partial_completion"
  | "hard_failure";

/** Phase 115 — snapshot of merge input quality for operator / dashboard (from merge_quality_status.json). */
export interface LiveMergeInputSummary {
  qualitySeverity: string;
  liveInputDegraded: boolean;
  liveMergeQualityLine: string;
  mergeQualityStatusRel: string;
}

export interface RunStatusJson {
  generatedAtUtc: string;
  runTimestamp: string | null;
  success: boolean;
  outcome: RunOutcome;
  runHealth: RunHealth;
  earlyExitReason: string | null;
  fatalReason: string | null;
  degradationReasons: string[];
  missingExpectedArtifacts: string[];
  prizepicks: {
    picksCount: number | null;
    cardsCount: number | null;
    tier1Count: number | null;
    tier2Count: number | null;
  };
  underdog: {
    picksCount: number | null;
    cardsCount: number | null;
    tier1Count: number | null;
    tier2Count: number | null;
  };
  digest: {
    generated: boolean;
    shownCount: number | null;
    dedupedCount: number | null;
  };
  /** Phase 115 — optional; present when merge_quality_status.json was read at run end. */
  liveMergeInput?: LiveMergeInputSummary;
  /** Phase 117 — optional; optimizer output quality / fragility (read-only audit). */
  optimizerEdgeQuality?: OptimizerEdgeQualityRunStatusSummary;
  artifacts: {
    prizepicksCardsCsvPath: string | null;
    underdogCardsCsvPath: string | null;
    prizepicksPicksCsvPath: string | null;
    underdogPicksCsvPath: string | null;
    telegramDigestPath: string | null;
  };
  notes: string[];
}

export interface BuildRunStatusInput {
  generatedAtUtc: string;
  runTimestamp: string | null;
  success: boolean;
  /** Operator-facing coarse status for run reliability. Defaults by outcome/success when omitted. */
  runHealth?: RunHealth;
  /** Defaults to full_success when omitted. */
  outcome?: RunOutcome;
  /** Set when outcome is early_exit; ignored when outcome is full_success or fatal_exit. */
  earlyExitReason?: string | null;
  /** Set when outcome is fatal_exit; ignored otherwise. */
  fatalReason?: string | null;
  ppCards: CardEvResult[];
  ppPicksCount: number | null;
  udCards: CardEvResult[];
  udPicksCount: number | null;
  digest: {
    generated: boolean;
    shownCount: number | null;
    dedupedCount: number | null;
  };
  /** Project-root-relative paths when files exist (caller may pass null for missing). */
  artifacts: {
    prizepicksCardsCsvPath: string | null;
    underdogCardsCsvPath: string | null;
    prizepicksPicksCsvPath: string | null;
    underdogPicksCsvPath: string | null;
    telegramDigestPath: string | null;
  };
  liveMergeInput?: LiveMergeInputSummary;
  /** Phase 117 — optional. */
  optimizerEdgeQuality?: OptimizerEdgeQualityRunStatusSummary;
  /** Structured non-fatal degradation details for operators. */
  degradationReasons?: string[];
  /** Expected artifacts that were not present at finalization time. */
  missingExpectedArtifacts?: string[];
  notes?: string[];
}

function countTierBuckets(cards: CardEvResult[]): { tier1: number; tier2: number } {
  let tier1 = 0;
  let tier2 = 0;
  for (const card of cards) {
    const sport = card.legs[0]?.pick.sport ?? "NBA";
    const { tier } = computeBestBetScore({
      cardEv: card.cardEv,
      avgEdgePct: card.avgEdgePct,
      winProbCash: card.winProbCash,
      legCount: card.legs.length,
      sport,
    });
    if (tier === "must_play") tier1 += 1;
    else if (tier === "strong") tier2 += 1;
  }
  return { tier1, tier2 };
}

/** Controlled early exit: success=true, outcome=early_exit, canonical reason string. */
export function buildEarlyExitRunStatus(
  input: Omit<BuildRunStatusInput, "outcome" | "earlyExitReason" | "success" | "fatalReason"> & {
    earlyExitReason: string;
  }
): RunStatusJson {
  return buildRunStatus({
    ...input,
    success: true,
    runHealth: "partial_completion",
    outcome: "early_exit",
    earlyExitReason: input.earlyExitReason,
    fatalReason: null,
  });
}

/** Fatal termination: success=false, outcome=fatal_exit, canonical reason string. */
export function buildFatalExitRunStatus(
  input: Omit<BuildRunStatusInput, "outcome" | "earlyExitReason" | "success" | "fatalReason"> & {
    fatalReason: string;
  }
): RunStatusJson {
  return buildRunStatus({
    ...input,
    success: false,
    runHealth: "hard_failure",
    outcome: "fatal_exit",
    fatalReason: input.fatalReason,
    earlyExitReason: null,
  });
}

/** Pure: normalized JSON shape for persistence and tests. */
export function buildRunStatus(input: BuildRunStatusInput): RunStatusJson {
  const ppTiers = countTierBuckets(input.ppCards);
  const udTiers = countTierBuckets(input.udCards);
  const notes = [...(input.notes ?? [])].sort();
  const degradationReasons = [...(input.degradationReasons ?? [])].sort();
  const missingExpectedArtifacts = [...(input.missingExpectedArtifacts ?? [])].sort();
  const outcome: RunOutcome = input.outcome ?? "full_success";
  const runHealth: RunHealth =
    input.runHealth ??
    (outcome === "fatal_exit"
      ? "hard_failure"
      : outcome === "early_exit"
      ? "partial_completion"
      : input.success
      ? "success"
      : "hard_failure");
  const earlyExitReason =
    outcome === "early_exit" ? (input.earlyExitReason ?? null) : null;
  const fatalReason =
    outcome === "fatal_exit" ? (input.fatalReason ?? null) : null;

  return {
    generatedAtUtc: input.generatedAtUtc,
    runTimestamp: input.runTimestamp,
    success: input.success,
    outcome,
    runHealth,
    earlyExitReason,
    fatalReason,
    degradationReasons,
    missingExpectedArtifacts,
    prizepicks: {
      picksCount: input.ppPicksCount,
      cardsCount: input.ppCards.length,
      tier1Count: input.ppCards.length > 0 ? ppTiers.tier1 : 0,
      tier2Count: input.ppCards.length > 0 ? ppTiers.tier2 : 0,
    },
    underdog: {
      picksCount: input.udPicksCount,
      cardsCount: input.udCards.length,
      tier1Count: input.udCards.length > 0 ? udTiers.tier1 : 0,
      tier2Count: input.udCards.length > 0 ? udTiers.tier2 : 0,
    },
    digest: { ...input.digest },
    ...(input.liveMergeInput !== undefined ? { liveMergeInput: input.liveMergeInput } : {}),
    ...(input.optimizerEdgeQuality !== undefined ? { optimizerEdgeQuality: input.optimizerEdgeQuality } : {}),
    artifacts: { ...input.artifacts },
    notes,
  };
}

/**
 * Compact markdown for operators. Fixed section order; notes block only when non-empty.
 */
export function formatRunStatusMarkdown(s: RunStatusJson): string {
  const lines: string[] = [];
  lines.push("# DFS Optimizer Run Status");
  lines.push("");
  lines.push(`- **Generated (UTC):** ${s.generatedAtUtc}`);
  lines.push(`- **Run timestamp:** ${s.runTimestamp ?? "null"}`);
  lines.push(`- **Success:** ${s.success ? "true" : "false"}`);
  lines.push(`- **Outcome:** ${s.outcome}`);
  lines.push(`- **Run health:** ${s.runHealth}`);
  if (s.outcome === "fatal_exit" && s.fatalReason) {
    lines.push(`- **Fatal reason:** ${s.fatalReason}`);
  }
  if (s.outcome === "early_exit" && s.earlyExitReason) {
    lines.push(`- **Early exit reason:** ${s.earlyExitReason}`);
  }
  if (s.degradationReasons.length > 0) {
    lines.push(`- **Degradation reasons:** ${s.degradationReasons.length}`);
  }
  if (s.missingExpectedArtifacts.length > 0) {
    lines.push(`- **Missing expected artifacts:** ${s.missingExpectedArtifacts.length}`);
  }
  lines.push("");
  lines.push(
    `- **PrizePicks:** picks=${s.prizepicks.picksCount ?? "null"} cards=${s.prizepicks.cardsCount ?? "null"} ` +
      `tier1=${s.prizepicks.tier1Count ?? "null"} tier2=${s.prizepicks.tier2Count ?? "null"}`
  );
  lines.push(
    `- **Underdog:** picks=${s.underdog.picksCount ?? "null"} cards=${s.underdog.cardsCount ?? "null"} ` +
      `tier1=${s.underdog.tier1Count ?? "null"} tier2=${s.underdog.tier2Count ?? "null"}`
  );
  lines.push(
    `- **Digest:** generated=${s.digest.generated ? "true" : "false"} shown=${s.digest.shownCount ?? "null"} ` +
      `deduped=${s.digest.dedupedCount ?? "null"}`
  );
  if (s.liveMergeInput) {
    lines.push("");
    lines.push("**Live merge input (Phase 115)**");
    lines.push(`- severity: ${s.liveMergeInput.qualitySeverity}`);
    lines.push(`- liveInputDegraded: ${s.liveMergeInput.liveInputDegraded ? "true" : "false"}`);
    lines.push(`- ${s.liveMergeInput.liveMergeQualityLine}`);
    lines.push(`- status file: ${s.liveMergeInput.mergeQualityStatusRel}`);
  }
  if (s.optimizerEdgeQuality) {
    lines.push("");
    lines.push("**Optimizer edge quality (Phase 117)**");
    lines.push(`- status: ${s.optimizerEdgeQuality.status} · degraded=${s.optimizerEdgeQuality.degradedOutput ? "true" : "false"}`);
    lines.push(`- ${s.optimizerEdgeQuality.summaryLine}`);
    lines.push(`- file: ${s.optimizerEdgeQuality.artifactRel}`);
  }
  lines.push("");
  lines.push("**Artifacts**");
  lines.push(`- prizepicks cards: ${s.artifacts.prizepicksCardsCsvPath ?? "null"}`);
  lines.push(`- underdog cards: ${s.artifacts.underdogCardsCsvPath ?? "null"}`);
  lines.push(`- prizepicks picks: ${s.artifacts.prizepicksPicksCsvPath ?? "null"}`);
  lines.push(`- underdog picks: ${s.artifacts.underdogPicksCsvPath ?? "null"}`);
  lines.push(`- telegram digest file: ${s.artifacts.telegramDigestPath ?? "null"}`);
  if (s.degradationReasons.length > 0) {
    lines.push("");
    lines.push("**Degradation Reasons**");
    for (const r of s.degradationReasons) {
      lines.push(`- ${r}`);
    }
  }
  if (s.missingExpectedArtifacts.length > 0) {
    lines.push("");
    lines.push("**Missing Expected Artifacts**");
    for (const m of s.missingExpectedArtifacts) {
      lines.push(`- ${m}`);
    }
  }
  if (s.notes.length > 0) {
    lines.push("");
    lines.push("**Notes**");
    for (const n of s.notes) {
      lines.push(`- ${n}`);
    }
  }
  return lines.join("\n");
}

/** Data rows in a CSV (excluding header), or null if missing/unreadable. */
export function countCsvDataLines(rootDir: string, rel: string): number | null {
  try {
    const full = path.join(rootDir, rel);
    if (!fs.existsSync(full)) return null;
    const txt = fs.readFileSync(full, "utf8");
    return Math.max(0, txt.split("\n").length - 1);
  } catch {
    return null;
  }
}

function pathIfExists(rootDir: string, rel: string): string | null {
  const full = path.join(rootDir, rel);
  try {
    if (fs.existsSync(full)) return rel.replace(/\\/g, "/");
  } catch {
    /* ignore */
  }
  return null;
}

/** Resolve standard CSV artifact paths when present (project-root-relative, forward slashes). */
export function resolveStandardArtifactPaths(rootDir: string): BuildRunStatusInput["artifacts"] {
  return {
    prizepicksCardsCsvPath: pathIfExists(rootDir, "prizepicks-cards.csv"),
    underdogCardsCsvPath: pathIfExists(rootDir, "underdog-cards.csv"),
    prizepicksPicksCsvPath: pathIfExists(rootDir, "prizepicks-legs.csv"),
    underdogPicksCsvPath: pathIfExists(rootDir, "underdog-legs.csv"),
    telegramDigestPath: null,
  };
}

export function writeRunStatusArtifacts(
  rootDir: string,
  status: RunStatusJson,
  paths?: { jsonRel?: string; mdRel?: string }
): { jsonPath: string; mdPath: string } {
  const jsonRel = paths?.jsonRel ?? RUN_STATUS_JSON_REL;
  const mdRel = paths?.mdRel ?? RUN_STATUS_MD_REL;
  const dir = path.join(rootDir, path.dirname(jsonRel));
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(rootDir, jsonRel);
  const mdPath = path.join(rootDir, mdRel);
  fs.writeFileSync(jsonPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${formatRunStatusMarkdown(status)}\n`, "utf8");
  return { jsonPath, mdPath };
}

/** Non-fatal write + log; use from run orchestration. */
export function tryWriteRunStatusArtifacts(rootDir: string, status: RunStatusJson): void {
  try {
    writeRunStatusArtifacts(rootDir, status);
    console.log(`[RunStatus] Wrote ${RUN_STATUS_JSON_REL} + ${RUN_STATUS_MD_REL}`);
  } catch (e) {
    console.warn("[RunStatus] Failed to write run status artifacts:", (e as Error).message);
  }
}
