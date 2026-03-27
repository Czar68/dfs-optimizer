/**
 * Phase 40–41 — Merge quality metrics, WARN/FAIL enforcement, baseline drift (report-only).
 * Does not change merge matching behavior.
 */

import fs from "fs";
import path from "path";
import type { MergeAuditReport } from "./merge_audit";
import type { LiveMergeInputSummary } from "./run_status";
import { stableStringifyForObservability } from "./final_selection_observability";
import type { MergePlatformQualityByPassFile } from "./merge_platform_quality_by_pass";
import { readMergePlatformQualityByPassIfExists } from "./merge_platform_quality_by_pass";
import type { MergePlatformRow, MergePlatformStats, PpConsensusDispersionSummary } from "../merge_odds";

/** Bump when merge quality JSON shape changes materially. */
export const MERGE_QUALITY_SCHEMA_VERSION = 4 as const;

export const MERGE_QUALITY_BASELINE_SCHEMA_VERSION = 1 as const;

export const MERGE_QUALITY_STATUS_SCHEMA_VERSION = 4 as const;

/** Minimum merge coverage (matched/rawProps) below which we WARN. */
export const MERGE_COVERAGE_WARN_MIN = 0.35;

/** Below this coverage → FAIL (conservative). */
export const MERGE_COVERAGE_FAIL_MIN = 0.22;

/** Maximum alt-line fallback share (altLineFallbackCount/matched) above which we WARN. */
export const FALLBACK_RATE_WARN_MAX = 0.45;

/** Maximum share of drops that are `invalid_odds` (juice) above which we WARN (never FAIL). */
export const INVALID_ODDS_DROP_SHARE_WARN_MAX = 0.12;

/** Absolute increase in fallback rate vs previous run → WARN spike. */
export const FALLBACK_RATE_SPIKE_WARN_DELTA = 0.15;

/** @deprecated Use FALLBACK_RATE_SPIKE_WARN_DELTA (Phase 41 rename). */
export const FALLBACK_RATE_SPIKE_DELTA = FALLBACK_RATE_SPIKE_WARN_DELTA;

/** Absolute increase in fallback rate vs previous run → FAIL (extreme spike). */
export const FALLBACK_RATE_SPIKE_FAIL_DELTA = 0.35;

/** Current coverage minus baseline coverage below this → WARN long-term drift. */
export const BASELINE_COVERAGE_DRIFT_WARN_DELTA = -0.1;

const SUMMARY_JSON = "merge_quality_summary.json";
const QUALITY_JSON = "latest_merge_quality.json";
const QUALITY_MD = "latest_merge_quality.md";
const STATUS_JSON = "merge_quality_status.json";
const BASELINE_JSON = "merge_quality_baseline.json";

export type MergeQualitySeverity = "INFO" | "WARN" | "FAIL";

export function getMergeQualityPaths(cwd: string): {
  dir: string;
  summaryJsonPath: string;
  qualityJsonPath: string;
  qualityMdPath: string;
  statusJsonPath: string;
  baselineJsonPath: string;
} {
  const dir = path.join(cwd, "data", "reports");
  return {
    dir,
    summaryJsonPath: path.join(dir, SUMMARY_JSON),
    qualityJsonPath: path.join(dir, QUALITY_JSON),
    qualityMdPath: path.join(dir, QUALITY_MD),
    statusJsonPath: path.join(dir, STATUS_JSON),
    baselineJsonPath: path.join(dir, BASELINE_JSON),
  };
}

export interface MergeQualityMetrics {
  mergeCoverage: number | null;
  dropRate: number | null;
  fallbackRate: number | null;
  exactMatchRate: number | null;
  totalRawProps: number;
  matched: number;
  dropped: number;
  fallbackMatches: number;
  exactMatches: number;
}

export function computeMergeQualityMetrics(audit: MergeAuditReport): MergeQualityMetrics {
  const total = audit.totals.rawProps;
  const matched = audit.totals.matched;
  const dropped = audit.totals.dropped;
  const fb = audit.altLineFallbackCount;
  const ex = audit.exactLineMatchCount;

  const mergeCoverage = total > 0 ? matched / total : null;
  const dropRate = total > 0 ? dropped / total : null;
  const fallbackRate = matched > 0 ? fb / matched : null;
  const exactMatchRate = matched > 0 ? ex / matched : null;

  return {
    mergeCoverage,
    dropRate,
    fallbackRate,
    exactMatchRate,
    totalRawProps: total,
    matched,
    dropped,
    fallbackMatches: fb,
    exactMatches: ex,
  };
}

/** Passed from merge_odds / snapshot binding (Phase 115). */
export interface MergeQualityFreshnessInput {
  oddsFetchedAtUtc?: string;
  oddsSnapshotAgeMinutes: number | null;
  mergeWallClockUtc: string;
  oddsIsFromCache?: boolean;
}

export interface MergeQualityFreshnessBlock {
  oddsFetchedAtUtc: string | null;
  mergeWallClockUtc: string;
  oddsIsFromCache: boolean | null;
  oddsSnapshotAgeMinutes: number | null;
  mergeVsFetchSkewMinutes: number | null;
  stalenessNote: string;
}

export interface LiveMergeQualityMetrics {
  match_rate_pp: number | null;
  match_rate_ud: number | null;
  unmatched_legs_count: number;
  alias_resolution_rate: number | null;
  dropped_due_to_missing_market: number;
  dropped_due_to_line_diff: number;
  odds_unmatched_inventory_rows: number;
  nearest_match_share: number | null;
  explicit_alias_resolution_hits: number;
  multi_book_consensus_pick_count: number;
  last_audit_pass_note: string | null;
}

