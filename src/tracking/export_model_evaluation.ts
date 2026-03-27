/**
 * Phase 16Q: model calibration + CLV/outcome evaluation export.
 * Pure evaluation layer; no optimizer/math-model changes.
 */

import fs from "fs";
import path from "path";
import { readTrackerRows } from "../perf_tracker_db";
import type { PerfTrackerRow } from "../perf_tracker_types";

export type CalibrationBucket = {
  bucketLabel: string;
  minProb: number;
  maxProb: number;
  count: number;
  predictedAvgProb: number;
  realizedHitRate: number;
  calibrationGap: number;
};

export type SegmentSummary = {
  key: string;
  count: number;
  predictedAvgProb: number;
  realizedHitRate: number;
  avgClvDelta?: number;
  avgProjectedEv: number;
};

export type ModelEvaluation = {
  generatedAtUtc: string;
  rowCounts: {
    totalRows: number;
    resolvedRows: number;
    rowsWithClose: number;
  };
  scoring: {
    brierScore: number;
    logLoss: number;
    avgPredictedProb: number;
    realizedHitRate: number;
    probabilityClipEpsilon: number;
  };
  calibration: {
    bucketSpec: string;
    buckets: CalibrationBucket[];
  };
  clvEvaluation: {
    countWithClv: number;
    avgClvDelta: number;
    avgClvPct: number;
    positiveClv: { count: number; hitRate: number; avgProfitPerUnit?: number };
    negativeClv: { count: number; hitRate: number; avgProfitPerUnit?: number };
  };
  segments: {
    byPlatform: SegmentSummary[];
    byStat: SegmentSummary[];
    bySide: SegmentSummary[];
    byStructure: SegmentSummary[];
  };
  notes: string[];
};

const EPS = 1e-6;
const BUCKET_START = 0.45;
const BUCKET_END = 0.75;
const BUCKET_STEP = 0.05;

function clipProb(p: number): number {
  if (!Number.isFinite(p)) return 0.5;
  if (p <= EPS) return EPS;
  if (p >= 1 - EPS) return 1 - EPS;
  return p;
}

function americanProfitPerUnit(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) return 0;
  if (odds > 0) return odds / 100;
  return 100 / Math.abs(odds);
}

/** Stake=1 profit/loss for a resolved leg when open/chosen American odds exist (reporting-only; matches legacy model-eval). */
export function rowRealizedProfitPerUnit(row: PerfTrackerRow): number | undefined {
  if (row.result !== 0 && row.result !== 1) return undefined;
  const side = row.side ?? "over";
  const odds =
    side === "over"
      ? row.openOddsAmerican ?? row.overOdds
      : row.openOddsAmerican ?? row.underOdds;
  if (odds == null || !Number.isFinite(odds)) return undefined;
  return row.result === 1 ? americanProfitPerUnit(odds) : -1;
}

function rowPredProb(row: PerfTrackerRow): number {
  if (typeof row.trueProb === "number" && Number.isFinite(row.trueProb)) return row.trueProb;
  if (typeof row.impliedProb === "number" && Number.isFinite(row.impliedProb)) return row.impliedProb;
  return 0.5;
}

function rowProfitPerUnit(row: PerfTrackerRow): number | undefined {
  return rowRealizedProfitPerUnit(row);
}

export function buildCalibrationBuckets(
  rows: PerfTrackerRow[],
  start = BUCKET_START,
  end = BUCKET_END,
  step = BUCKET_STEP
): CalibrationBucket[] {
  const out: CalibrationBucket[] = [];
  const bucketCount = Math.round((end - start) / step);
  for (let i = 0; i < bucketCount; i++) {
    const lo = Number((start + i * step).toFixed(2));
    const hi = Number((lo + step).toFixed(2));
    const bucketRows = rows.filter((r) => {
      const p = rowPredProb(r);
      return p >= lo && p < hi;
    });
    const n = bucketRows.length;
    const pred = n === 0 ? 0 : bucketRows.reduce((s, r) => s + rowPredProb(r), 0) / n;
    const hit = n === 0 ? 0 : bucketRows.reduce((s, r) => s + (r.result === 1 ? 1 : 0), 0) / n;
    out.push({
      bucketLabel: `${lo.toFixed(2)}-${hi.toFixed(2)}`,
      minProb: lo,
      maxProb: hi,
      count: n,
      predictedAvgProb: pred,
      realizedHitRate: hit,
      calibrationGap: hit - pred,
    });
  }
  return out;
}

