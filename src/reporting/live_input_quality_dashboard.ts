/**
 * Phase 116 — Browser/dashboard-safe parse for live merge / input quality JSON (read-only; no math).
 */

export type MergeQualitySeverityDash = "INFO" | "WARN" | "FAIL" | string;

/** Lenient shape from `merge_quality_status.json` (Phase 115). */
export type MergeQualityStatusDashboard = {
  schemaVersion?: number;
  generatedAtUtc: string | null;
  overallSeverity: MergeQualitySeverityDash;
  liveInputDegraded: boolean | null;
  liveMergeQualityLine: string | null;
  explanation: string | null;
  keyMetrics: {
    mergeCoverage: number | null;
    fallbackRate: number | null;
    dropRate: number | null;
  } | null;
  driftNote: string | null;
  /** Phase P — optional one-line PP consensus summary. */
  ppConsensusOperatorLine?: string | null;
};

export type PlatformPassSnapshotDashboard = {
  capturedAtUtc: string | null;
  match_rate: number | null;
  rawProps: number | null;
  matchEligible: number | null;
  merged: number | null;
  unmatched_legs_count: number | null;
  alias_resolution_rate: number | null;
  explicitAliasResolutionHits: number | null;
  multiBookConsensusPickCount: number | null;
  dropped_due_to_missing_market: number | null;
  dropped_due_to_line_diff: number | null;
  oddsFetchedAtUtc: string | null;
  oddsSnapshotAgeMinutes: number | null;
};

export type MergePlatformQualityByPassDashboard = {
  schemaVersion?: number;
  updatedAtUtc: string | null;
  note: string | null;
  prizepicks: PlatformPassSnapshotDashboard | null;
  underdog: PlatformPassSnapshotDashboard | null;
};

/** Phase P — dashboard mirror of merge-quality `ppConsensusDispersion` (read-only). */
export type PpConsensusDispersionDashboard = {
  nPpMerged: number;
  meanConsensusBookCount: number;
  meanDevigSpreadOver: number;
  p95DevigSpreadOver: number | null;
  shareMultiBookConsensus: number;
};

/** Subset of `latest_merge_quality.json` for staleness / identity lines. */
export type LatestMergeQualityDashboard = {
  freshness: {
    stalenessNote: string | null;
    oddsFetchedAtUtc: string | null;
    oddsSnapshotAgeMinutes: number | null;
    mergeVsFetchSkewMinutes: number | null;
    oddsIsFromCache: boolean | null;
    mergeWallClockUtc: string | null;
  } | null;
  liveMergeQuality: {
    match_rate_pp: number | null;
    match_rate_ud: number | null;
    unmatched_legs_count: number | null;
    alias_resolution_rate: number | null;
    dropped_due_to_missing_market: number | null;
    dropped_due_to_line_diff: number | null;
    odds_unmatched_inventory_rows: number | null;
    nearest_match_share: number | null;
    last_audit_pass_note: string | null;
  } | null;
  identityNote: string | null;
  /** Phase P — from full merge quality report when present. */
  ppConsensusOperatorLine?: string | null;
  /** Phase P — numeric PP consensus breadth / de-vig spread rollup (full report only). */
  ppConsensusDispersion?: PpConsensusDispersionDashboard | null;
};

function str(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function bool(x: unknown): boolean | null {
  return typeof x === "boolean" ? x : null;
}

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function parsePpConsensusDispersionDash(raw: unknown): PpConsensusDispersionDashboard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const nPpMerged = num(o.nPpMerged);
  const meanConsensusBookCount = num(o.meanConsensusBookCount);
  const meanDevigSpreadOver = num(o.meanDevigSpreadOver);
  const shareMultiBookConsensus = num(o.shareMultiBookConsensus);
  if (
    nPpMerged == null ||
    meanConsensusBookCount == null ||
    meanDevigSpreadOver == null ||
    shareMultiBookConsensus == null
  ) {
    return null;
  }
  const p95Raw = o.p95DevigSpreadOver;
  const p95DevigSpreadOver =
    p95Raw === null || p95Raw === undefined ? null : num(p95Raw);
  return { nPpMerged, meanConsensusBookCount, meanDevigSpreadOver, p95DevigSpreadOver, shareMultiBookConsensus };
}

/**
 * Lenient parse: returns **null** only when object is unusable (not an object / no severity).
 */
