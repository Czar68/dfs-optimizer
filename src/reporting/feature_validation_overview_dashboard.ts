/**
 * Phase 109 — Browser/dashboard-safe parse for `latest_feature_validation_overview.json` (read-only; no math).
 */

export type FeatureValidationOverviewDashboard = {
  effectivePolicy: string
  lastExportPolicy: string | null
  summaryLine: string
  replayReadiness: {
    gradedRows: number
    counts: {
      replayReadySnapshotBound: number
      strictValidationEligible: number
      legacyWithoutSnapshotId: number
      snapshotBoundMissingSnapshotDir: number
    }
  }
  snapshotAdoption: {
    totalRows: number
    rowsWithLegsSnapshotId: number
    gradedTotal: number
    gradedWithLegsSnapshotId: number
  }
  newRowEnforcement: {
    blockedMissingLegsSnapshotId: number
    appendedWithoutLegsSnapshotIdOverride: number
  } | null
}

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null
}

/**
 * Returns **null** when JSON is missing required fields (invalid / wrong version).
 */
export function parseFeatureValidationOverviewDashboardJson(raw: unknown): FeatureValidationOverviewDashboard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const effectivePolicy = o.effectivePolicy;
  if (typeof effectivePolicy !== "string" || !effectivePolicy.trim()) return null;
  const summaryLine = o.summaryLine;
  if (typeof summaryLine !== "string") return null;

  const last = o.lastExportPolicy;
  const lastExportPolicy =
    last === null ? null : typeof last === "string" && last.trim() ? last.trim() : null;

  const rr = o.replayReadiness;
  if (!rr || typeof rr !== "object") return null;
  const rro = rr as Record<string, unknown>;
  const gradedRows = num(rro.gradedRows);
  if (gradedRows === null || gradedRows < 0) return null;
  const counts = rro.counts;
  if (!counts || typeof counts !== "object") return null;
  const co = counts as Record<string, unknown>;
  const replayReadySnapshotBound = num(co.replayReadySnapshotBound);
  const strictValidationEligible = num(co.strictValidationEligible);
  const legacyWithoutSnapshotId = num(co.legacyWithoutSnapshotId);
  const snapshotBoundMissingSnapshotDir = num(co.snapshotBoundMissingSnapshotDir);
  if (
    replayReadySnapshotBound === null ||
    strictValidationEligible === null ||
    legacyWithoutSnapshotId === null ||
    snapshotBoundMissingSnapshotDir === null
  ) {
    return null;
  }

  const sa = o.snapshotAdoption;
  if (!sa || typeof sa !== "object") return null;
  const sao = sa as Record<string, unknown>;
  const totalRows = num(sao.totalRows);
  const rowsWithLegsSnapshotId = num(sao.rowsWithLegsSnapshotId);
  const gradedTotal = num(sao.gradedTotal);
  const gradedWithLegsSnapshotId = num(sao.gradedWithLegsSnapshotId);
  if (
    totalRows === null ||
    rowsWithLegsSnapshotId === null ||
    gradedTotal === null ||
    gradedWithLegsSnapshotId === null
  ) {
    return null;
  }

  const ne = o.newRowEnforcement;
  let newRowEnforcement: FeatureValidationOverviewDashboard["newRowEnforcement"] = null;
  if (ne !== null && ne !== undefined) {
    if (typeof ne !== "object") return null;
    const neo = ne as Record<string, unknown>;
    const b = num(neo.blockedMissingLegsSnapshotId);
    const ov = num(neo.appendedWithoutLegsSnapshotIdOverride);
    if (b === null || ov === null) return null;
    newRowEnforcement = { blockedMissingLegsSnapshotId: b, appendedWithoutLegsSnapshotIdOverride: ov };
  }

  return {
    effectivePolicy: effectivePolicy.trim(),
    lastExportPolicy,
    summaryLine,
    replayReadiness: {
      gradedRows,
      counts: {
        replayReadySnapshotBound,
        strictValidationEligible,
        legacyWithoutSnapshotId,
        snapshotBoundMissingSnapshotDir,
      },
    },
    snapshotAdoption: {
      totalRows,
      rowsWithLegsSnapshotId,
      gradedTotal,
      gradedWithLegsSnapshotId,
    },
    newRowEnforcement,
  };
}
