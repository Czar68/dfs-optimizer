/**
 * Phase 44 — Deterministic dimensional merge diagnostics (additive reporting only).
 * Does not read or write merge matching logic; aggregates from MergeAuditReport + merged picks only.
 */

import fs from "fs";
import path from "path";
import type { MergedPick } from "../types";
import { stableStringifyForObservability } from "./final_selection_observability";
import type { MergeAuditReport } from "./merge_audit";

export const MERGE_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

const JSON_NAME = "latest_merge_diagnostics.json";
const MD_NAME = "latest_merge_diagnostics.md";

export function getMergeDiagnosticsPaths(cwd: string): { dir: string; jsonPath: string; mdPath: string } {
  const dir = path.join(cwd, "data", "reports");
  return {
    dir,
    jsonPath: path.join(dir, JSON_NAME),
    mdPath: path.join(dir, MD_NAME),
  };
}

function bumpNested(
  out: Record<string, Record<string, number>>,
  outer: string,
  inner: string,
  inc: number
): void {
  if (!out[outer]) out[outer] = {};
  out[outer][inner] = (out[outer][inner] ?? 0) + inc;
}

function bumpMap(out: Record<string, number>, key: string, inc: number): void {
  out[key] = (out[key] ?? 0) + inc;
}

/** `matchType` omitted on older rows — treated as `main` (same as merge observability defaults). */
function matchTypeBucket(m: MergedPick): "main" | "alt" {
  return m.matchType === "alt" ? "alt" : "main";
}

function lineDeltaKey(m: MergedPick): string {
  const d = m.altMatchDelta ?? 0;
  return d === 0 ? "0" : d.toFixed(2);
}

export interface MergeDiagnosticsReport {
  schemaVersion: typeof MERGE_DIAGNOSTICS_SCHEMA_VERSION;
  generatedAtUtc: string;
  sourceAuditGeneratedAtUtc: string;
  drops: {
    bySiteCanonical: Record<string, Record<string, number>>;
    byStatCanonical: Record<string, Record<string, number>>;
    bySportCanonical: Record<string, Record<string, number>>;
  };
  matches: {
    /** From audit `matchedBySite`: exact vs nearest primary-line match per platform. */
    lineKindBySite: Record<string, { exact: number; nearest: number; total: number }>;
    /** From merged picks: main-line pass vs alt-pool pass (`matchType`; omitted → main). */
    matchTypeBySite: Record<string, { main: number; alt: number }>;
    /** Alt-pool matches only, per platform. */
    altPoolMatchesBySite: Record<string, number>;
  };
  merged: {
    /** Alt-pool matches (`matchType === "alt"`) grouped by stat key. */
    altPoolMatchCountByStat: Record<string, number>;
    /** Line-delta histogram per stat (merged picks only; keys match audit delta bucketing). */
    lineDeltaHistogramByStat: Record<string, Record<string, number>>;
  };
  /** Echo of audit global histogram for reconciliation. */
  mergedLineDeltaHistogram: Record<string, number>;
}

export function buildMergeDiagnosticsReport(input: {
  generatedAtUtc: string;
  report: MergeAuditReport;
  merged: MergedPick[];
}): MergeDiagnosticsReport {
  const { report, merged } = input;
  const bySiteCanonical: Record<string, Record<string, number>> = {};
  const byStatCanonical: Record<string, Record<string, number>> = {};
  const bySportCanonical: Record<string, Record<string, number>> = {};

  for (const d of report.drops) {
    bumpNested(bySiteCanonical, d.site, d.canonicalReason, 1);
    bumpNested(byStatCanonical, String(d.stat), d.canonicalReason, 1);
    bumpNested(bySportCanonical, String(d.sport), d.canonicalReason, 1);
  }

  const lineKindBySite: MergeDiagnosticsReport["matches"]["lineKindBySite"] = {};
  for (const site of Object.keys(report.matchedBySite).sort((a, b) => a.localeCompare(b))) {
    const m = report.matchedBySite[site];
    lineKindBySite[site] = {
      exact: m.mergedExact,
      nearest: m.mergedNearest,
      total: m.matchedTotal,
    };
  }

  const matchTypeBySite: Record<string, { main: number; alt: number }> = {};
  const altPoolMatchesBySite: Record<string, number> = {};
  const altPoolMatchCountByStat: Record<string, number> = {};
  const lineDeltaHistogramByStat: Record<string, Record<string, number>> = {};

  for (const m of merged) {
    const site = String(m.site);
    if (!matchTypeBySite[site]) matchTypeBySite[site] = { main: 0, alt: 0 };
    const bucket = matchTypeBucket(m);
    matchTypeBySite[site][bucket]++;

    if (m.matchType === "alt") {
      bumpMap(altPoolMatchesBySite, site, 1);
      bumpMap(altPoolMatchCountByStat, String(m.stat), 1);
    }

    const statKey = String(m.stat);
    const dk = lineDeltaKey(m);
    bumpNested(lineDeltaHistogramByStat, statKey, dk, 1);
  }

  return {
    schemaVersion: MERGE_DIAGNOSTICS_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    sourceAuditGeneratedAtUtc: report.generatedAtUtc,
    drops: {
      bySiteCanonical,
      byStatCanonical,
      bySportCanonical,
    },
    matches: {
      lineKindBySite,
      matchTypeBySite,
      altPoolMatchesBySite,
    },
    merged: {
      altPoolMatchCountByStat,
      lineDeltaHistogramByStat,
    },
    mergedLineDeltaHistogram: { ...report.mergedLineDeltaHistogram },
  };
}

