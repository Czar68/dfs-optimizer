/**
 * Phase 66 — Calibration surface (read-only reporting).
 * Compares predicted edge / EV vs realized outcomes using resolved perf_tracker legs only.
 * No optimizer math changes; bucketing is deterministic.
 */

import { getStructure } from "../config/parlay_structures";
import type { PerfTrackerRow } from "../perf_tracker_types";
import { rowRealizedProfitPerUnit } from "../tracking/export_model_evaluation";

export const CALIBRATION_SURFACE_SCHEMA_VERSION = 1;

/** Edge / EV bucket boundaries (fraction, e.g. 0.02 = 2%). */
export const EDGE_EV_BUCKET_BOUNDARIES = [0.02, 0.04, 0.06, 0.08] as const;

export const EDGE_BUCKET_IDS = [
  "lt_2pct",
  "2_4pct",
  "4_6pct",
  "6_8pct",
  "ge_8pct",
  "edge_unavailable",
] as const;

export const EV_BUCKET_IDS = [
  "ev_lt_2pct",
  "ev_2_4pct",
  "ev_4_6pct",
  "ev_6_8pct",
  "ev_ge_8pct",
  "ev_unavailable",
] as const;

export type EdgeBucketId = (typeof EDGE_BUCKET_IDS)[number];
export type EvBucketId = (typeof EV_BUCKET_IDS)[number];

export interface SurfaceSliceRow {
  sliceKey: string;
  sampleCount: number;
  winRate: number | null;
  /** Mean(trueProb − impliedProb) over legs where both are finite; null if none. */
  averagePredictedEdge: number | null;
  predictedEdgeBasisCount: number;
  /** Mean projectedEV (leg EV) where finite; null if none. */
  averagePredictedEv: number | null;
  predictedEvBasisCount: number;
  /** Mean stake=1 P/L from American odds when available (reporting-only). */
  realizedReturnProxy: number | null;
  realizedReturnBasisCount: number;
}

export interface CalibrationSurfaceReport {
  schemaVersion: number;
  generatedAtUtc: string;
  dataSource: {
    path: string;
    note: string;
  };
  definitions: {
    predictedEdge: string;
    predictedEv: string;
    winRate: string;
    realizedReturnProxy: string;
    edgeBuckets: string[];
    evBuckets: string[];
    /** Phase 67 — pointer to calibration-input completeness (additive). */
    trackerIntegrity: string;
  };
  rowCounts: {
    totalInFile: number;
    resolvedLegs: number;
    resolvedWithPlatformInferred: number;
    resolvedWithStructure: number;
    resolvedWithLegCount: number;
  };
  slices: {
    bySite: SurfaceSliceRow[];
    byStructure: SurfaceSliceRow[];
    /** Registry `type` (Power / Flex / Standard) when structure matches parlay_structures; else unknown. */
    byFlexKind: SurfaceSliceRow[];
    byLegCount: SurfaceSliceRow[];
    byEdgeBucket: SurfaceSliceRow[];
    byEvBucket: SurfaceSliceRow[];
    bySiteAndEdgeBucket: SurfaceSliceRow[];
  };
  notes: string[];
}

export function computePredictedEdge(row: PerfTrackerRow): number | null {
  if (typeof row.trueProb !== "number" || !Number.isFinite(row.trueProb)) return null;
  if (typeof row.impliedProb !== "number" || !Number.isFinite(row.impliedProb)) return null;
  return row.trueProb - row.impliedProb;
}

export function inferSite(row: PerfTrackerRow): "PP" | "UD" | "unknown" {
  const p = row.platform?.trim().toUpperCase();
  if (p === "PP") return "PP";
  if (p === "UD") return "UD";
  const id = (row.leg_id || "").toLowerCase();
  if (id.includes("prizepicks")) return "PP";
  if (id.includes("underdog")) return "UD";
  return "unknown";
}

export function inferLegCountFromStructure(structure: string | undefined): number | null {
  if (!structure?.trim()) return null;
  const def = getStructure(structure.trim());
  return def?.size ?? null;
}

export function inferStructureFlexKind(structure: string | undefined): string {
  if (!structure?.trim()) return "unknown";
  const def = getStructure(structure.trim());
  return def?.type ?? "unknown";
}