export function computeScoring(rows: PerfTrackerRow[]): ModelEvaluation["scoring"] {
  if (rows.length === 0) {
    return {
      brierScore: 0,
      logLoss: 0,
      avgPredictedProb: 0,
      realizedHitRate: 0,
      probabilityClipEpsilon: EPS,
    };
  }
  let brier = 0;
  let logLoss = 0;
  let avgP = 0;
  let hit = 0;
  for (const r of rows) {
    const y = r.result === 1 ? 1 : 0;
    const p = rowPredProb(r);
    const pc = clipProb(p);
    avgP += p;
    hit += y;
    brier += (p - y) * (p - y);
    logLoss += -(y * Math.log(pc) + (1 - y) * Math.log(1 - pc));
  }
  return {
    brierScore: brier / rows.length,
    logLoss: logLoss / rows.length,
    avgPredictedProb: avgP / rows.length,
    realizedHitRate: hit / rows.length,
    probabilityClipEpsilon: EPS,
  };
}

function summarizeSegments(rows: PerfTrackerRow[], keyFn: (r: PerfTrackerRow) => string): SegmentSummary[] {
  const map = new Map<string, PerfTrackerRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const arr = map.get(k) ?? [];
    arr.push(r);
    map.set(k, arr);
  }
  const out: SegmentSummary[] = [];
  for (const [k, arr] of map.entries()) {
    const n = arr.length;
    const pred = arr.reduce((s, r) => s + rowPredProb(r), 0) / n;
    const hit = arr.reduce((s, r) => s + (r.result === 1 ? 1 : 0), 0) / n;
    const ev = arr.reduce((s, r) => s + (Number.isFinite(r.projectedEV) ? r.projectedEV : 0), 0) / n;
    const clvRows = arr.filter((r) => typeof r.clvDelta === "number" && Number.isFinite(r.clvDelta));
    const avgClv = clvRows.length > 0 ? clvRows.reduce((s, r) => s + (r.clvDelta as number), 0) / clvRows.length : undefined;
    out.push({
      key: k,
      count: n,
      predictedAvgProb: pred,
      realizedHitRate: hit,
      avgProjectedEv: ev,
      avgClvDelta: avgClv,
    });
  }
  out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return out;
}

function buildClvEvaluation(rows: PerfTrackerRow[]): ModelEvaluation["clvEvaluation"] {
  const clvRows = rows.filter((r) => typeof r.clvDelta === "number" && Number.isFinite(r.clvDelta));
  if (clvRows.length === 0) {
    return {
      countWithClv: 0,
      avgClvDelta: 0,
      avgClvPct: 0,
      positiveClv: { count: 0, hitRate: 0 },
      negativeClv: { count: 0, hitRate: 0 },
    };
  }
  const pos = clvRows.filter((r) => (r.clvDelta as number) > 0);
  const neg = clvRows.filter((r) => (r.clvDelta as number) < 0);
  const hitRate = (arr: PerfTrackerRow[]) => (arr.length ? arr.reduce((s, r) => s + (r.result === 1 ? 1 : 0), 0) / arr.length : 0);
  const avgProfit = (arr: PerfTrackerRow[]) => {
    const p = arr.map(rowProfitPerUnit).filter((x): x is number => typeof x === "number");
    return p.length ? p.reduce((s, x) => s + x, 0) / p.length : undefined;
  };
  return {
    countWithClv: clvRows.length,
    avgClvDelta: clvRows.reduce((s, r) => s + (r.clvDelta as number), 0) / clvRows.length,
    avgClvPct:
      (() => {
        const rowsPct = clvRows.filter((r) => typeof r.clvPct === "number" && Number.isFinite(r.clvPct));
        return rowsPct.length ? rowsPct.reduce((s, r) => s + (r.clvPct as number), 0) / rowsPct.length : 0;
      })(),
    positiveClv: { count: pos.length, hitRate: hitRate(pos), avgProfitPerUnit: avgProfit(pos) },
    negativeClv: { count: neg.length, hitRate: hitRate(neg), avgProfitPerUnit: avgProfit(neg) },
  };
}