export function formatMergeDiagnosticsMarkdown(d: MergeDiagnosticsReport): string {
  const lines: string[] = [];
  lines.push("# Merge diagnostics (dimensional rollups)");
  lines.push("");
  lines.push(`- **Generated (UTC):** ${d.generatedAtUtc}`);
  lines.push(`- **Source audit (UTC):** ${d.sourceAuditGeneratedAtUtc}`);
  lines.push(`- **Schema:** merge_diagnostics v${d.schemaVersion}`);
  lines.push("");

  lines.push("## Drops by site × canonical reason");
  lines.push("");
  for (const site of Object.keys(d.drops.bySiteCanonical).sort((a, b) => a.localeCompare(b))) {
    lines.push(`- **${site}**`);
    const inner = d.drops.bySiteCanonical[site];
    for (const r of Object.keys(inner).sort((a, b) => a.localeCompare(b))) {
      lines.push(`  - ${r}: ${inner[r]}`);
    }
  }
  if (Object.keys(d.drops.bySiteCanonical).length === 0) lines.push("- (none)");
  lines.push("");

  lines.push("## Drops by stat × canonical reason (top lines)");
  lines.push("");
  const statKeys = Object.keys(d.drops.byStatCanonical).sort((a, b) => a.localeCompare(b));
  const maxStatLines = 40;
  let shown = 0;
  for (const st of statKeys) {
    lines.push(`- **${st}**`);
    const inner = d.drops.byStatCanonical[st];
    for (const r of Object.keys(inner).sort((a, b) => a.localeCompare(b))) {
      lines.push(`  - ${r}: ${inner[r]}`);
    }
    shown++;
    if (shown >= maxStatLines) {
      if (statKeys.length > maxStatLines) lines.push(`- … (${statKeys.length - maxStatLines} more stats omitted)`);
      break;
    }
  }
  if (statKeys.length === 0) lines.push("- (none)");
  lines.push("");

  lines.push("## Drops by sport × canonical reason");
  lines.push("");
  for (const sp of Object.keys(d.drops.bySportCanonical).sort((a, b) => a.localeCompare(b))) {
    lines.push(`- **${sp}**`);
    const inner = d.drops.bySportCanonical[sp];
    for (const r of Object.keys(inner).sort((a, b) => a.localeCompare(b))) {
      lines.push(`  - ${r}: ${inner[r]}`);
    }
  }
  if (Object.keys(d.drops.bySportCanonical).length === 0) lines.push("- (none)");
  lines.push("");

  lines.push("## Matches: line kind by site (exact / nearest)");
  lines.push("");
  for (const site of Object.keys(d.matches.lineKindBySite).sort((a, b) => a.localeCompare(b))) {
    const m = d.matches.lineKindBySite[site];
    lines.push(`- ${site}: exact=${m.exact}, nearest=${m.nearest}, total=${m.total}`);
  }
  if (Object.keys(d.matches.lineKindBySite).length === 0) lines.push("- (none)");
  lines.push("");

  lines.push("## Matches: main vs alt pool by site");
  lines.push("");
  for (const site of Object.keys(d.matches.matchTypeBySite).sort((a, b) => a.localeCompare(b))) {
    const m = d.matches.matchTypeBySite[site];
    lines.push(`- ${site}: main=${m.main}, alt=${m.alt}`);
  }
  if (Object.keys(d.matches.matchTypeBySite).length === 0) lines.push("- (none)");
  lines.push("");

  lines.push("## Alt-pool matches by site");
  lines.push("");
  for (const site of Object.keys(d.matches.altPoolMatchesBySite).sort((a, b) => a.localeCompare(b))) {
    lines.push(`- ${site}: ${d.matches.altPoolMatchesBySite[site]}`);
  }
  if (Object.keys(d.matches.altPoolMatchesBySite).length === 0) lines.push("- (none)");
  lines.push("");

  lines.push("## Alt-pool matches by stat");
  lines.push("");
  for (const st of Object.keys(d.merged.altPoolMatchCountByStat).sort((a, b) => a.localeCompare(b))) {
    lines.push(`- ${st}: ${d.merged.altPoolMatchCountByStat[st]}`);
  }
  if (Object.keys(d.merged.altPoolMatchCountByStat).length === 0) lines.push("- (none)");
  lines.push("");

  lines.push("## Line-delta histogram by stat (sample)");
  lines.push("");
  const hstatKeys = Object.keys(d.merged.lineDeltaHistogramByStat).sort((a, b) => a.localeCompare(b));
  const maxH = 25;
  let hshown = 0;
  for (const st of hstatKeys) {
    lines.push(`- **${st}**`);
    const inner = d.merged.lineDeltaHistogramByStat[st];
    for (const r of Object.keys(inner).sort((a, b) => a.localeCompare(b))) {
      lines.push(`  - Δ=${r}: ${inner[r]}`);
    }
    hshown++;
    if (hshown >= maxH) {
      if (hstatKeys.length > maxH) lines.push(`- … (${hstatKeys.length - maxH} more stats omitted)`);
      break;
    }
  }
  if (hstatKeys.length === 0) lines.push("- (none)");
  lines.push("");

  lines.push("## Global line-delta histogram (audit echo)");
  lines.push("");
  for (const k of Object.keys(d.mergedLineDeltaHistogram).sort((a, b) => a.localeCompare(b))) {
    lines.push(`- Δ=${k}: ${d.mergedLineDeltaHistogram[k]}`);
  }
  if (Object.keys(d.mergedLineDeltaHistogram).length === 0) lines.push("- (none)");
  lines.push("");

  return lines.join("\n");
}

export function writeMergeDiagnosticsArtifacts(cwd: string, report: MergeDiagnosticsReport): void {
  const { dir, jsonPath, mdPath } = getMergeDiagnosticsPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, stableStringifyForObservability(report), "utf8");
  fs.writeFileSync(mdPath, formatMergeDiagnosticsMarkdown(report), "utf8");
}
