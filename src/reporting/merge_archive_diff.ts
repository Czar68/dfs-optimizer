/**
 * Phase 47 — Merge artifact archival + read-only diff (additive tooling only).
 * Does not import or modify merge matching logic.
 */

import fs from "fs";
import path from "path";
import { stableStringifyForObservability } from "./final_selection_observability";

export const MERGE_ARCHIVE_MANIFEST_SCHEMA_VERSION = 1 as const;
export const MERGE_ARCHIVE_DIFF_SCHEMA_VERSION = 1 as const;

/** Repo-relative root for archived merge snapshots (under cwd). */
export function mergeArchiveRootRel(): string {
  return path.join("data", "reports", "merge_archive");
}

export const ARCHIVED_FILE_NAMES = {
  audit: "merge_audit.json",
  quality: "merge_quality.json",
  diagnostics: "merge_diagnostics.json",
  playerDiagnostics: "merge_player_diagnostics.json",
  ppNoCandidateObservability: "merge_pp_no_candidate_observability.json",
  status: "merge_quality_status.json",
  manifest: "manifest.json",
} as const;

const SOURCE_LATEST = {
  audit: "latest_merge_audit.json",
  quality: "latest_merge_quality.json",
  diagnostics: "latest_merge_diagnostics.json",
  playerDiagnostics: "latest_merge_player_diagnostics.json",
  ppNoCandidateObservability: "latest_merge_pp_no_candidate_observability.json",
  status: "merge_quality_status.json",
} as const;

/** Safe directory name from ISO UTC (filesystems may reject `:` in paths). */
export function sanitizeSnapshotIdForPath(isoUtc: string): string {
  return String(isoUtc).trim().replace(/:/g, "-");
}

function reportsDir(cwd: string): string {
  return path.join(cwd, "data", "reports");
}

function readJsonIfExists<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Prefer `merge_quality_status.generatedAtUtc`, else `latest_merge_audit.generatedAtUtc`.
 */
export function resolveSnapshotIdFromReports(cwd: string): string | null {
  const st = readJsonIfExists<{ generatedAtUtc?: string }>(
    path.join(reportsDir(cwd), SOURCE_LATEST.status)
  );
  if (st?.generatedAtUtc) return sanitizeSnapshotIdForPath(st.generatedAtUtc);
  const au = readJsonIfExists<{ generatedAtUtc?: string }>(
    path.join(reportsDir(cwd), SOURCE_LATEST.audit)
  );
  if (au?.generatedAtUtc) return sanitizeSnapshotIdForPath(au.generatedAtUtc);
  return null;
}

export interface MergeArchiveManifest {
  schemaVersion: typeof MERGE_ARCHIVE_MANIFEST_SCHEMA_VERSION;
  snapshotId: string;
  label: string | null;
  archivedAtUtc: string;
  cwd: string;
  entries: Array<{
    fromRelative: string;
    toFile: string;
    copied: boolean;
    bytes: number | null;
  }>;
}

export interface ArchiveMergeArtifactsResult {
  destDir: string;
  snapshotId: string;
  manifest: MergeArchiveManifest;
}

/**
 * Copies latest merge JSON artifacts into `data/reports/merge_archive/<snapshotId>/`.
 * Only writes under `merge_archive/`; does not mutate source reports.
 */
export function archiveMergeArtifacts(
  cwd: string,
  options?: { snapshotId?: string; label?: string | null }
): ArchiveMergeArtifactsResult {
  const resolved =
    options?.snapshotId?.trim() ||
    resolveSnapshotIdFromReports(cwd) ||
    sanitizeSnapshotIdForPath(new Date().toISOString());
  const snapshotId = options?.label
    ? `${resolved}__${sanitizeSnapshotIdForPath(options.label).replace(/[/\\]/g, "_")}`
    : resolved;

  const root = path.join(cwd, mergeArchiveRootRel());
  const destDir = path.join(root, snapshotId);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const rd = reportsDir(cwd);
  const pairs: Array<{ from: string; fromRel: string; toName: string }> = [
    { from: path.join(rd, SOURCE_LATEST.audit), fromRel: path.join("data", "reports", SOURCE_LATEST.audit), toName: ARCHIVED_FILE_NAMES.audit },
    { from: path.join(rd, SOURCE_LATEST.quality), fromRel: path.join("data", "reports", SOURCE_LATEST.quality), toName: ARCHIVED_FILE_NAMES.quality },
    { from: path.join(rd, SOURCE_LATEST.diagnostics), fromRel: path.join("data", "reports", SOURCE_LATEST.diagnostics), toName: ARCHIVED_FILE_NAMES.diagnostics },
    { from: path.join(rd, SOURCE_LATEST.playerDiagnostics), fromRel: path.join("data", "reports", SOURCE_LATEST.playerDiagnostics), toName: ARCHIVED_FILE_NAMES.playerDiagnostics },
    {
      from: path.join(rd, SOURCE_LATEST.ppNoCandidateObservability),
      fromRel: path.join("data", "reports", SOURCE_LATEST.ppNoCandidateObservability),
      toName: ARCHIVED_FILE_NAMES.ppNoCandidateObservability,
    },
    { from: path.join(rd, SOURCE_LATEST.status), fromRel: path.join("data", "reports", SOURCE_LATEST.status), toName: ARCHIVED_FILE_NAMES.status },
  ];

  const archivedAtUtc = new Date().toISOString();
  const entries: MergeArchiveManifest["entries"] = [];

  for (const { from, fromRel, toName } of pairs) {
    let copied = false;
    let bytes: number | null = null;
    if (fs.existsSync(from)) {
      const buf = fs.readFileSync(from);
      bytes = buf.length;
      fs.writeFileSync(path.join(destDir, toName), buf);
      copied = true;
    }
    entries.push({ fromRelative: fromRel.replace(/\\/g, "/"), toFile: toName, copied, bytes });
  }

  const manifest: MergeArchiveManifest = {
    schemaVersion: MERGE_ARCHIVE_MANIFEST_SCHEMA_VERSION,
    snapshotId,
    label: options?.label ?? null,
    archivedAtUtc,
    cwd: path.resolve(cwd),
    entries,
  };
  fs.writeFileSync(
    path.join(destDir, ARCHIVED_FILE_NAMES.manifest),
    stableStringifyForObservability(manifest),
    "utf8"
  );

  return { destDir, snapshotId, manifest };
}