export interface MergeIdentityVisibility {
  explicitAliasResolutionHits: number;
  multiBookConsensusPickCount: number;
  unresolvedIdentitySignal: "see_latest_merge_player_diagnostics";
  note: string;
}

function rateFromPlatformRow(row: MergePlatformRow | undefined): number | null {
  if (!row || row.matchEligible <= 0) return null;
  return (row.mergedExact + row.mergedNearest) / row.matchEligible;
}

function inferLastAuditPassNote(stats: MergePlatformStats): string | null {
  const keys = Object.keys(stats).sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) return null;
  if (keys.length === 1 && keys[0] === "underdog") {
    return "last_merge_pass=underdog; use merge_platform_quality_by_pass.json for PP match_rate_pp when platform=both.";
  }
  if (keys.length === 1 && keys[0] === "prizepicks") {
    return "last_merge_pass=prizepicks";
  }
  return `last_merge_pass keys=${keys.join("+")}`;
}

function computeMergeVsFetchSkewMinutes(fetchIso: string | undefined, mergeIso: string): number | null {
  if (!fetchIso) return null;
  const a = Date.parse(fetchIso);
  const b = Date.parse(mergeIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, (b - a) / 60000);
}

export function buildMergeQualityFreshnessBlock(
  input: MergeQualityFreshnessInput | undefined,
  fallbackMergeUtc: string
): MergeQualityFreshnessBlock {
  const mergeWallClockUtc = input?.mergeWallClockUtc ?? fallbackMergeUtc;
  const fetchIso = input?.oddsFetchedAtUtc;
  const skew = computeMergeVsFetchSkewMinutes(fetchIso, mergeWallClockUtc);
  let stalenessNote =
    "Odds snapshot age uses OddsSnapshotManager-reported minutes when available (coarse clock).";
  if (fetchIso) {
    stalenessNote += ` mergeVsFetchSkewMinutes≈${skew?.toFixed(1) ?? "null"} (wall clock; trust snapshot age if skew looks wrong).`;
  } else {
    stalenessNote = "Odds fetch timestamp unavailable — mergeVsFetchSkewMinutes null; use oddsSnapshotAgeMinutes when present.";
  }
  return {
    oddsFetchedAtUtc: fetchIso ?? null,
    mergeWallClockUtc,
    oddsIsFromCache: input?.oddsIsFromCache ?? null,
    oddsSnapshotAgeMinutes: input?.oddsSnapshotAgeMinutes ?? null,
    mergeVsFetchSkewMinutes: skew,
    stalenessNote,
  };
}

export function computeLiveMergeQualityMetrics(
  audit: MergeAuditReport,
  platformByPass: MergePlatformQualityByPassFile | null
): LiveMergeQualityMetrics {
  const stats = audit.mergePlatformStats ?? {};
  const sa = audit.stageAccounting;
  const propsConsidered = sa.propsConsideredForMatchingRows;
  const aliasHits = sa.explicitAliasResolutionHits ?? 0;
  const multiBook = sa.multiBookConsensusPickCount ?? 0;

  let match_rate_pp = rateFromPlatformRow(stats.prizepicks);
  let match_rate_ud = rateFromPlatformRow(stats.underdog);
  if (match_rate_pp === null && platformByPass?.prizepicks) {
    match_rate_pp = platformByPass.prizepicks.match_rate;
  }
  if (match_rate_ud === null && platformByPass?.underdog) {
    match_rate_ud = platformByPass.underdog.match_rate;
  }

  const matched = audit.totals.matched;
  const nearest = audit.nearestWithinToleranceCount;
  const nearest_match_share = matched > 0 ? nearest / matched : null;

  return {
    match_rate_pp,
    match_rate_ud,
    unmatched_legs_count: sa.unmatchedPropRows,
    alias_resolution_rate: propsConsidered > 0 ? aliasHits / propsConsidered : null,
    dropped_due_to_missing_market: audit.droppedByCanonicalReason["no_match"] ?? 0,
    dropped_due_to_line_diff: audit.droppedByCanonicalReason["line_mismatch"] ?? 0,
    odds_unmatched_inventory_rows: sa.unmatchedOddsRows,
    nearest_match_share,
    explicit_alias_resolution_hits: aliasHits,
    multi_book_consensus_pick_count: multiBook,
    last_audit_pass_note: inferLastAuditPassNote(stats),
  };
}

export function buildMergeIdentityVisibility(audit: MergeAuditReport): MergeIdentityVisibility {
  const sa = audit.stageAccounting;
  return {
    explicitAliasResolutionHits: sa.explicitAliasResolutionHits ?? 0,
    multiBookConsensusPickCount: sa.multiBookConsensusPickCount ?? 0,
    unresolvedIdentitySignal: "see_latest_merge_player_diagnostics",
    note:
      "Unresolved player identity and no_candidate concentration: latest_merge_player_diagnostics.json. " +
      "multi_book_consensus_pick_count is sharp-weight multi-book merges, not a name-collision detector.",
  };
}

/** Phase P — one-line PP consensus breadth for logs / status JSON. */
export function formatPpConsensusOperatorLine(s: PpConsensusDispersionSummary | undefined): string | undefined {
  if (!s) return undefined;
  return (
    `ppConsensus n=${s.nPpMerged} meanBooks=${s.meanConsensusBookCount.toFixed(2)} ` +
    `meanSpread=${s.meanDevigSpreadOver.toFixed(4)} p95Spread=${s.p95DevigSpreadOver?.toFixed(4) ?? "null"} ` +
    `multiBookShare=${(s.shareMultiBookConsensus * 100).toFixed(1)}%`
  );
}

export type SoftGuardStatus = "ok" | "warn";