/**
 * Maps predicted edge (fraction) to bucket id; `edge_unavailable` is only for missing edge inputs
 * (use `edgeBucketIdForRow` for row-level bucketing).
 */
export function edgeBucketId(edge: number): EdgeBucketId {
  if (!Number.isFinite(edge)) return "edge_unavailable";
  if (edge < EDGE_EV_BUCKET_BOUNDARIES[0]) return "lt_2pct";
  if (edge < EDGE_EV_BUCKET_BOUNDARIES[1]) return "2_4pct";
  if (edge < EDGE_EV_BUCKET_BOUNDARIES[2]) return "4_6pct";
  if (edge < EDGE_EV_BUCKET_BOUNDARIES[3]) return "6_8pct";
  return "ge_8pct";
}

export function edgeBucketIdForRow(row: PerfTrackerRow): EdgeBucketId {
  const e = computePredictedEdge(row);
  if (e == null) return "edge_unavailable";
  return edgeBucketId(e);
}

export function evBucketId(ev: number): EvBucketId {
  if (!Number.isFinite(ev)) return "ev_unavailable";
  if (ev < EDGE_EV_BUCKET_BOUNDARIES[0]) return "ev_lt_2pct";
  if (ev < EDGE_EV_BUCKET_BOUNDARIES[1]) return "ev_2_4pct";
  if (ev < EDGE_EV_BUCKET_BOUNDARIES[2]) return "ev_4_6pct";
  if (ev < EDGE_EV_BUCKET_BOUNDARIES[3]) return "ev_6_8pct";
  return "ev_ge_8pct";
}

export function evBucketIdForRow(row: PerfTrackerRow): EvBucketId {
  if (typeof row.projectedEV !== "number" || !Number.isFinite(row.projectedEV)) return "ev_unavailable";
  return evBucketId(row.projectedEV);
}

/** Exposed for tests; same logic used inside buildCalibrationSurfaceReport. */
export function aggregateRows(rows: PerfTrackerRow[], sliceKey: string): SurfaceSliceRow {
  const n = rows.length;
  if (n === 0) {
    return {
      sliceKey,
      sampleCount: 0,
      winRate: null,
      averagePredictedEdge: null,
      predictedEdgeBasisCount: 0,
      averagePredictedEv: null,
      predictedEvBasisCount: 0,
      realizedReturnProxy: null,
      realizedReturnBasisCount: 0,
    };
  }
  let hits = 0;
  let edgeSum = 0;
  let edgeN = 0;
  let evSum = 0;
  let evN = 0;
  let roiSum = 0;
  let roiN = 0;
  for (const r of rows) {
    if (r.result === 1) hits++;
    const pe = computePredictedEdge(r);
    if (pe != null && Number.isFinite(pe)) {
      edgeSum += pe;
      edgeN++;
    }
    if (typeof r.projectedEV === "number" && Number.isFinite(r.projectedEV)) {
      evSum += r.projectedEV;
      evN++;
    }
    const roi = rowRealizedProfitPerUnit(r);
    if (typeof roi === "number" && Number.isFinite(roi)) {
      roiSum += roi;
      roiN++;
    }
  }
  const winRate = hits / n;
  return {
    sliceKey,
    sampleCount: n,
    winRate: Number.isFinite(winRate) ? winRate : null,
    averagePredictedEdge: edgeN > 0 ? edgeSum / edgeN : null,
    predictedEdgeBasisCount: edgeN,
    averagePredictedEv: evN > 0 ? evSum / evN : null,
    predictedEvBasisCount: evN,
    realizedReturnProxy: roiN > 0 ? roiSum / roiN : null,
    realizedReturnBasisCount: roiN,
  };
}

function sortedKeys(map: Map<string, PerfTrackerRow[]>): string[] {
  return [...map.keys()].sort((a, b) => a.localeCompare(b));
}

function groupBy(rows: PerfTrackerRow[], keyFn: (r: PerfTrackerRow) => string): Map<string, PerfTrackerRow[]> {
  const m = new Map<string, PerfTrackerRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  return m;
}

function buildSlicesFromMap(m: Map<string, PerfTrackerRow[]>): SurfaceSliceRow[] {
  const out: SurfaceSliceRow[] = [];
  for (const k of sortedKeys(m)) {
    out.push(aggregateRows(m.get(k) ?? [], k));
  }
  return out;
}

