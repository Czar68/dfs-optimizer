import fs from "fs";
import path from "path";
import { inferSide, PerfTrackerRow } from "../perf_tracker_types";
import { readTrackerRowsWithResult } from "../perf_tracker_db";
import {
  applyProbabilityCalibration,
  loadProbabilityCalibration,
} from "../modeling/probability_calibration";
import { computeCanonicalEdgeForInput } from "../calculate_ev";
import type { MergedPick } from "../types";

function buildMergedPickFromRow(row: PerfTrackerRow, prob: number): MergedPick {
  const side = row.side ?? inferSide(row.leg_id);
  const overOdds = Number.isFinite(row.overOdds) ? (row.overOdds as number) : -110;
  const underOdds = Number.isFinite(row.underOdds) ? (row.underOdds as number) : -110;
  return {
    sport: "NBA",
    site: row.platform === "UD" ? "underdog" : "prizepicks",
    league: "NBA",
    player: row.player,
    team: row.team ?? null,
    opponent: row.opponent ?? null,
    stat: (row.stat as MergedPick["stat"]) ?? "points",
    line: row.line,
    projectionId: row.leg_id,
    gameId: null,
    startTime: row.gameStartTime ?? null,
    book: row.book ?? "unknown",
    overOdds,
    underOdds,
    trueProb: prob,
    fairOverOdds: 0,
    fairUnderOdds: 0,
    isDemon: false,
    isGoblin: false,
    isPromo: false,
    isNonStandardOdds: false,
    outcome: side,
  };
}

export function auditCalibrationImpact(options?: { outPath?: string }) {
  const rows = readTrackerRowsWithResult();
  const calibration = loadProbabilityCalibration();
  const effects = rows.map((r) => {
    const rawProb = Number.isFinite(r.trueProb) ? r.trueProb : 0.5;
    const cal = applyProbabilityCalibration(rawProb, calibration);
    const side = r.side ?? inferSide(r.leg_id);
    const rawPick = buildMergedPickFromRow(r, rawProb);
    const calPick = buildMergedPickFromRow(r, cal.calibratedProb);
    const rawEdge = computeCanonicalEdgeForInput({
      pick: rawPick,
      side,
      effectiveTrueProb: rawProb,
      fairOdds: rawProb > 0 && rawProb < 1 ? 1 / rawProb - 1 : Number.NaN,
    });
    const calibratedEdge = computeCanonicalEdgeForInput({
      pick: calPick,
      side,
      effectiveTrueProb: cal.calibratedProb,
      fairOdds: cal.calibratedProb > 0 && cal.calibratedProb < 1 ? 1 / cal.calibratedProb - 1 : Number.NaN,
    });
    return {
      legId: r.leg_id,
      player: r.player,
      stat: r.stat,
      side,
      rawProb,
      calibratedProb: cal.calibratedProb,
      probDelta: cal.calibratedProb - rawProb,
      rawEdge,
      calibratedEdge,
      edgeDelta: calibratedEdge - rawEdge,
      calibrationApplied: cal.applied,
      calibrationBucket: cal.bucketLabel ?? null,
    };
  });
  const increased = effects.filter((e) => e.edgeDelta > 0).length;
  const decreased = effects.filter((e) => e.edgeDelta < 0).length;
  const unchanged = effects.length - increased - decreased;
  const summary = {
    generatedAtUtc: new Date().toISOString(),
    rows: effects.length,
    increased,
    decreased,
    unchanged,
    avgProbDelta:
      effects.length > 0 ? effects.reduce((s, e) => s + e.probDelta, 0) / effects.length : 0,
    avgEdgeDelta:
      effects.length > 0 ? effects.reduce((s, e) => s + e.edgeDelta, 0) / effects.length : 0,
    sample: effects.slice(0, 10),
  };
  const outPath = options?.outPath ?? path.join(process.cwd(), "artifacts", "calibration_impact_audit.json");
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");
  return { outPath, summary };
}

if (require.main === module) {
  const out = auditCalibrationImpact();
  console.log(`[audit:calibration-impact] wrote ${out.outPath}`);
  console.log(
    `[audit:calibration-impact] rows=${out.summary.rows} increased=${out.summary.increased} decreased=${out.summary.decreased} unchanged=${out.summary.unchanged}`
  );
}