interface StatusMetrics {
  generatedAtUtc: string;
  overallSeverity: string;
  mergeCoverage: number | null;
  fallbackRate: number | null;
  dropRate: number | null;
}

function parseStatus(p: string): StatusMetrics | null {
  const j = readJsonIfExists<{
    generatedAtUtc?: string;
    overallSeverity?: string;
    keyMetrics?: { mergeCoverage?: number | null; fallbackRate?: number | null; dropRate?: number | null };
  }>(p);
  if (!j?.generatedAtUtc) return null;
  return {
    generatedAtUtc: j.generatedAtUtc,
    overallSeverity: j.overallSeverity ?? "UNKNOWN",
    mergeCoverage: j.keyMetrics?.mergeCoverage ?? null,
    fallbackRate: j.keyMetrics?.fallbackRate ?? null,
    dropRate: j.keyMetrics?.dropRate ?? null,
  };
}

interface AuditTotals {
  generatedAtUtc?: string;
  droppedByCanonicalReason: Record<string, number>;
  totals: { matched: number; dropped: number; rawProps: number };
}

function parseAudit(p: string): AuditTotals | null {
  const j = readJsonIfExists<AuditTotals>(p);
  if (!j?.totals) return null;
  return {
    generatedAtUtc: j.generatedAtUtc,
    droppedByCanonicalReason: j.droppedByCanonicalReason ?? {},
    totals: j.totals,
  };
}

function parseDiagnostics(p: string): { drops: { byStatCanonical: Record<string, Record<string, number>> } } | null {
  return readJsonIfExists<{ drops: { byStatCanonical: Record<string, Record<string, number>> } }>(p);
}

function numDelta(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (b ?? NaN) - (a ?? NaN);
}

function diffReasonMaps(
  left: Record<string, number>,
  right: Record<string, number>
): Record<string, number> {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const out: Record<string, number> = {};
  for (const k of [...keys].sort((a, b) => a.localeCompare(b))) {
    const d = (right[k] ?? 0) - (left[k] ?? 0);
    if (d !== 0) out[k] = d;
  }
  return out;
}

function diffNestedDropMaps(
  left: Record<string, Record<string, number>>,
  right: Record<string, Record<string, number>>
): string[] {
  const lines: string[] = [];
  const stats = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const st of [...stats].sort((a, b) => a.localeCompare(b))) {
    const lr = left[st] ?? {};
    const rr = right[st] ?? {};
    const reasons = new Set([...Object.keys(lr), ...Object.keys(rr)]);
    for (const r of [...reasons].sort((a, b) => a.localeCompare(b))) {
      const d = (rr[r] ?? 0) - (lr[r] ?? 0);
      if (d !== 0) lines.push(`stat=${st} canonical=${r}: delta=${d}`);
    }
  }
  return lines;
}

export interface MergeArchiveDiffReport {
  schemaVersion: typeof MERGE_ARCHIVE_DIFF_SCHEMA_VERSION;
  generatedAtUtc: string;
  leftDir: string;
  rightDir: string;
  leftSnapshotId: string;
  rightSnapshotId: string;
  keyMetrics: {
    mergeCoverageDelta: number | null;
    dropRateDelta: number | null;
    fallbackRateDelta: number | null;
    severity: { left: string; right: string };
  };
  auditTotals: {
    matchedDelta: number | null;
    droppedDelta: number | null;
    rawPropsDelta: number | null;
  };
  droppedByCanonicalReasonDelta: Record<string, number>;
  diagnosticsByStatCanonicalDeltaLines: string[];
}

/**
 * Read-only diff of two archived snapshot directories (each containing ARCHIVED_FILE_NAMES).
 */
