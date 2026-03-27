/**
 * Phase 101 — Grounded export of **`EvPick[]`** for feature outcome validation (read-only; no optimizer).
 *
 * Sources: **`data/perf_tracker.jsonl`** ( **`result` 0/1** ) joined to legs CSV by **`leg_id`** (Phase **101B** suffix fallback), else Phase **101E** deterministic field reconstruction; optional defense rank → **`ContextFeatureRecord`** for **`attachFeatureContextToPick`**.
 * Phase **119** — schedule / home-away **`ContextFeatureRecord`**s from **`extractHistoricalFeaturesFromRows`** (same grounded fields as registry) plus **`PerfTrackerRow.homeAway`** when historical row missing.
 */
import fs from "fs";
import path from "path";
import type { EvPick, Site, Sport } from "../types";
import type { PerfTrackerRow } from "../perf_tracker_types";
import { PERF_TRACKER_PATH, inferSide, parseTrackerLine } from "../perf_tracker_types";
import { getOppAdjustment } from "../matchups/opp_adjust";
import type { ContextFeatureRecord } from "../feature_input/context_feature_contract";
import { attachFeatureContextToPick } from "../feature_input/attach_context_features";
import { buildRollingFormContextRecordsFromHistoricalRow } from "../feature_input/rolling_form_context_features";
import { buildMarketContextRecordsFromHistoricalRow } from "../feature_input/market_context_features";
import { buildMatchupContextRecordsFromHistoricalRow } from "../feature_input/matchup_context_features";
import { buildRoleStabilityRecordsFromHistoricalRow } from "../feature_input/role_stability_features";
import { buildMinutesAvailabilityRecordsFromHistoricalRow } from "../feature_input/minutes_availability_grounded_bridge";
import { buildGameEnvironmentRecordsFromHistoricalRow } from "../feature_input/game_environment_grounded_bridge";
import { buildScheduleHomeAwayContextRecords } from "../feature_input/schedule_home_away_context_features";
import type { HistoricalFeatureRow } from "../modeling/historical_feature_registry";
import { extractHistoricalFeaturesFromRows } from "../modeling/historical_feature_extract";
import {
  existingGroundedLegJsonPaths,
  existingLegCsvPaths,
  loadLegsMap,
  type LegCsvRecord,
} from "../tracking/legs_csv_index";
import { legsSnapshotDirectory } from "../tracking/legs_snapshot";
import { normalizeStatToken } from "../tracking/id_normalization";
import { stableStringifyForObservability } from "./final_selection_observability";
import { writeFeatureValidationSnapshotStatusArtifacts } from "./feature_validation_snapshot_status";

export const FEATURE_VALIDATION_INPUT_DEFAULT_REL = path.join("data", "reports", "feature_validation_input.json");

/**
 * Legs CSV **`id`** is often **`prizepicks-{pid}-{stat}-{line}-over`**; **`perf_tracker`** **`leg_id`** may omit the final **`-over`** / **`-under`**.
 * Exact match first; if missing and **`leg_id`** does not already end with a side token, try **`${leg_id}-${side}`** (**`row.side`** or **`inferSide`**).
 */
function getLegByTrackerId(
  row: PerfTrackerRow,
  legsMap: Map<string, LegCsvRecord>
): { key: string; leg: LegCsvRecord } | undefined {
  const id = row.leg_id;
  const direct = legsMap.get(id);
  if (direct) return { key: id, leg: direct };
  const side = row.side ?? inferSide(id);
  const low = id.toLowerCase();
  if (!low.endsWith("-over") && !low.endsWith("-under")) {
    const k = `${id}-${side}`;
    const leg = legsMap.get(k);
    if (leg) return { key: k, leg };
  }
  return undefined;
}

export function resolveLegCsvRecord(
  row: PerfTrackerRow,
  legsMap: Map<string, LegCsvRecord>
): LegCsvRecord | undefined {
  return getLegByTrackerId(row, legsMap)?.leg;
}

function linesEqual(a: number, b: number): boolean {
  if (a === b) return true;
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
}