export interface SoftGuardEvaluation {
  coverageStatus: SoftGuardStatus;
  fallbackStatus: SoftGuardStatus;
  invalidOddsDropShareStatus: SoftGuardStatus;
  warnings: string[];
}

export function evaluateSoftGuards(
  audit: MergeAuditReport,
  metrics: MergeQualityMetrics
): SoftGuardEvaluation {
  const warnings: string[] = [];

  let coverageStatus: SoftGuardStatus = "ok";
  if (metrics.mergeCoverage !== null && metrics.mergeCoverage < MERGE_COVERAGE_WARN_MIN) {
    coverageStatus = "warn";
    warnings.push(
      `[coverage] mergeCoverage=${metrics.mergeCoverage.toFixed(4)} < warnMin=${MERGE_COVERAGE_WARN_MIN}`
    );
  }

  let fallbackStatus: SoftGuardStatus = "ok";
  if (metrics.fallbackRate !== null && metrics.fallbackRate > FALLBACK_RATE_WARN_MAX) {
    fallbackStatus = "warn";
    warnings.push(
      `[fallback] fallbackRate=${metrics.fallbackRate.toFixed(4)} > warnMax=${FALLBACK_RATE_WARN_MAX}`
    );
  }

  let invalidOddsDropShareStatus: SoftGuardStatus = "ok";
  const droppedTotal = audit.totals.dropped;
  if (droppedTotal > 0) {
    const inv = audit.droppedByCanonicalReason["invalid_odds"] ?? 0;
    const share = inv / droppedTotal;
    if (share > INVALID_ODDS_DROP_SHARE_WARN_MAX) {
      invalidOddsDropShareStatus = "warn";
      warnings.push(
        `[invalid_odds] dropShare=${share.toFixed(4)} > warnMax=${INVALID_ODDS_DROP_SHARE_WARN_MAX} (invalid_odds=${inv}/${droppedTotal})`
      );
    }
  }

  warnings.sort((a, b) => a.localeCompare(b));

  return { coverageStatus, fallbackStatus, invalidOddsDropShareStatus, warnings };
}

function sortRecordNumbers(rec: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(rec).sort((a, b) => a.localeCompare(b))) {
    out[k] = rec[k]!;
  }
  return out;
}

export interface MergeQualityDrift {
  previousAuditAvailable: boolean;
  previousGeneratedAtUtc: string | null;
  coverageDelta: number | null;
  fallbackRateDelta: number | null;
  fallbackSpikeWarn: boolean;
  fallbackSpikeFail: boolean;
  dropReasonDeltas: Record<string, number>;
}

export function computeMergeQualityDrift(
  previous: MergeAuditReport | null,
  current: MergeAuditReport
): MergeQualityDrift {
  if (!previous) {
    return {
      previousAuditAvailable: false,
      previousGeneratedAtUtc: null,
      coverageDelta: null,
      fallbackRateDelta: null,
      fallbackSpikeWarn: false,
      fallbackSpikeFail: false,
      dropReasonDeltas: {},
    };
  }

  const mPrev = computeMergeQualityMetrics(previous);
  const mCur = computeMergeQualityMetrics(current);

  const coverageDelta =
    mPrev.mergeCoverage !== null && mCur.mergeCoverage !== null
      ? mCur.mergeCoverage - mPrev.mergeCoverage
      : null;

  const fallbackRateDelta =
    mPrev.fallbackRate !== null && mCur.fallbackRate !== null
      ? mCur.fallbackRate - mPrev.fallbackRate
      : null;

  let fallbackSpikeWarn = false;
  let fallbackSpikeFail = false;
  if (mPrev.fallbackRate !== null && mCur.fallbackRate !== null) {
    const d = mCur.fallbackRate - mPrev.fallbackRate;
    if (d >= FALLBACK_RATE_SPIKE_FAIL_DELTA) fallbackSpikeFail = true;
    else if (d >= FALLBACK_RATE_SPIKE_WARN_DELTA) fallbackSpikeWarn = true;
  }

  const keys = new Set([
    ...Object.keys(current.droppedByCanonicalReason),
    ...Object.keys(previous.droppedByCanonicalReason),
  ]);
  const dropReasonDeltas: Record<string, number> = {};
  for (const k of [...keys].sort((a, b) => a.localeCompare(b))) {
    const d =
      (current.droppedByCanonicalReason[k] ?? 0) - (previous.droppedByCanonicalReason[k] ?? 0);
    if (d !== 0) dropReasonDeltas[k] = d;
  }

  return {
    previousAuditAvailable: true,
    previousGeneratedAtUtc: previous.generatedAtUtc,
    coverageDelta,
    fallbackRateDelta,
    fallbackSpikeWarn,
    fallbackSpikeFail,
    dropReasonDeltas: sortRecordNumbers(dropReasonDeltas),
  };
}

/** Read prior `latest_merge_audit.json` before it is overwritten (same path contract as Phase 39). */
export function readMergeAuditFromDiskIfExists(cwd: string): MergeAuditReport | null {
  const jsonPath = path.join(cwd, "data", "reports", "latest_merge_audit.json");
  if (!fs.existsSync(jsonPath)) return null;
  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw) as MergeAuditReport;
    const v = validateMergeAuditReport(parsed);
    if (!v.valid) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function validateMergeAuditReport(audit: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (audit === null || typeof audit !== "object") {
    return { valid: false, errors: ["audit_not_object"] };
  }
  const a = audit as Record<string, unknown>;
  if (typeof a.generatedAtUtc !== "string") errors.push("missing_generatedAtUtc");
  if (typeof a.totals !== "object" || a.totals === null) {
    errors.push("missing_totals");
  } else {
    const t = a.totals as Record<string, unknown>;
    if (typeof t.rawProps !== "number") errors.push("totals_rawProps_invalid");
    if (typeof t.matched !== "number") errors.push("totals_matched_invalid");
    if (typeof t.dropped !== "number") errors.push("totals_dropped_invalid");
  }
  if (a.droppedByCanonicalReason !== undefined) {
    if (typeof a.droppedByCanonicalReason !== "object" || a.droppedByCanonicalReason === null) {
      errors.push("droppedByCanonicalReason_invalid");
    }
  }
  errors.sort((x, y) => x.localeCompare(y));
  return { valid: errors.length === 0, errors };
}