const EDGE_BUCKET_LABELS: Record<string, string> = {
  lt_2pct: "<2%",
  "2_4pct": "2–4%",
  "4_6pct": "4–6%",
  "6_8pct": "6–8%",
  ge_8pct: "8%+",
  edge_unavailable: "edge_unavailable",
};

const EV_BUCKET_LABELS: Record<string, string> = {
  ev_lt_2pct: "<2%",
  ev_2_4pct: "2–4%",
  ev_4_6pct: "4–6%",
  ev_6_8pct: "6–8%",
  ev_ge_8pct: "8%+",
  ev_unavailable: "ev_unavailable",
};

export function buildCalibrationSurfaceReport(rowsAll: PerfTrackerRow[], generatedAtUtc: string): CalibrationSurfaceReport {
  const resolved = rowsAll.filter((r) => r.result === 0 || r.result === 1);
  const notes: string[] = [];
  notes.push("Only legs with result in {0,1} are included (resolved).");
  notes.push(
    "predictedEdge = trueProb − impliedProb when both are present on the row; otherwise edge bucket = edge_unavailable."
  );
  notes.push("predictedEv = projectedEV (leg-level EV at selection).");
  notes.push(
    "realizedReturnProxy = mean per-leg profit at stake=1 from American open/chosen odds when available; otherwise basis count < sampleCount."
  );
  notes.push("Site uses row.platform when set; else inferred from leg_id prefix (prizepicks / underdog).");

  const bySiteMap = groupBy(resolved, (r) => inferSite(r));
  const byStructureMap = groupBy(resolved, (r) => {
    const s = r.structure?.trim();
    return s ? s.toUpperCase() : "unknown";
  });
  const byLegCountMap = groupBy(resolved, (r) => {
    const n = inferLegCountFromStructure(r.structure);
    return n != null ? String(n) : "unknown";
  });
  const byFlexKindMap = groupBy(resolved, (r) => inferStructureFlexKind(r.structure));

  const byEdgeMap = groupBy(resolved, (r) => edgeBucketIdForRow(r));
  const byEvMap = groupBy(resolved, (r) => evBucketIdForRow(r));

  const siteEdgeMap = new Map<string, PerfTrackerRow[]>();
  for (const r of resolved) {
    const site = inferSite(r);
    const eb = edgeBucketIdForRow(r);
    const k = `${site}__${eb}`;
    const arr = siteEdgeMap.get(k) ?? [];
    arr.push(r);
    siteEdgeMap.set(k, arr);
  }

  const bySiteAndEdge: SurfaceSliceRow[] = [];
  const siteOrder = ["PP", "UD", "unknown"];
  for (const site of siteOrder) {
    for (const eb of EDGE_BUCKET_IDS) {
      const k = `${site}__${eb}`;
      const sliceKey = `${site}|${EDGE_BUCKET_LABELS[eb] ?? eb}`;
      bySiteAndEdge.push(aggregateRows(siteEdgeMap.get(k) ?? [], sliceKey));
    }
  }

  let withPlatform = 0;
  let withStruct = 0;
  let withLc = 0;
  for (const r of resolved) {
    if (inferSite(r) !== "unknown") withPlatform++;
    if (r.structure?.trim()) withStruct++;
    if (inferLegCountFromStructure(r.structure) != null) withLc++;
  }

  return {
    schemaVersion: CALIBRATION_SURFACE_SCHEMA_VERSION,
    generatedAtUtc,
    dataSource: {
      path: "data/perf_tracker.jsonl",
      note: "Append-only JSONL; read via readTrackerRows / perf_tracker_db.",
    },
    definitions: {
      predictedEdge: "trueProb − impliedProb (fraction); requires both fields on the row.",
      predictedEv: "projectedEV from tracker (leg EV at selection).",
      winRate: "fraction of resolved legs with result === 1.",
      realizedReturnProxy:
        "Mean of rowRealizedProfitPerUnit (stake=1 American payout); unavailable legs excluded from mean only.",
      edgeBuckets: EDGE_BUCKET_IDS.map((id) => EDGE_BUCKET_LABELS[id] ?? id),
      evBuckets: EV_BUCKET_IDS.map((id) => EV_BUCKET_LABELS[id] ?? id),
      trackerIntegrity:
        "Grounded impliedProb coverage and perf_tracker enrichment: see data/reports/latest_tracker_integrity.json (Phase 67).",
    },
    rowCounts: {
      totalInFile: rowsAll.length,
      resolvedLegs: resolved.length,
      resolvedWithPlatformInferred: withPlatform,
      resolvedWithStructure: withStruct,
      resolvedWithLegCount: withLc,
    },
    slices: {
      bySite: buildSlicesFromMap(bySiteMap),
      byStructure: buildSlicesFromMap(byStructureMap),
      byFlexKind: buildSlicesFromMap(byFlexKindMap),
      byLegCount: buildSlicesFromMap(byLegCountMap),
      byEdgeBucket: EDGE_BUCKET_IDS.map((id) =>
        aggregateRows(byEdgeMap.get(id) ?? [], EDGE_BUCKET_LABELS[id] ?? id)
      ),
      byEvBucket: EV_BUCKET_IDS.map((id) =>
        aggregateRows(byEvMap.get(id) ?? [], EV_BUCKET_LABELS[id] ?? id)
      ),
      bySiteAndEdgeBucket: bySiteAndEdge,
    },
    notes,
  };
}