function trimStr(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

function trackerOpponent(row: PerfTrackerRow): string {
  return trimStr(row.opponent) || trimStr(row.opp);
}

/**
 * Phase **101E** — exact field match over all grounded legs: player, stat (normalized token), line, team, opponent.
 * **Game time:** if either side has a non-empty **`gameStartTime`**, both must be present and equal (trimmed); if both empty, time is unconstrained.
 * **0** or more than **1** leg **`id`** → **`undefined`** (fail-closed).
 */
/** Phase **101E** — candidate **`id`**s that match tracker fields (same rules as **`findReconstructionLegMatch`**). */
export function collectReconstructionCandidateIds(
  row: PerfTrackerRow,
  legsMap: Map<string, LegCsvRecord>
): string[] {
  const player = trimStr(row.player);
  const statKey = normalizeStatToken(row.stat);
  const line = row.line;
  const team = trimStr(row.team);
  const opponent = trackerOpponent(row);
  const gRow = trimStr(row.gameStartTime);

  const candidates: string[] = [];
  for (const [legId, rec] of legsMap) {
    if (trimStr(rec.player) !== player) continue;
    if (normalizeStatToken(rec.stat) !== statKey) continue;
    if (!linesEqual(rec.line, line)) continue;
    if (trimStr(rec.team) !== team) continue;
    if (trimStr(rec.opponent) !== opponent) continue;

    const gLeg = trimStr(rec.gameStartTime);
    if (gRow !== "" || gLeg !== "") {
      if (gRow === "" || gLeg === "" || gRow !== gLeg) continue;
    }

    candidates.push(legId);
  }
  return candidates;
}

export function countReconstructionCandidates(row: PerfTrackerRow, legsMap: Map<string, LegCsvRecord>): number {
  return collectReconstructionCandidateIds(row, legsMap).length;
}

export function findReconstructionLegMatch(
  row: PerfTrackerRow,
  legsMap: Map<string, LegCsvRecord>
): { legId: string; rec: LegCsvRecord } | undefined {
  const candidates = collectReconstructionCandidateIds(row, legsMap);
  if (candidates.length !== 1) return undefined;
  const legId = candidates[0]!;
  const rec = legsMap.get(legId);
  return rec ? { legId, rec } : undefined;
}

export type LegResolution =
  | { method: "leg_id"; leg: LegCsvRecord; matchedLegCsvId: string }
  | { method: "reconstruction"; leg: LegCsvRecord; matchedLegCsvId: string };

/**
 * Prefer existing **`leg_id`** join; else deterministic reconstruction (**`findReconstructionLegMatch`**).
 */
export function resolveLegCsvRecordOrReconstruction(
  row: PerfTrackerRow,
  legsMap: Map<string, LegCsvRecord>
): LegResolution | undefined {
  const byId = getLegByTrackerId(row, legsMap);
  if (byId) {
    return { method: "leg_id", leg: byId.leg, matchedLegCsvId: byId.key };
  }
  const recon = findReconstructionLegMatch(row, legsMap);
  if (!recon) return undefined;
  return { method: "reconstruction", leg: recon.rec, matchedLegCsvId: recon.legId };
}

/** Small stable samples ( **`leg_id`** ) per skip bucket for operator reports. */
export type FeatureValidationReasonSamples = Record<string, string[]>;

/** Phase **107** — explicit validation join policy (additive; default **`snapshot_preferred`**). */
export type FeatureValidationPolicy = "legacy_best_effort" | "snapshot_preferred" | "snapshot_strict";

export const DEFAULT_FEATURE_VALIDATION_POLICY: FeatureValidationPolicy = "snapshot_preferred";

export function normalizeFeatureValidationPolicy(
  raw: string | undefined
): FeatureValidationPolicy | undefined {
  const s = raw?.trim().toLowerCase();
  if (s === "legacy_best_effort" || s === "legacy-best-effort") return "legacy_best_effort";
  if (s === "snapshot_preferred" || s === "snapshot-preferred") return "snapshot_preferred";
  if (s === "snapshot_strict" || s === "snapshot-strict") return "snapshot_strict";
  return undefined;
}

export interface FeatureValidationExportStats {
  trackerRowsRead: number;
  trackerRowsWithResult: number;
  skippedNoLeg: number;
  exported: number;
  /** Phase **101E** — rows joined via **`leg_id`** path (snapshot + legacy). */
  joinedByLegId: number;
  /** Phase **101E** — rows joined via deterministic field reconstruction (snapshot + legacy). */
  joinedByReconstruction: number;

  /** Phase **103** — graded rows with **`legsSnapshotId`** (after dedupe). */
  rowsWithLegsSnapshotId: number;
  /** Phase **103** — graded rows without **`legsSnapshotId`** (after dedupe). */
  rowsWithoutLegsSnapshotId: number;
  /** Rows with **`legsSnapshotId`** where archive dir exists and at least one legs file loaded. */
  snapshotReferencedDirExistsRows: number;
  /** Rows with **`legsSnapshotId`** where dir missing or no legs CSV/JSON produced a non-empty map. */
  snapshotReferencedDirMissingRows: number;
  /** **`legsSnapshotId`** rows exported via **`leg_id`**. */
  snapshotJoinedByLegId: number;
  /** **`legsSnapshotId`** rows exported via reconstruction. */
  snapshotJoinedByReconstruction: number;
  /** Legacy rows (no **`legsSnapshotId`**) exported via **`leg_id`**. */
  legacyJoinedByLegId: number;
  /** Legacy rows exported via reconstruction. */
  legacyJoinedByReconstruction: number;
  /** Snapshot dir missing or empty map; row skipped. */
  skippedMissingSnapshotDirectory: number;
  /** Snapshot loaded, **`leg_id`** + reconstruction both fail (0 candidates), row skipped. */
  skippedSnapshotPresentNoLegMatch: number;
  /** Snapshot loaded, **`leg_id`** fails, **>1** reconstruction candidate, row skipped. */
  skippedSnapshotAmbiguousReconstruction: number;
  /**
   * Legacy rows (no **`legsSnapshotId`**) with no **`leg_id`** / reconstruction match.
   * (Named **`legacy_no_leg_match`** in Phase **103** operator docs.)
   */
  skippedLegacyNoLegMatch: number;
  /** Optional: **`enforceSnapshotResolved`** was set and at least one snapshot-bound row did not export. */
  enforcementFailed: boolean;
  /** Whether **`enforceSnapshotResolved`** was requested for this run. */
  enforceSnapshotResolved: boolean;
  /** Up to **3** **`leg_id`**s per skip bucket (Phase **103**). */
  skipReasonSamples: FeatureValidationReasonSamples;

  /** Phase **107** — policy used for this export. */
  featureValidationPolicy: FeatureValidationPolicy;
  /** **`snapshot_strict`**: graded rows skipped because they have no **`legsSnapshotId`**. */
  policyExcludedNoSnapshotId: number;
  /** Sum of rows excluded only by policy (strict legacy exclusion). */
  policyExcludedGradedRows: number;
  /** Successful exports whose join used the global legacy legs map. */
  exportedViaLegacyMapJoin: number;
  /** Successful exports whose join used a snapshot archive map. */
  exportedViaSnapshotMapJoin: number;
}

const MAX_REASON_SAMPLES = 3;

function pushReasonSample(
  bucket: Record<string, string[]>,
  key: string,
  legId: string
): void {
  const a = bucket[key] ?? (bucket[key] = []);
  if (a.length < MAX_REASON_SAMPLES && !a.includes(legId)) a.push(legId);
}

export function readTrackerRowsFromFile(absPath: string): PerfTrackerRow[] {
  if (!fs.existsSync(absPath)) return [];
  const raw = fs.readFileSync(absPath, "utf8");
  const rows: PerfTrackerRow[] = [];
  for (const line of raw.split("\n")) {
    const row = parseTrackerLine(line);
    if (row) rows.push(row);
  }
  return rows;
}

function inferSite(legId: string): Site {
  return legId.toLowerCase().includes("underdog") ? "underdog" : "prizepicks";
}

function extractProjectionId(legId: string): string {
  const m = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i.exec(legId);
  return m ? m[1]! : legId.length > 48 ? legId.slice(0, 48) : legId;
}

function asOfUtcForRow(row: PerfTrackerRow): string {
  if (row.gameStartTime && row.gameStartTime.trim()) {
    const t = Date.parse(row.gameStartTime.trim());
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  const d = row.date?.trim();
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T23:59:59.000Z`;
  return new Date().toISOString();
}

/**
 * Grounded **`ContextFeatureRecord`**s: opponent defensive rank (**`getOppAdjustment`**) + Phase **119**
 * schedule/home-away (**`buildScheduleHomeAwayContextRecords`**) when **`historical`** row is passed (preferred)
 * or tracker **`homeAway`** only.
 */
export function buildContextRecordsForFeatureValidation(
  row: PerfTrackerRow,
  leg: LegCsvRecord,
  historical?: HistoricalFeatureRow | null
): ContextFeatureRecord[] {
  const asOf = asOfUtcForRow(row);
  const subjectId = row.leg_id;
  const out: ContextFeatureRecord[] = [];
  const adj = getOppAdjustment(leg.opponent ?? null, leg.stat);
  if (adj) {
    out.push({
      key: "opp_points_allowed_rank",
      family: "team_defense_context",
      kind: "count",
      subjectId,
      asOfUtc: asOf,
      value: adj.defRank,
      provenance: "opp_adjust.ts",
    });
  }
  const h = historical ?? null;
  out.push(
    ...buildRollingFormContextRecordsFromHistoricalRow({
      subjectId,
      asOfUtc: asOf,
      historical: h,
      provenanceFallback: "historical_feature_extract",
    })
  );
  out.push(
    ...buildScheduleHomeAwayContextRecords({
      subjectId,
      asOfUtc: asOf,
      homeAway: h?.homeAway ?? row.homeAway ?? null,
      daysRest: h?.daysRest ?? null,
      isBackToBack: h?.isBackToBack ?? null,
      playerGamesInLast4CalendarDays: h?.playerGamesInLast4CalendarDays ?? null,
      provenance: h ? "historical_feature_extract" : "perf_tracker_row_only",
    })
  );
  out.push(
    ...buildMarketContextRecordsFromHistoricalRow({
      subjectId,
      asOfUtc: asOf,
      historical: h,
      provenanceFallback: "historical_feature_extract",
    })
  );
  out.push(
    ...buildMatchupContextRecordsFromHistoricalRow({
      subjectId,
      asOfUtc: asOf,
      historical: h,
      provenanceFallback: "historical_feature_extract",
    })
  );
  out.push(
    ...buildRoleStabilityRecordsFromHistoricalRow({
      subjectId,
      asOfUtc: asOf,
      historical: h,
      provenanceFallback: "historical_feature_extract",
    })
  );
  out.push(
    ...buildMinutesAvailabilityRecordsFromHistoricalRow({
      subjectId,
      asOfUtc: asOf,
      historical: h,
      provenanceFallback: "historical_feature_extract",
    })
  );
  out.push(
    ...buildGameEnvironmentRecordsFromHistoricalRow({
      subjectId,
      asOfUtc: asOf,
      historical: h,
      provenanceFallback: "historical_feature_extract",
    })
  );
  return out;
}

/** Minimal **`EvPick`** from perf tracker + legs CSV (export-only; not full merge_odds parity). */
export function buildEvPickFromTrackerLeg(
  row: PerfTrackerRow,
  leg: LegCsvRecord,
  join?: LegResolution
): EvPick {
  const side = row.side ?? inferSide(row.leg_id);
  const statTok = normalizeStatToken(leg.stat);
  const idForSiteAndProj = join?.matchedLegCsvId ?? row.leg_id;
  const site = inferSite(idForSiteAndProj);
  const overO = leg.overOdds;
  const underO = leg.underOdds;
  const fairAmerican =
    side === "over"
      ? overO != null && Number.isFinite(overO)
        ? overO
        : -110
      : underO != null && Number.isFinite(underO)
        ? underO
        : -110;

  const sport: Sport = "NBA";
  const ev: EvPick = {
    id: `${row.date}|${row.leg_id}`,
    sport,
    site,
    league: leg.league || "NBA",
    player: leg.player,
    team: leg.team ?? null,
    opponent: leg.opponent ?? null,
    stat: statTok as EvPick["stat"],
    line: leg.line,
    projectionId: extractProjectionId(idForSiteAndProj),
    gameId: null,
    startTime: leg.gameStartTime ?? row.gameStartTime ?? null,
    outcome: side,
    trueProb: row.trueProb,
    rawTrueProb: row.rawTrueProb,
    calibratedTrueProb: row.calibratedTrueProb,
    probCalibrationApplied: row.probCalibrationApplied,
    probCalibrationBucket: row.probCalibrationBucket,
    fairOdds: fairAmerican,
    edge: leg.legEv,
    book: leg.book || null,
    overOdds: overO ?? null,
    underOdds: underO ?? null,
    legEv: leg.legEv,
    isNonStandardOdds: false,
    legKey: row.leg_id,
    legLabel: `${leg.player} - ${leg.stat} - ${leg.line}`,
    featureValidationJoin: join
      ? { method: join.method, matchedLegCsvId: join.matchedLegCsvId }
      : undefined,
  };
  return ev;
}

export function gradedOutcomeFromResult(result: 0 | 1): "hit" | "miss" {
  return result === 1 ? "hit" : "miss";
}

function legRecordFromLegsJsonItem(o: unknown): { id: string; rec: LegCsvRecord } | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const idRaw = r.id ?? r.leg_id;
  if (typeof idRaw !== "string" || !idRaw.trim()) return null;
  const id = idRaw.trim();
  const player = typeof r.player === "string" ? r.player : "";
  const stat = typeof r.stat === "string" ? r.stat : "";
  const line =
    typeof r.line === "number" && Number.isFinite(r.line)
      ? r.line
      : parseFloat(String(r.line ?? "")) || 0;
  const book = typeof r.book === "string" ? r.book : "";
  const league = typeof r.league === "string" && r.league.trim() ? r.league.trim() : "NBA";
  const trueProb =
    typeof r.trueProb === "number" && Number.isFinite(r.trueProb) ? r.trueProb : 0.5;
  const legEv = typeof r.legEv === "number" && Number.isFinite(r.legEv) ? r.legEv : 0;
  const overOdds =
    typeof r.overOdds === "number" && Number.isFinite(r.overOdds) ? r.overOdds : undefined;
  const underOdds =
    typeof r.underOdds === "number" && Number.isFinite(r.underOdds) ? r.underOdds : undefined;
  const gameStartTime =
    typeof r.startTime === "string" && r.startTime.trim()
      ? r.startTime.trim()
      : typeof r.gameTime === "string" && r.gameTime.trim()
        ? r.gameTime.trim()
        : undefined;
  const team = typeof r.team === "string" && r.team.trim() ? r.team.trim() : undefined;
  const opponent =
    typeof r.opponent === "string" && r.opponent.trim() ? r.opponent.trim() : undefined;
  return {
    id,
    rec: {
      player,
      stat,
      line,
      book,
      league,
      trueProb,
      legEv,
      overOdds,
      underOdds,
      gameStartTime,
      team,
      opponent,
    },
  };
}

/** Merge grounded **`*-legs.json`** paths — keys only when not already in **`map`** (CSV wins). */
export function mergeLegsFromJsonFilePaths(paths: string[], map: Map<string, LegCsvRecord>): void {
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
    } catch {
      continue;
    }
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      const parsed = legRecordFromLegsJsonItem(item);
      if (!parsed) continue;
      if (map.has(parsed.id)) continue;
      map.set(parsed.id, parsed.rec);
    }
  }
}

/** Merge grounded **`*-legs.json`** from **`existingGroundedLegJsonPaths`** — keys only when not already in **`map`** (CSV wins). */
export function mergeLegsFromJsonFiles(cwd: string, map: Map<string, LegCsvRecord>): void {
  mergeLegsFromJsonFilePaths(existingGroundedLegJsonPaths(cwd), map);
}

/** Phase **102** — legs from **`data/legs_archive/<snapshot_id>/`** only (CSV + JSON when present). */
export function loadLegsMapForSnapshotId(cwd: string, legsSnapshotId: string): Map<string, LegCsvRecord> {
  const d = legsSnapshotDirectory(cwd, legsSnapshotId);
  const csvPaths: string[] = [];
  for (const n of ["prizepicks-legs.csv", "underdog-legs.csv"]) {
    const p = path.join(d, n);
    if (fs.existsSync(p)) csvPaths.push(p);
  }
  const map = loadLegsMap(csvPaths);
  const jsonPaths: string[] = [];
  for (const n of ["prizepicks-legs.json", "underdog-legs.json"]) {
    const p = path.join(d, n);
    if (fs.existsSync(p)) jsonPaths.push(p);
  }
  mergeLegsFromJsonFilePaths(jsonPaths, map);
  return map;
}

export interface ExportFeatureValidationPicksOptions {
  cwd: string;
  /** Absolute or relative to **`cwd`**. Default **`data/perf_tracker.jsonl`**. */
  trackerPath?: string;
  /** Override legs CSV list; default **`existingLegCsvPaths(cwd)`**. */
  legCsvPaths?: string[];
  /** Dedupe by **`date|leg_id`**, keep last occurrence in file order. */
  dedupe?: boolean;
  /**
   * Phase **103** — if **true**, any skipped **snapshot-bound** row sets **`stats.enforcementFailed`**
   * (export script may exit non-zero). Legacy rows unchanged.
   */
  enforceSnapshotResolved?: boolean;
  /** Phase **103** — write **`data/reports/latest_feature_validation_snapshot_status.*`**. Default **false**. */
  writeSnapshotStatusArtifacts?: boolean;
  /**
   * Phase **107** — **`legacy_best_effort`** (join all rows via global legs only), **`snapshot_preferred`** (default:
   * snapshot map when **`legsSnapshotId`** set), **`snapshot_strict`** (only snapshot-bound rows). Override:
   * **`FEATURE_VALIDATION_POLICY`** env.
   */
  policy?: FeatureValidationPolicy;
  /** Phase **107** — write **`data/reports/latest_feature_validation_policy_status.*`**. Default **false**. */
  writePolicyStatusArtifacts?: boolean;
}

/**
 * Load tracker rows with **`result` 0/1**, join legs, attach features + **`gradedLegOutcome`**.
 */
export function exportFeatureValidationPicks(
  opts: ExportFeatureValidationPicksOptions
): { picks: EvPick[]; stats: FeatureValidationExportStats } {
  const cwd = opts.cwd;
  const enforceSnapshot =
    opts.enforceSnapshotResolved === true ||
    process.env.FEATURE_VALIDATION_SNAPSHOT_ENFORCE === "1" ||
    process.env.FEATURE_VALIDATION_SNAPSHOT_ENFORCE === "true";
  const policy: FeatureValidationPolicy =
    opts.policy ??
    normalizeFeatureValidationPolicy(process.env.FEATURE_VALIDATION_POLICY) ??
    DEFAULT_FEATURE_VALIDATION_POLICY;
  const useLegacyMapOnly = policy === "legacy_best_effort";
  const trackerAbs = path.isAbsolute(opts.trackerPath ?? "")
    ? opts.trackerPath!
    : path.join(cwd, opts.trackerPath ?? PERF_TRACKER_PATH);

  const allRows = readTrackerRowsFromFile(trackerAbs);
  const withResult = allRows.filter((r): r is PerfTrackerRow & { result: 0 | 1 } => r.result === 0 || r.result === 1);

  const legPaths = opts.legCsvPaths ?? existingLegCsvPaths(cwd);
  const legacyLegsMap = loadLegsMap(legPaths.map((p) => (path.isAbsolute(p) ? p : path.join(cwd, p))));
  mergeLegsFromJsonFiles(cwd, legacyLegsMap);
  const snapshotLegsCache = new Map<string, Map<string, LegCsvRecord>>();

  const skipReasonSamples: FeatureValidationReasonSamples = {};

  const stats: FeatureValidationExportStats = {
    trackerRowsRead: allRows.length,
    trackerRowsWithResult: withResult.length,
    skippedNoLeg: 0,
    exported: 0,
    joinedByLegId: 0,
    joinedByReconstruction: 0,
    rowsWithLegsSnapshotId: 0,
    rowsWithoutLegsSnapshotId: 0,
    snapshotReferencedDirExistsRows: 0,
    snapshotReferencedDirMissingRows: 0,
    snapshotJoinedByLegId: 0,
    snapshotJoinedByReconstruction: 0,
    legacyJoinedByLegId: 0,
    legacyJoinedByReconstruction: 0,
    skippedMissingSnapshotDirectory: 0,
    skippedSnapshotPresentNoLegMatch: 0,
    skippedSnapshotAmbiguousReconstruction: 0,
    skippedLegacyNoLegMatch: 0,
    enforcementFailed: false,
    enforceSnapshotResolved: enforceSnapshot,
    skipReasonSamples,
    featureValidationPolicy: policy,
    policyExcludedNoSnapshotId: 0,
    policyExcludedGradedRows: 0,
    exportedViaLegacyMapJoin: 0,
    exportedViaSnapshotMapJoin: 0,
  };

  const seen = new Map<string, PerfTrackerRow>();
  const ordered: PerfTrackerRow[] = [];
  for (const r of withResult) {
    const k = `${r.date}\t${r.leg_id}`;
    if (opts.dedupe !== false) {
      seen.set(k, r);
    } else {
      ordered.push(r);
    }
  }
  const rowsToProcessRaw = opts.dedupe !== false ? [...seen.values()] : ordered;
  const rowsToProcess = [...rowsToProcessRaw].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.leg_id.localeCompare(b.leg_id);
  });

  const historicalRows = extractHistoricalFeaturesFromRows(rowsToProcess);
  const historicalByRowKey = new Map(historicalRows.map((h) => [h.rowKey, h]));

  const picks: EvPick[] = [];
  for (const row of rowsToProcess) {
    const sid = row.legsSnapshotId?.trim();
    if (sid) {
      stats.rowsWithLegsSnapshotId += 1;
    } else {
      stats.rowsWithoutLegsSnapshotId += 1;
    }

    if (policy === "snapshot_strict" && !sid) {
      stats.policyExcludedNoSnapshotId += 1;
      stats.policyExcludedGradedRows += 1;
      continue;
    }

    let legsMap: Map<string, LegCsvRecord>;
    let resolvedWithSnapshotMap = false;

    if (useLegacyMapOnly) {
      legsMap = legacyLegsMap;
    } else if (sid) {
      const dir = legsSnapshotDirectory(cwd, sid);
      const dirExists = fs.existsSync(dir);
      if (!snapshotLegsCache.has(sid)) {
        snapshotLegsCache.set(sid, loadLegsMapForSnapshotId(cwd, sid));
      }
      const snap = snapshotLegsCache.get(sid)!;
      const usable = dirExists && snap.size > 0;
      if (usable) {
        stats.snapshotReferencedDirExistsRows += 1;
      } else {
        stats.snapshotReferencedDirMissingRows += 1;
      }
      if (!usable) {
        stats.skippedNoLeg += 1;
        stats.skippedMissingSnapshotDirectory += 1;
        pushReasonSample(skipReasonSamples, "missing_snapshot_directory", row.leg_id);
        continue;
      }
      legsMap = snap;
      resolvedWithSnapshotMap = true;
    } else {
      legsMap = legacyLegsMap;
    }

    const countJoinAsSnapshot = resolvedWithSnapshotMap;
    const sidForSkipBuckets = countJoinAsSnapshot;

    const byId = getLegByTrackerId(row, legsMap);
    if (byId) {
      const resolution: LegResolution = {
        method: "leg_id",
        leg: byId.leg,
        matchedLegCsvId: byId.key,
      };
      stats.joinedByLegId += 1;
      if (countJoinAsSnapshot) {
        stats.snapshotJoinedByLegId += 1;
        stats.exportedViaSnapshotMapJoin += 1;
      } else {
        stats.legacyJoinedByLegId += 1;
        stats.exportedViaLegacyMapJoin += 1;
      }
      let pick = buildEvPickFromTrackerLeg(row, resolution.leg, resolution);
      const res = row.result === 1 ? 1 : 0;
      pick = { ...pick, gradedLegOutcome: gradedOutcomeFromResult(res) };
      const rowKey = `${row.leg_id}|${row.date}`;
      const records = buildContextRecordsForFeatureValidation(
        row,
        resolution.leg,
        historicalByRowKey.get(rowKey)
      );
      const attached = attachFeatureContextToPick(pick, {
        subjectId: row.leg_id,
        asOfUtc: asOfUtcForRow(row),
        records,
      });
      picks.push(attached);
      stats.exported += 1;
      continue;
    }

    const reconIds = collectReconstructionCandidateIds(row, legsMap);
    if (reconIds.length === 1) {
      const legId = reconIds[0]!;
      const rec = legsMap.get(legId);
      if (!rec) {
        stats.skippedNoLeg += 1;
        if (sidForSkipBuckets) {
          stats.skippedSnapshotPresentNoLegMatch += 1;
          pushReasonSample(skipReasonSamples, "snapshot_present_no_leg_match", row.leg_id);
        } else {
          stats.skippedLegacyNoLegMatch += 1;
          pushReasonSample(skipReasonSamples, "legacy_no_leg_match", row.leg_id);
        }
        continue;
      }
      const resolution: LegResolution = {
        method: "reconstruction",
        leg: rec,
        matchedLegCsvId: legId,
      };
      stats.joinedByReconstruction += 1;
      if (countJoinAsSnapshot) {
        stats.snapshotJoinedByReconstruction += 1;
        stats.exportedViaSnapshotMapJoin += 1;
      } else {
        stats.legacyJoinedByReconstruction += 1;
        stats.exportedViaLegacyMapJoin += 1;
      }
      let pick = buildEvPickFromTrackerLeg(row, resolution.leg, resolution);
      const res = row.result === 1 ? 1 : 0;
      pick = { ...pick, gradedLegOutcome: gradedOutcomeFromResult(res) };
      const rowKey = `${row.leg_id}|${row.date}`;
      const records = buildContextRecordsForFeatureValidation(
        row,
        resolution.leg,
        historicalByRowKey.get(rowKey)
      );
      const attached = attachFeatureContextToPick(pick, {
        subjectId: row.leg_id,
        asOfUtc: asOfUtcForRow(row),
        records,
      });
      picks.push(attached);
      stats.exported += 1;
      continue;
    }

    if (reconIds.length > 1) {
      stats.skippedNoLeg += 1;
      if (sidForSkipBuckets) {
        stats.skippedSnapshotAmbiguousReconstruction += 1;
        pushReasonSample(skipReasonSamples, "snapshot_present_ambiguous_reconstruction", row.leg_id);
      } else {
        stats.skippedLegacyNoLegMatch += 1;
        pushReasonSample(skipReasonSamples, "legacy_no_leg_match", row.leg_id);
      }
      continue;
    }

    stats.skippedNoLeg += 1;
    if (sidForSkipBuckets) {
      stats.skippedSnapshotPresentNoLegMatch += 1;
      pushReasonSample(skipReasonSamples, "snapshot_present_no_leg_match", row.leg_id);
    } else {
      stats.skippedLegacyNoLegMatch += 1;
      pushReasonSample(skipReasonSamples, "legacy_no_leg_match", row.leg_id);
    }
  }

  const snapshotBoundSkips =
    stats.skippedMissingSnapshotDirectory +
    stats.skippedSnapshotPresentNoLegMatch +
    stats.skippedSnapshotAmbiguousReconstruction;
  stats.enforcementFailed = enforceSnapshot && snapshotBoundSkips > 0;

  picks.sort((a, b) => a.id.localeCompare(b.id));

  if (opts.writeSnapshotStatusArtifacts) {
    writeFeatureValidationSnapshotStatusArtifacts(cwd, stats, trackerAbs);
  }

  if (opts.writePolicyStatusArtifacts) {
    // Dynamic require avoids a circular import with `export_feature_validation_policy_status.ts`.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeFeatureValidationPolicyStatusArtifacts } =
      require("./export_feature_validation_policy_status") as typeof import("./export_feature_validation_policy_status");
    writeFeatureValidationPolicyStatusArtifacts(cwd, trackerAbs, policy, stats);
  }

  return { picks, stats };
}

export function formatFeatureValidationPicksJson(picks: readonly EvPick[]): string {
  return stableStringifyForObservability(picks);
}