export function buildModelEvaluation(rowsAll: PerfTrackerRow[]): ModelEvaluation {
  const resolved = rowsAll.filter((r) => r.result === 0 || r.result === 1);
  const notes: string[] = [];
  notes.push("Push/ambiguous rows are excluded: only result in {0,1} are evaluated.");
  notes.push("Calibration buckets: fixed 0.05 width from 0.45 to 0.75.");
  notes.push("Log loss uses clipped probabilities with epsilon=1e-6.");
  const evalObj: ModelEvaluation = {
    generatedAtUtc: new Date().toISOString(),
    rowCounts: {
      totalRows: rowsAll.length,
      resolvedRows: resolved.length,
      rowsWithClose: resolved.filter((r) => typeof r.closeImpliedProb === "number").length,
    },
    scoring: computeScoring(resolved),
    calibration: {
      bucketSpec: "fixed bins [0.45,0.50), [0.50,0.55), [0.55,0.60), [0.60,0.65), [0.65,0.70), [0.70,0.75)",
      buckets: buildCalibrationBuckets(resolved),
    },
    clvEvaluation: buildClvEvaluation(resolved),
    segments: {
      byPlatform: summarizeSegments(resolved, (r) => r.platform ?? "unknown"),
      byStat: summarizeSegments(resolved, (r) => r.statNormalized ?? r.stat),
      bySide: summarizeSegments(resolved, (r) => r.side ?? "over"),
      byStructure: summarizeSegments(resolved, (r) => r.structure ?? "unknown"),
    },
    notes,
  };
  return evalObj;
}

export function exportModelEvaluation(options?: { outJsonPath?: string; outMdPath?: string }): {
  jsonPath: string;
  mdPath: string;
  evaluation: ModelEvaluation;
} {
  const root = process.cwd();
  const outJsonPath = options?.outJsonPath ?? path.join(root, "artifacts", "model_evaluation.json");
  const outMdPath = options?.outMdPath ?? path.join(root, "artifacts", "model_evaluation.md");
  const rows = readTrackerRows();
  const evaluation = buildModelEvaluation(rows);

  const dir = path.dirname(outJsonPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outJsonPath, JSON.stringify(evaluation, null, 2), "utf8");

  const lines: string[] = [];
  lines.push("# Model Evaluation");
  lines.push("");
  lines.push(`Generated: ${evaluation.generatedAtUtc}`);
  lines.push("");
  lines.push("## Scoring");
  lines.push(`- Resolved rows: ${evaluation.rowCounts.resolvedRows}`);
  lines.push(`- Brier score: ${evaluation.scoring.brierScore.toFixed(6)}`);
  lines.push(`- Log loss: ${evaluation.scoring.logLoss.toFixed(6)}`);
  lines.push(`- Avg predicted prob: ${evaluation.scoring.avgPredictedProb.toFixed(4)}`);
  lines.push(`- Realized hit rate: ${evaluation.scoring.realizedHitRate.toFixed(4)}`);
  lines.push("");
  lines.push("## CLV");
  lines.push(`- Rows with close/CLV: ${evaluation.clvEvaluation.countWithClv}`);
  lines.push(`- Avg clvDelta: ${evaluation.clvEvaluation.avgClvDelta.toFixed(6)}`);
  lines.push(`- Avg clvPct: ${evaluation.clvEvaluation.avgClvPct.toFixed(4)}`);
  lines.push(`- Positive CLV: n=${evaluation.clvEvaluation.positiveClv.count}, hit=${evaluation.clvEvaluation.positiveClv.hitRate.toFixed(4)}`);
  lines.push(`- Negative CLV: n=${evaluation.clvEvaluation.negativeClv.count}, hit=${evaluation.clvEvaluation.negativeClv.hitRate.toFixed(4)}`);
  lines.push("");
  lines.push("## Calibration Buckets");
  lines.push("| Bucket | N | Pred | Realized | Gap |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const b of evaluation.calibration.buckets) {
    lines.push(`| ${b.bucketLabel} | ${b.count} | ${b.predictedAvgProb.toFixed(4)} | ${b.realizedHitRate.toFixed(4)} | ${b.calibrationGap.toFixed(4)} |`);
  }
  fs.writeFileSync(outMdPath, lines.join("\n") + "\n", "utf8");
  return { jsonPath: outJsonPath, mdPath: outMdPath, evaluation };
}

if (require.main === module) {
  const out = exportModelEvaluation();
  console.log(`[export:model-eval] wrote ${out.jsonPath}`);
  console.log(`[export:model-eval] wrote ${out.mdPath}`);
  console.log(
    `[export:model-eval] rows total=${out.evaluation.rowCounts.totalRows} resolved=${out.evaluation.rowCounts.resolvedRows} close=${out.evaluation.rowCounts.rowsWithClose}`
  );
}