export interface MergeQualityBaseline {
  schemaVersion: typeof MERGE_QUALITY_BASELINE_SCHEMA_VERSION;
  lockedAtUtc: string;
  sourceAuditGeneratedAtUtc: string;
  metrics: {
    mergeCoverage: number | null;
    fallbackRate: number | null;
    dropReasonDistribution: Record<string, number>;
  };
}

export interface BaselineVsCurrent {
  baselineAvailable: boolean;
  coverageDeltaVsBaseline: number | null;
  fallbackRateDeltaVsBaseline: number | null;
  baselineCoverageDriftWarn: boolean;
}

export function readMergeQualityBaselineIfExists(cwd: string): MergeQualityBaseline | null {
  const p = path.join(cwd, "data", "reports", BASELINE_JSON);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as MergeQualityBaseline;
    if (raw.schemaVersion !== MERGE_QUALITY_BASELINE_SCHEMA_VERSION) return null;
    if (typeof raw.lockedAtUtc !== "string" || typeof raw.metrics !== "object" || raw.metrics === null) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function buildBaselineFromCurrentAudit(
  audit: MergeAuditReport,
  metrics: MergeQualityMetrics,
  lockedAtUtc: string
): MergeQualityBaseline {
  return {
    schemaVersion: MERGE_QUALITY_BASELINE_SCHEMA_VERSION,
    lockedAtUtc,
    sourceAuditGeneratedAtUtc: audit.generatedAtUtc,
    metrics: {
      mergeCoverage: metrics.mergeCoverage,
      fallbackRate: metrics.fallbackRate,
      dropReasonDistribution: sortRecordNumbers({ ...audit.droppedByCanonicalReason }),
    },
  };
}

export function compareCurrentToBaseline(
  baseline: MergeQualityBaseline | null,
  metrics: MergeQualityMetrics,
  _audit: MergeAuditReport
): BaselineVsCurrent {
  if (!baseline) {
    return {
      baselineAvailable: false,
      coverageDeltaVsBaseline: null,
      fallbackRateDeltaVsBaseline: null,
      baselineCoverageDriftWarn: false,
    };
  }
  const covDelta =
    metrics.mergeCoverage !== null &&
    baseline.metrics.mergeCoverage !== null &&
    typeof baseline.metrics.mergeCoverage === "number"
      ? metrics.mergeCoverage - baseline.metrics.mergeCoverage
      : null;
  const fbDelta =
    metrics.fallbackRate !== null && baseline.metrics.fallbackRate !== null
      ? metrics.fallbackRate - baseline.metrics.fallbackRate
      : null;

  let baselineCoverageDriftWarn = false;
  if (covDelta !== null && covDelta < BASELINE_COVERAGE_DRIFT_WARN_DELTA) {
    baselineCoverageDriftWarn = true;
  }

  return {
    baselineAvailable: true,
    coverageDeltaVsBaseline: covDelta,
    fallbackRateDeltaVsBaseline: fbDelta,
    baselineCoverageDriftWarn,
  };
}

export interface TriggeredRule {
  id: string;
  severity: MergeQualitySeverity;
  message: string;
}

function maxSeverity(a: MergeQualitySeverity, b: MergeQualitySeverity): MergeQualitySeverity {
  const rank: Record<MergeQualitySeverity, number> = { INFO: 0, WARN: 1, FAIL: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function collectTriggeredRulesWithAudit(
  audit: MergeAuditReport,
  metrics: MergeQualityMetrics,
  drift: MergeQualityDrift,
  baselineCmp: BaselineVsCurrent,
  auditValidation: { valid: boolean; errors: string[] }
): { rules: TriggeredRule[]; overallSeverity: MergeQualitySeverity; explanation: string } {
  const rules: TriggeredRule[] = [];
  let overall: MergeQualitySeverity = "INFO";

  if (!auditValidation.valid) {
    for (const e of auditValidation.errors) {
      rules.push({
        id: "audit_integrity",
        severity: "FAIL",
        message: `corrupted_or_invalid_audit: ${e}`,
      });
      overall = "FAIL";
    }
  }

  const mc = metrics.mergeCoverage;
  if (mc !== null) {
    if (mc < MERGE_COVERAGE_FAIL_MIN) {
      rules.push({
        id: "coverage_below_fail",
        severity: "FAIL",
        message: `mergeCoverage=${mc.toFixed(4)} < failMin=${MERGE_COVERAGE_FAIL_MIN}`,
      });
      overall = maxSeverity(overall, "FAIL");
    } else if (mc < MERGE_COVERAGE_WARN_MIN) {
      rules.push({
        id: "coverage_below_warn",
        severity: "WARN",
        message: `mergeCoverage=${mc.toFixed(4)} < warnMin=${MERGE_COVERAGE_WARN_MIN}`,
      });
      overall = maxSeverity(overall, "WARN");
    }
  }

  const fr = metrics.fallbackRate;
  if (fr !== null && fr > FALLBACK_RATE_WARN_MAX) {
    rules.push({
      id: "fallback_above_warn",
      severity: "WARN",
      message: `fallbackRate=${fr.toFixed(4)} > warnMax=${FALLBACK_RATE_WARN_MAX}`,
    });
    overall = maxSeverity(overall, "WARN");
  }

  if (audit.totals.dropped > 0) {
    const inv = audit.droppedByCanonicalReason["invalid_odds"] ?? 0;
    const share = inv / audit.totals.dropped;
    if (share > INVALID_ODDS_DROP_SHARE_WARN_MAX) {
      rules.push({
        id: "invalid_odds_drop_share_warn",
        severity: "WARN",
        message: `invalid_odds dropShare=${share.toFixed(4)} > warnMax=${INVALID_ODDS_DROP_SHARE_WARN_MAX}`,
      });
      overall = maxSeverity(overall, "WARN");
    }
  }

  if (drift.fallbackSpikeFail) {
    rules.push({
      id: "drift_fallback_spike_fail",
      severity: "FAIL",
      message: `fallbackRateDelta=${drift.fallbackRateDelta?.toFixed(4) ?? "null"} >= failDelta=${FALLBACK_RATE_SPIKE_FAIL_DELTA}`,
    });
    overall = maxSeverity(overall, "FAIL");
  } else if (drift.fallbackSpikeWarn) {
    rules.push({
      id: "drift_fallback_spike_warn",
      severity: "WARN",
      message: `fallbackRateDelta=${drift.fallbackRateDelta?.toFixed(4) ?? "null"} >= warnDelta=${FALLBACK_RATE_SPIKE_WARN_DELTA}`,
    });
    overall = maxSeverity(overall, "WARN");
  }

  if (baselineCmp.baselineAvailable && baselineCmp.baselineCoverageDriftWarn) {
    rules.push({
      id: "baseline_coverage_drift_warn",
      severity: "WARN",
      message: `coverageDeltaVsBaseline=${baselineCmp.coverageDeltaVsBaseline?.toFixed(4) ?? "null"} < threshold=${BASELINE_COVERAGE_DRIFT_WARN_DELTA}`,
    });
    overall = maxSeverity(overall, "WARN");
  }

  rules.sort((a, b) => a.id.localeCompare(b.id));

  const explanation =
    overall === "FAIL"
      ? "One or more FAIL rules triggered (coverage, fallback spike vs previous, or invalid audit)."
      : overall === "WARN"
        ? "One or more WARN rules triggered; merge pipeline did not fail (Phase 41 enforcement is reporting-only unless wired to exit)."
        : "Within INFO thresholds.";

  return { rules, overallSeverity: overall, explanation };
}

export interface MergeQualityReport {
  schemaVersion: typeof MERGE_QUALITY_SCHEMA_VERSION;
  generatedAtUtc: string;
  sourceAuditGeneratedAtUtc: string;
  /** Phase 115 — Odds / wall-clock context (conservative; coarse timestamps). */
  freshness: MergeQualityFreshnessBlock;
  /** Phase 115 — Grounded live merge / drop / alias metrics. */
  liveMergeQuality: LiveMergeQualityMetrics;
  identityVisibility: MergeIdentityVisibility;
  thresholds: {
    mergeCoverageWarnMin: number;
    mergeCoverageFailMin: number;
    fallbackRateWarnMax: number;
    invalidOddsDropShareWarnMax: number;
    fallbackSpikeWarnDelta: number;
    fallbackSpikeFailDelta: number;
    baselineCoverageDriftWarnDelta: number;
  };
  metrics: MergeQualityMetrics;
  softGuards: SoftGuardEvaluation;
  dropReasonDistribution: Record<string, number>;
  drift: MergeQualityDrift;
  baseline: BaselineVsCurrent;
  auditValidation: { valid: boolean; errors: string[] };
  severity: {
    overall: MergeQualitySeverity;
    triggeredRules: TriggeredRule[];
    explanation: string;
  };
  /** Phase P — PP consensus dispersion (from `stageAccounting`; reporting only). */
  ppConsensusDispersion?: PpConsensusDispersionSummary;
}

export interface MergeQualitySummary {
  schemaVersion: typeof MERGE_QUALITY_SCHEMA_VERSION;
  generatedAtUtc: string;
  overallSeverity: MergeQualitySeverity;
  liveInputDegraded: boolean;
  freshness: MergeQualityFreshnessBlock;
  liveMergeQuality: LiveMergeQualityMetrics;
  identityVisibility: MergeIdentityVisibility;
  coverageStatus: SoftGuardStatus;
  fallbackStatus: SoftGuardStatus;
  invalidOddsDropShareStatus: SoftGuardStatus;
  dropReasonDistribution: Record<string, number>;
  warnings: string[];
  driftSummary: {
    previousAuditAvailable: boolean;
    coverageDelta: number | null;
    fallbackRateDelta: number | null;
    fallbackSpikeWarn: boolean;
    fallbackSpikeFail: boolean;
  };
  /** Phase P — compact PP consensus line (null when no PP merge rows). */
  ppConsensusOperatorLine?: string;
}

export interface MergeQualityStatusFile {
  schemaVersion: typeof MERGE_QUALITY_STATUS_SCHEMA_VERSION;
  generatedAtUtc: string;
  overallSeverity: MergeQualitySeverity;
  /** True when merge quality severity is WARN or FAIL — live input trust is reduced. */
  liveInputDegraded: boolean;
  explanation: string;
  keyMetrics: {
    mergeCoverage: number | null;
    fallbackRate: number | null;
    dropRate: number | null;
  };
  /** Phase 115 — compact operator line for dashboards / logs. */
  liveMergeQualityLine: string;
  /** Single deterministic line for operator logs; null when no previous audit. */
  driftNote: string | null;
  triggeredRules: TriggeredRule[];
  baseline: {
    available: boolean;
    seededThisRun: boolean;
  };
  /** Phase P — optional; mirrors summary / full report. */
  ppConsensusOperatorLine?: string;
}

export function formatMergeQualityDriftNote(full: MergeQualityReport): string | null {
  const d = full.drift;
  if (!d.previousAuditAvailable) return null;
  const parts: string[] = [];
  if (d.coverageDelta !== null) parts.push(`coverageDelta=${d.coverageDelta.toFixed(4)}`);
  if (d.fallbackRateDelta !== null) parts.push(`fallbackRateDelta=${d.fallbackRateDelta.toFixed(4)}`);
  if (d.fallbackSpikeFail) parts.push("fallback_spike=FAIL");
  else if (d.fallbackSpikeWarn) parts.push("fallback_spike=WARN");
  return parts.length > 0 ? parts.join(", ") : null;
}

export function formatLiveMergeQualityLine(l: LiveMergeQualityMetrics): string {
  const pp = l.match_rate_pp === null ? "null" : l.match_rate_pp.toFixed(4);
  const ud = l.match_rate_ud === null ? "null" : l.match_rate_ud.toFixed(4);
  return `match_rate_pp=${pp} match_rate_ud=${ud} unmatched_legs=${l.unmatched_legs_count} ` +
    `alias_rate=${l.alias_resolution_rate === null ? "null" : l.alias_resolution_rate.toFixed(4)} ` +
    `drop_no_market=${l.dropped_due_to_missing_market} drop_line_diff=${l.dropped_due_to_line_diff}`;
}

export function buildMergeQualityReport(input: {
  generatedAtUtc: string;
  currentAudit: MergeAuditReport;
  previousAudit: MergeAuditReport | null;
  baseline: MergeQualityBaseline | null;
  auditValidation: { valid: boolean; errors: string[] };
  freshness?: MergeQualityFreshnessInput;
  platformByPass: MergePlatformQualityByPassFile | null;
}): MergeQualityReport {
  const metrics = computeMergeQualityMetrics(input.currentAudit);
  const softGuards = evaluateSoftGuards(input.currentAudit, metrics);
  const drift = computeMergeQualityDrift(input.previousAudit, input.currentAudit);
  const baselineCmp = compareCurrentToBaseline(input.baseline, metrics, input.currentAudit);
  const { rules, overallSeverity, explanation } = collectTriggeredRulesWithAudit(
    input.currentAudit,
    metrics,
    drift,
    baselineCmp,
    input.auditValidation
  );

  const freshnessBlock = buildMergeQualityFreshnessBlock(input.freshness, input.generatedAtUtc);
  const liveMergeQuality = computeLiveMergeQualityMetrics(input.currentAudit, input.platformByPass);
  const identityVisibility = buildMergeIdentityVisibility(input.currentAudit);

  return {
    schemaVersion: MERGE_QUALITY_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    sourceAuditGeneratedAtUtc: input.currentAudit.generatedAtUtc,
    freshness: freshnessBlock,
    liveMergeQuality,
    identityVisibility,
    thresholds: {
      mergeCoverageWarnMin: MERGE_COVERAGE_WARN_MIN,
      mergeCoverageFailMin: MERGE_COVERAGE_FAIL_MIN,
      fallbackRateWarnMax: FALLBACK_RATE_WARN_MAX,
      invalidOddsDropShareWarnMax: INVALID_ODDS_DROP_SHARE_WARN_MAX,
      fallbackSpikeWarnDelta: FALLBACK_RATE_SPIKE_WARN_DELTA,
      fallbackSpikeFailDelta: FALLBACK_RATE_SPIKE_FAIL_DELTA,
      baselineCoverageDriftWarnDelta: BASELINE_COVERAGE_DRIFT_WARN_DELTA,
    },
    metrics,
    softGuards,
    dropReasonDistribution: sortRecordNumbers({ ...input.currentAudit.droppedByCanonicalReason }),
    drift,
    baseline: baselineCmp,
    auditValidation: input.auditValidation,
    severity: {
      overall: overallSeverity,
      triggeredRules: rules,
      explanation,
    },
    ppConsensusDispersion: input.currentAudit.stageAccounting.ppConsensusDispersion,
  };
}

export function buildMergeQualitySummary(full: MergeQualityReport): MergeQualitySummary {
  return {
    schemaVersion: MERGE_QUALITY_SCHEMA_VERSION,
    generatedAtUtc: full.generatedAtUtc,
    overallSeverity: full.severity.overall,
    liveInputDegraded: full.severity.overall !== "INFO",
    freshness: full.freshness,
    liveMergeQuality: full.liveMergeQuality,
    identityVisibility: full.identityVisibility,
    coverageStatus: full.softGuards.coverageStatus,
    fallbackStatus: full.softGuards.fallbackStatus,
    invalidOddsDropShareStatus: full.softGuards.invalidOddsDropShareStatus,
    dropReasonDistribution: full.dropReasonDistribution,
    warnings: [...full.softGuards.warnings],
    driftSummary: {
      previousAuditAvailable: full.drift.previousAuditAvailable,
      coverageDelta: full.drift.coverageDelta,
      fallbackRateDelta: full.drift.fallbackRateDelta,
      fallbackSpikeWarn: full.drift.fallbackSpikeWarn,
      fallbackSpikeFail: full.drift.fallbackSpikeFail,
    },
    ppConsensusOperatorLine: formatPpConsensusOperatorLine(full.ppConsensusDispersion),
  };
}

export function buildMergeQualityStatusFile(
  full: MergeQualityReport,
  baselineMeta: { seededThisRun: boolean }
): MergeQualityStatusFile {
  return {
    schemaVersion: MERGE_QUALITY_STATUS_SCHEMA_VERSION,
    generatedAtUtc: full.generatedAtUtc,
    overallSeverity: full.severity.overall,
    liveInputDegraded: full.severity.overall !== "INFO",
    explanation: full.severity.explanation,
    keyMetrics: {
      mergeCoverage: full.metrics.mergeCoverage,
      fallbackRate: full.metrics.fallbackRate,
      dropRate: full.metrics.dropRate,
    },
    liveMergeQualityLine: formatLiveMergeQualityLine(full.liveMergeQuality),
    driftNote: formatMergeQualityDriftNote(full),
    triggeredRules: [...full.severity.triggeredRules].sort((a, b) => a.id.localeCompare(b.id)),
    baseline: {
      available: full.baseline.baselineAvailable,
      seededThisRun: baselineMeta.seededThisRun,
    },
    ppConsensusOperatorLine: formatPpConsensusOperatorLine(full.ppConsensusDispersion),
  };
}

export function formatMergeQualityMarkdown(report: MergeQualityReport): string {
  const lines: string[] = [];
  lines.push("# Merge quality");
  lines.push("");
  lines.push(`- **Overall severity:** **${report.severity.overall}**`);
  lines.push(`- **Explanation:** ${report.severity.explanation}`);
  lines.push(`- **Generated (UTC):** ${report.generatedAtUtc}`);
  lines.push(`- **Source audit (UTC):** ${report.sourceAuditGeneratedAtUtc}`);
  lines.push("");
  if (report.freshness) {
    lines.push("## Freshness / drift (Phase 115)");
    lines.push("");
    const fr = report.freshness;
    lines.push(`- oddsFetchedAtUtc: ${fr.oddsFetchedAtUtc ?? "null"}`);
    lines.push(`- mergeWallClockUtc: ${fr.mergeWallClockUtc}`);
    lines.push(`- oddsIsFromCache: ${fr.oddsIsFromCache}`);
    lines.push(`- oddsSnapshotAgeMinutes: ${fr.oddsSnapshotAgeMinutes}`);
    lines.push(`- mergeVsFetchSkewMinutes: ${fr.mergeVsFetchSkewMinutes}`);
    lines.push(`- ${fr.stalenessNote}`);
    lines.push("");
  }
  lines.push("## Live merge quality (Phase 115)");
  lines.push("");
  const l = report.liveMergeQuality;
  lines.push(`- match_rate_pp: ${l.match_rate_pp?.toFixed(4) ?? "null"}`);
  lines.push(`- match_rate_ud: ${l.match_rate_ud?.toFixed(4) ?? "null"}`);
  lines.push(`- unmatched_legs_count: ${l.unmatched_legs_count}`);
  lines.push(`- alias_resolution_rate: ${l.alias_resolution_rate?.toFixed(4) ?? "null"}`);
  lines.push(`- dropped_due_to_missing_market (no_match): ${l.dropped_due_to_missing_market}`);
  lines.push(`- dropped_due_to_line_diff (line_mismatch): ${l.dropped_due_to_line_diff}`);
  lines.push(`- odds_unmatched_inventory_rows: ${l.odds_unmatched_inventory_rows}`);
  lines.push(`- nearest_match_share (line drift proxy): ${l.nearest_match_share?.toFixed(4) ?? "null"}`);
  lines.push(`- explicit_alias_resolution_hits: ${l.explicit_alias_resolution_hits}`);
  lines.push(`- multi_book_consensus_pick_count: ${l.multi_book_consensus_pick_count}`);
  if (l.last_audit_pass_note) {
    lines.push(`- ${l.last_audit_pass_note}`);
  }
  lines.push("");
  lines.push("## Identity / alias visibility (Phase 115)");
  lines.push("");
  lines.push(`- explicitAliasResolutionHits: ${report.identityVisibility.explicitAliasResolutionHits}`);
  lines.push(`- multiBookConsensusPickCount: ${report.identityVisibility.multiBookConsensusPickCount}`);
  lines.push(`- ${report.identityVisibility.note}`);
  lines.push("");
  lines.push("## PP consensus (Phase P — reporting only)");
  lines.push("");
  const ppd = report.ppConsensusDispersion;
  if (ppd) {
    lines.push(`- nPpMerged: ${ppd.nPpMerged}`);
    lines.push(`- meanConsensusBookCount: ${ppd.meanConsensusBookCount.toFixed(4)}`);
    lines.push(`- meanDevigSpreadOver: ${ppd.meanDevigSpreadOver.toFixed(6)} (de-vig prob units)`);
    lines.push(`- p95DevigSpreadOver: ${ppd.p95DevigSpreadOver?.toFixed(6) ?? "null"}`);
    lines.push(`- shareMultiBookConsensus: ${(ppd.shareMultiBookConsensus * 100).toFixed(2)}%`);
    lines.push(
      "- Per-leg: \`ppNConsensusBooks\`, \`ppConsensusDevigSpreadOver\` on merged/ leg CSV when PP."
    );
  } else {
    lines.push("- (no PP merged rows in this audit pass)");
  }
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push(
    `| mergeCoverage | dropRate | fallbackRate | exactMatchRate | matched | dropped | rawProps |`
  );
  lines.push(`| ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  const m = report.metrics;
  lines.push(
    `| ${m.mergeCoverage?.toFixed(4) ?? "null"} | ${m.dropRate?.toFixed(4) ?? "null"} | ${m.fallbackRate?.toFixed(4) ?? "null"} | ${m.exactMatchRate?.toFixed(4) ?? "null"} | ${m.matched} | ${m.dropped} | ${m.totalRawProps} |`
  );
  lines.push("");
  lines.push("## Severity rules triggered");
  lines.push("");
  if (report.severity.triggeredRules.length === 0) {
    lines.push("- (none — INFO)");
  } else {
    for (const r of report.severity.triggeredRules) {
      lines.push(`- **[${r.severity}]** \`${r.id}\`: ${r.message}`);
    }
  }
  lines.push("");
  lines.push("## Legacy soft guard flags (ok/warn)");
  lines.push("");
  lines.push(`- coverage: **${report.softGuards.coverageStatus}**`);
  lines.push(`- fallback: **${report.softGuards.fallbackStatus}**`);
  lines.push(`- invalid_odds drop share: **${report.softGuards.invalidOddsDropShareStatus}**`);
  if (report.softGuards.warnings.length > 0) {
    lines.push("");
    for (const w of report.softGuards.warnings) {
      lines.push(`- ${w}`);
    }
  }
  lines.push("");
  lines.push("## Audit validation");
  lines.push("");
  lines.push(`- valid: ${report.auditValidation.valid}`);
  if (report.auditValidation.errors.length > 0) {
    for (const e of report.auditValidation.errors) {
      lines.push(`- error: ${e}`);
    }
  }
  lines.push("");
  lines.push("## Baseline comparison");
  lines.push("");
  const b = report.baseline;
  lines.push(`- available: ${b.baselineAvailable}`);
  lines.push(`- coverageDeltaVsBaseline: ${b.coverageDeltaVsBaseline?.toFixed(6) ?? "null"}`);
  lines.push(`- fallbackRateDeltaVsBaseline: ${b.fallbackRateDeltaVsBaseline?.toFixed(6) ?? "null"}`);
  lines.push(`- baselineCoverageDriftWarn: ${b.baselineCoverageDriftWarn}`);
  lines.push("");
  lines.push("## Drift vs previous audit");
  lines.push("");
  lines.push(`- previous available: ${report.drift.previousAuditAvailable}`);
  if (report.drift.previousGeneratedAtUtc) {
    lines.push(`- previous generatedAtUtc: ${report.drift.previousGeneratedAtUtc}`);
  }
  lines.push(`- coverageDelta: ${report.drift.coverageDelta?.toFixed(6) ?? "null"}`);
  lines.push(`- fallbackRateDelta: ${report.drift.fallbackRateDelta?.toFixed(6) ?? "null"}`);
  lines.push(`- fallbackSpikeWarn: ${report.drift.fallbackSpikeWarn}`);
  lines.push(`- fallbackSpikeFail: ${report.drift.fallbackSpikeFail}`);
  lines.push("");
  lines.push("### Drop reason deltas (canonical)");
  lines.push("");
  const dr = report.drift.dropReasonDeltas;
  if (Object.keys(dr).length === 0) {
    lines.push("- (none)");
  } else {
    for (const k of Object.keys(dr).sort((a, b) => a.localeCompare(b))) {
      lines.push(`- ${k}: ${dr[k]}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Phase 115 — Read compact merge input quality for latest_run_status.json (best-effort).
 */
export function readLiveMergeInputForRunStatus(cwd: string): LiveMergeInputSummary | undefined {
  const p = path.join(cwd, "data", "reports", "merge_quality_status.json");
  if (!fs.existsSync(p)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as MergeQualityStatusFile;
    if (typeof raw.overallSeverity !== "string" || typeof raw.liveMergeQualityLine !== "string") {
      return undefined;
    }
    return {
      qualitySeverity: raw.overallSeverity,
      liveInputDegraded: !!raw.liveInputDegraded,
      liveMergeQualityLine: raw.liveMergeQualityLine,
      mergeQualityStatusRel: "data/reports/merge_quality_status.json",
    };
  } catch {
    return undefined;
  }
}

export function writeMergeQualityArtifacts(
  cwd: string,
  currentAudit: MergeAuditReport,
  previousAudit: MergeAuditReport | null,
  generatedAtUtc: string,
  freshness?: MergeQualityFreshnessInput
): MergeQualityStatusFile {
  const auditValidation = validateMergeAuditReport(currentAudit);
  let baseline = readMergeQualityBaselineIfExists(cwd);
  let seededThisRun = false;
  const metrics = computeMergeQualityMetrics(currentAudit);
  if (!baseline && auditValidation.valid && currentAudit.totals.rawProps > 0) {
    baseline = buildBaselineFromCurrentAudit(currentAudit, metrics, generatedAtUtc);
    seededThisRun = true;
    const { baselineJsonPath } = getMergeQualityPaths(cwd);
    const { dir } = getMergeQualityPaths(cwd);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(baselineJsonPath, stableStringifyForObservability(baseline), "utf8");
  }

  const platformByPass = readMergePlatformQualityByPassIfExists(cwd);
  const full = buildMergeQualityReport({
    generatedAtUtc,
    currentAudit,
    previousAudit,
    baseline,
    auditValidation,
    freshness,
    platformByPass,
  });
  const summary = buildMergeQualitySummary(full);
  const status = buildMergeQualityStatusFile(full, { seededThisRun });
  const { dir, summaryJsonPath, qualityJsonPath, qualityMdPath, statusJsonPath } = getMergeQualityPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(summaryJsonPath, stableStringifyForObservability(summary), "utf8");
  fs.writeFileSync(qualityJsonPath, stableStringifyForObservability(full), "utf8");
  fs.writeFileSync(qualityMdPath, formatMergeQualityMarkdown(full), "utf8");
  fs.writeFileSync(statusJsonPath, stableStringifyForObservability(status), "utf8");
  return status;
}