export function buildMergeArchiveDiffReport(leftDir: string, rightDir: string): MergeArchiveDiffReport {
  const generatedAtUtc = new Date().toISOString();
  const leftStatus = parseStatus(path.join(leftDir, ARCHIVED_FILE_NAMES.status));
  const rightStatus = parseStatus(path.join(rightDir, ARCHIVED_FILE_NAMES.status));
  const leftAudit = parseAudit(path.join(leftDir, ARCHIVED_FILE_NAMES.audit));
  const rightAudit = parseAudit(path.join(rightDir, ARCHIVED_FILE_NAMES.audit));
  const leftDiag = parseDiagnostics(path.join(leftDir, ARCHIVED_FILE_NAMES.diagnostics));
  const rightDiag = parseDiagnostics(path.join(rightDir, ARCHIVED_FILE_NAMES.diagnostics));

  const leftSnapshotId = path.basename(path.resolve(leftDir));
  const rightSnapshotId = path.basename(path.resolve(rightDir));

  const droppedDelta = diffReasonMaps(
    leftAudit?.droppedByCanonicalReason ?? {},
    rightAudit?.droppedByCanonicalReason ?? {}
  );

  let diagLines: string[] = [];
  if (leftDiag?.drops?.byStatCanonical && rightDiag?.drops?.byStatCanonical) {
    diagLines = diffNestedDropMaps(leftDiag.drops.byStatCanonical, rightDiag.drops.byStatCanonical);
  }

  return {
    schemaVersion: MERGE_ARCHIVE_DIFF_SCHEMA_VERSION,
    generatedAtUtc,
    leftDir: path.resolve(leftDir),
    rightDir: path.resolve(rightDir),
    leftSnapshotId,
    rightSnapshotId,
    keyMetrics: {
      mergeCoverageDelta: numDelta(leftStatus?.mergeCoverage ?? null, rightStatus?.mergeCoverage ?? null),
      dropRateDelta: numDelta(leftStatus?.dropRate ?? null, rightStatus?.dropRate ?? null),
      fallbackRateDelta: numDelta(leftStatus?.fallbackRate ?? null, rightStatus?.fallbackRate ?? null),
      severity: {
        left: leftStatus?.overallSeverity ?? "UNKNOWN",
        right: rightStatus?.overallSeverity ?? "UNKNOWN",
      },
    },
    auditTotals: {
      matchedDelta: numDelta(leftAudit?.totals.matched ?? null, rightAudit?.totals.matched ?? null),
      droppedDelta: numDelta(leftAudit?.totals.dropped ?? null, rightAudit?.totals.dropped ?? null),
      rawPropsDelta: numDelta(leftAudit?.totals.rawProps ?? null, rightAudit?.totals.rawProps ?? null),
    },
    droppedByCanonicalReasonDelta: droppedDelta,
    diagnosticsByStatCanonicalDeltaLines: diagLines,
  };
}

export function formatMergeArchiveDiffMarkdown(d: MergeArchiveDiffReport): string {
  const lines: string[] = [];
  lines.push("# Merge archive diff");
  lines.push("");
  lines.push(`- **Generated (UTC):** ${d.generatedAtUtc}`);
  lines.push(`- **Left:** \`${d.leftSnapshotId}\``);
  lines.push(`- **Right:** \`${d.rightSnapshotId}\``);
  lines.push("");
  lines.push("## Key metrics (status)");
  lines.push("");
  lines.push(`- mergeCoverage: Δ ${fmtDelta(d.keyMetrics.mergeCoverageDelta)}`);
  lines.push(`- dropRate: Δ ${fmtDelta(d.keyMetrics.dropRateDelta)}`);
  lines.push(`- fallbackRate: Δ ${fmtDelta(d.keyMetrics.fallbackRateDelta)}`);
  lines.push(`- severity: ${d.keyMetrics.severity.left} → ${d.keyMetrics.severity.right}`);
  lines.push("");
  lines.push("## Audit totals");
  lines.push("");
  lines.push(`- matched: Δ ${fmtDelta(d.auditTotals.matchedDelta)}`);
  lines.push(`- dropped: Δ ${fmtDelta(d.auditTotals.droppedDelta)}`);
  lines.push(`- rawProps: Δ ${fmtDelta(d.auditTotals.rawPropsDelta)}`);
  lines.push("");
  lines.push("## Dropped by canonical reason (right − left)");
  lines.push("");
  const dr = d.droppedByCanonicalReasonDelta;
  const drKeys = Object.keys(dr).sort((a, b) => a.localeCompare(b));
  if (drKeys.length === 0) lines.push("- (no change)");
  else for (const k of drKeys) lines.push(`- ${k}: ${dr[k]}`);
  lines.push("");
  lines.push("## Diagnostics: stat × canonical drop deltas");
  lines.push("");
  if (d.diagnosticsByStatCanonicalDeltaLines.length === 0) lines.push("- (none)");
  else for (const l of d.diagnosticsByStatCanonicalDeltaLines) lines.push(`- ${l}`);
  lines.push("");
  return lines.join("\n");
}

function fmtDelta(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "null";
  return v.toFixed(6);
}