export function parseMergeQualityStatusJson(raw: unknown): MergeQualityStatusDashboard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const overallSeverity = o.overallSeverity;
  if (typeof overallSeverity !== "string" || !overallSeverity.trim()) return null;

  const km = o.keyMetrics;
  let keyMetrics: MergeQualityStatusDashboard["keyMetrics"] = null;
  if (km && typeof km === "object") {
    const k = km as Record<string, unknown>;
    keyMetrics = {
      mergeCoverage: num(k.mergeCoverage),
      fallbackRate: num(k.fallbackRate),
      dropRate: num(k.dropRate),
    };
  }

  return {
    schemaVersion: typeof o.schemaVersion === "number" ? o.schemaVersion : undefined,
    generatedAtUtc: str(o.generatedAtUtc),
    overallSeverity: overallSeverity.trim(),
    liveInputDegraded: bool(o.liveInputDegraded),
    liveMergeQualityLine: str(o.liveMergeQualityLine),
    explanation: str(o.explanation),
    keyMetrics,
    driftNote: str(o.driftNote),
    ppConsensusOperatorLine: str(o.ppConsensusOperatorLine),
  };
}

function parsePassSnap(raw: unknown): PlatformPassSnapshotDashboard | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  return {
    capturedAtUtc: str(p.capturedAtUtc),
    match_rate: num(p.match_rate),
    rawProps: num(p.rawProps),
    matchEligible: num(p.matchEligible),
    merged: num(p.merged),
    unmatched_legs_count: num(p.unmatched_legs_count),
    alias_resolution_rate: num(p.alias_resolution_rate),
    explicitAliasResolutionHits: num(p.explicitAliasResolutionHits),
    multiBookConsensusPickCount: num(p.multiBookConsensusPickCount),
    dropped_due_to_missing_market: num(p.dropped_due_to_missing_market),
    dropped_due_to_line_diff: num(p.dropped_due_to_line_diff),
    oddsFetchedAtUtc: str(p.oddsFetchedAtUtc),
    oddsSnapshotAgeMinutes: num(p.oddsSnapshotAgeMinutes),
  };
}

/**
 * Lenient parse for `merge_platform_quality_by_pass.json`.
 */
export function parseMergePlatformQualityByPassJson(raw: unknown): MergePlatformQualityByPassDashboard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    schemaVersion: typeof o.schemaVersion === "number" ? o.schemaVersion : undefined,
    updatedAtUtc: str(o.updatedAtUtc),
    note: str(o.note),
    prizepicks: parsePassSnap(o.prizepicks),
    underdog: parsePassSnap(o.underdog),
  };
}

/**
 * Best-effort subset parse for optional `latest_merge_quality.json` (Phase 115 full report).
 */
export function parseLatestMergeQualityJsonForDashboard(raw: unknown): LatestMergeQualityDashboard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  let freshness: LatestMergeQualityDashboard["freshness"] = null;
  const fr = o.freshness;
  if (fr && typeof fr === "object") {
    const f = fr as Record<string, unknown>;
    freshness = {
      stalenessNote: str(f.stalenessNote),
      oddsFetchedAtUtc: str(f.oddsFetchedAtUtc),
      oddsSnapshotAgeMinutes: num(f.oddsSnapshotAgeMinutes),
      mergeVsFetchSkewMinutes: num(f.mergeVsFetchSkewMinutes),
      oddsIsFromCache: bool(f.oddsIsFromCache),
      mergeWallClockUtc: str(f.mergeWallClockUtc),
    };
  }

  let liveMergeQuality: LatestMergeQualityDashboard["liveMergeQuality"] = null;
  const lm = o.liveMergeQuality;
  if (lm && typeof lm === "object") {
    const l = lm as Record<string, unknown>;
    liveMergeQuality = {
      match_rate_pp: num(l.match_rate_pp),
      match_rate_ud: num(l.match_rate_ud),
      unmatched_legs_count: num(l.unmatched_legs_count),
      alias_resolution_rate: num(l.alias_resolution_rate),
      dropped_due_to_missing_market: num(l.dropped_due_to_missing_market),
      dropped_due_to_line_diff: num(l.dropped_due_to_line_diff),
      odds_unmatched_inventory_rows: num(l.odds_unmatched_inventory_rows),
      nearest_match_share: num(l.nearest_match_share),
      last_audit_pass_note: str(l.last_audit_pass_note),
    };
  }

  let identityNote: string | null = null;
  const id = o.identityVisibility;
  if (id && typeof id === "object") {
    identityNote = str((id as Record<string, unknown>).note);
  }

  const ppConsensusOperatorLine = str(o.ppConsensusOperatorLine);
  const ppConsensusDispersion = parsePpConsensusDispersionDash(o.ppConsensusDispersion);

  if (
    !freshness &&
    !liveMergeQuality &&
    !identityNote &&
    !ppConsensusOperatorLine &&
    !ppConsensusDispersion
  ) {
    return null;
  }

  return { freshness, liveMergeQuality, identityNote, ppConsensusOperatorLine, ppConsensusDispersion };
}

export function severityBadgeClass(sev: string): "ok" | "warn" | "fail" | "unknown" {
  const u = sev.toUpperCase();
  if (u === "INFO") return "ok";
  if (u === "WARN") return "warn";
  if (u === "FAIL") return "fail";
  return "unknown";
}
