/**
 * Phase 67 — Canonical tracker completeness metrics for calibration inputs.
 * Read-only definitions; no EV/breakeven math.
 */

import type { PerfTrackerRow } from "../perf_tracker_types";

export const TRACKER_INTEGRITY_SCHEMA_VERSION = 1;

/** Primary blocker for a resolved row that is not fully calibratable (first missing in contract order). */
export type TrackerCompletenessPrimaryReason =
  | "fully_calibratable"
  | "missing_platform"
  | "missing_true_prob"
  | "missing_implied_prob"
  | "missing_projected_ev";

export interface TrackerCompletenessSnapshot {
  totalRows: number;
  resolvedRows: number;
  resolvedRowsWithPlatform: number;
  resolvedRowsWithTrueProb: number;
  resolvedRowsWithImpliedProb: number;
  resolvedRowsWithProjectedEv: number;
  resolvedRowsFullyCalibratable: number;
  platformCoverageRate: number;
  trueProbCoverageRate: number;
  impliedProbCoverageRate: number;
  projectedEvCoverageRate: number;
  fullyCalibratableRate: number;
}

export function isResolvedRow(r: PerfTrackerRow): boolean {
  return r.result === 0 || r.result === 1;
}

/** PP/UD from explicit platform or deterministic leg_id prefix (same grounding as calibration surface). */
export function inferPlatformGrounded(r: PerfTrackerRow): "PP" | "UD" | undefined {
  const p = r.platform?.trim().toUpperCase();
  if (p === "PP") return "PP";
  if (p === "UD") return "UD";
  const id = (r.leg_id || "").toLowerCase();
  if (id.includes("prizepicks")) return "PP";
  if (id.includes("underdog")) return "UD";
  return undefined;
}

export function hasPlatformGrounded(r: PerfTrackerRow): boolean {
  return inferPlatformGrounded(r) != null;
}

export function hasFiniteTrueProb(r: PerfTrackerRow): boolean {
  return typeof r.trueProb === "number" && Number.isFinite(r.trueProb);
}

export function hasFiniteImpliedProb(r: PerfTrackerRow): boolean {
  return typeof r.impliedProb === "number" && Number.isFinite(r.impliedProb);
}

export function hasFiniteProjectedEv(r: PerfTrackerRow): boolean {
  return typeof r.projectedEV === "number" && Number.isFinite(r.projectedEV);
}

export function isFullyCalibratableResolved(r: PerfTrackerRow): boolean {
  if (!isResolvedRow(r)) return false;
  return (
    hasPlatformGrounded(r) &&
    hasFiniteTrueProb(r) &&
    hasFiniteImpliedProb(r) &&
    hasFiniteProjectedEv(r)
  );
}

/** Caller must pass a resolved row (result 0|1). */
export function primaryCompletenessReasonResolved(r: PerfTrackerRow): TrackerCompletenessPrimaryReason {
  if (!hasPlatformGrounded(r)) return "missing_platform";
  if (!hasFiniteTrueProb(r)) return "missing_true_prob";
  if (!hasFiniteImpliedProb(r)) return "missing_implied_prob";
  if (!hasFiniteProjectedEv(r)) return "missing_projected_ev";
  return "fully_calibratable";
}

export function computeTrackerCompleteness(rows: PerfTrackerRow[]): TrackerCompletenessSnapshot {
  const totalRows = rows.length;
  const resolved = rows.filter(isResolvedRow);
  const resolvedRows = resolved.length;
  let resolvedRowsWithPlatform = 0;
  let resolvedRowsWithTrueProb = 0;
  let resolvedRowsWithImpliedProb = 0;
  let resolvedRowsWithProjectedEv = 0;
  let resolvedRowsFullyCalibratable = 0;
  for (const r of resolved) {
    if (hasPlatformGrounded(r)) resolvedRowsWithPlatform++;
    if (hasFiniteTrueProb(r)) resolvedRowsWithTrueProb++;
    if (hasFiniteImpliedProb(r)) resolvedRowsWithImpliedProb++;
    if (hasFiniteProjectedEv(r)) resolvedRowsWithProjectedEv++;
    if (isFullyCalibratableResolved(r)) resolvedRowsFullyCalibratable++;
  }
  const z = (n: number) => (resolvedRows === 0 ? 0 : n / resolvedRows);
  return {
    totalRows,
    resolvedRows,
    resolvedRowsWithPlatform,
    resolvedRowsWithTrueProb,
    resolvedRowsWithImpliedProb,
    resolvedRowsWithProjectedEv,
    resolvedRowsFullyCalibratable,
    platformCoverageRate: z(resolvedRowsWithPlatform),
    trueProbCoverageRate: z(resolvedRowsWithTrueProb),
    impliedProbCoverageRate: z(resolvedRowsWithImpliedProb),
    projectedEvCoverageRate: z(resolvedRowsWithProjectedEv),
    fullyCalibratableRate: z(resolvedRowsFullyCalibratable),
  };
}

export function countPrimaryReasonsForNonCalibratableResolved(
  rows: PerfTrackerRow[]
): Record<Exclude<TrackerCompletenessPrimaryReason, "fully_calibratable">, number> {
  const out: Record<string, number> = {
    missing_platform: 0,
    missing_true_prob: 0,
    missing_implied_prob: 0,
    missing_projected_ev: 0,
  };
  for (const r of rows) {
    if (!isResolvedRow(r)) continue;
    const pr = primaryCompletenessReasonResolved(r);
    if (pr === "fully_calibratable") continue;
    out[pr] = (out[pr] ?? 0) + 1;
  }
  return out as Record<Exclude<TrackerCompletenessPrimaryReason, "fully_calibratable">, number>;
}

/** All missing flags for a resolved row (for diagnostics). */
export function listMissingFlags(r: PerfTrackerRow): string[] {
  if (!isResolvedRow(r)) return [];
  const m: string[] = [];
  if (!hasPlatformGrounded(r)) m.push("missing_platform");
  if (!hasFiniteTrueProb(r)) m.push("missing_true_prob");
  if (!hasFiniteImpliedProb(r)) m.push("missing_implied_prob");
  if (!hasFiniteProjectedEv(r)) m.push("missing_projected_ev");
  return m;
}