export function renderCalibrationSurfaceMarkdown(report: CalibrationSurfaceReport): string {
  const lines: string[] = [];
  lines.push("# Calibration surface (resolved legs)");
  lines.push("");
  lines.push(`Generated: ${report.generatedAtUtc}`);
  lines.push(`Schema: ${report.schemaVersion}`);
  lines.push("");
  lines.push("## Definitions");
  lines.push(`- **predictedEdge:** ${report.definitions.predictedEdge}`);
  lines.push(`- **predictedEv:** ${report.definitions.predictedEv}`);
  lines.push(`- **winRate:** ${report.definitions.winRate}`);
  lines.push(`- **realizedReturnProxy:** ${report.definitions.realizedReturnProxy}`);
  lines.push(`- **trackerIntegrity:** ${report.definitions.trackerIntegrity}`);
  lines.push("");
  lines.push("## Row counts");
  lines.push(`- Total rows in file: ${report.rowCounts.totalInFile}`);
  lines.push(`- Resolved legs: ${report.rowCounts.resolvedLegs}`);
  lines.push(`- Resolved with site PP/UD (inferred if needed): ${report.rowCounts.resolvedWithPlatformInferred}`);
  lines.push(`- Resolved with structure field: ${report.rowCounts.resolvedWithStructure}`);
  lines.push(`- Resolved with leg count from structure registry: ${report.rowCounts.resolvedWithLegCount}`);
  lines.push("");

  const table = (title: string, rows: SurfaceSliceRow[]) => {
    lines.push(`## ${title}`);
    lines.push("| Slice | N | Win rate | Avg pred edge | Edge n | Avg pred EV | EV n | ROI proxy | ROI n |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const s of rows) {
      lines.push(
        `| ${s.sliceKey} | ${s.sampleCount} | ${s.winRate == null ? "—" : (s.winRate * 100).toFixed(2) + "%"} | ${s.averagePredictedEdge == null ? "—" : (s.averagePredictedEdge * 100).toFixed(3) + "%"} | ${s.predictedEdgeBasisCount} | ${s.averagePredictedEv == null ? "—" : (s.averagePredictedEv * 100).toFixed(3) + "%"} | ${s.predictedEvBasisCount} | ${s.realizedReturnProxy == null ? "—" : s.realizedReturnProxy.toFixed(4)} | ${s.realizedReturnBasisCount} |`
      );
    }
    lines.push("");
  };

  table("By site", report.slices.bySite);
  table("By structure (flexType / structureId)", report.slices.byStructure);
  table("By flex kind (Power / Flex / Standard)", report.slices.byFlexKind);
  table("By leg count", report.slices.byLegCount);
  table("By predicted edge bucket", report.slices.byEdgeBucket);
  table("By predicted EV bucket", report.slices.byEvBucket);
  table("By site × edge bucket", report.slices.bySiteAndEdgeBucket);

  lines.push("## Notes");
  for (const n of report.notes) {
    lines.push(`- ${n}`);
  }
  lines.push("");
  return lines.join("\n");
}
