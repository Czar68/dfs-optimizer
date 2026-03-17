/**
 * Line movement: snapshot prior odds, compare to current run, classify and
 * apply compositeScore adjustments (favorable boost, against penalties, optional block).
 *
 * AUDIT (read-only documentation):
 * A. fetch_oddsapi_props.ts: Normalized PlayerPropOdds[] is built in the event loop
 *    (normalizeEvent → allProps.push). After the loop, saveQuotaCache(allProps) and
 *    saveCache(sportKey, allProps) then return allProps. Snapshot should be written
 *    after we have allProps, only when NOT mock (same point as cache write, before return).
 * B. EvPick: had no lineMovement field; added lineMovement?: LineMovementResult in types.ts.
 * C. data/: data/odds_snapshots/ exists (OddsAPI_NBA_*). data/line_snapshots/ is new
 *    (created by this module); no existing line delta files.
 */

import fs from "fs";
import path from "path";
import type { PlayerPropOdds, EvPick, LineMovementResult, LineMovementCategory } from "./types";
import { normalizeForMatch, resolvePlayerNameForMatch } from "./merge_odds";
import { getBookWeightValue } from "./odds/book_ranker";
import {
  LINE_MOVEMENT_BLOCK_THRESHOLD,
  LINE_MOVEMENT_FAVORABLE_THRESHOLD,
  LINE_MOVEMENT_MAX_SNAPSHOT_AGE_DAYS,
} from "./constants/scoring";
import { isFeatureEnabled } from "./constants/featureFlags";
import { getOutputPath, LINE_MOVEMENT_CSV } from "./constants/paths";

const LINE_SNAPSHOTS_DIR = path.join(process.cwd(), "data", "line_snapshots");
const PRIOR_SNAPSHOT_MIN_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Format run timestamp for snapshot filename: YYYYMMDD-HHMM */
export function formatRunTsForSnapshot(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}-${h}${min}`;
}

/** Snapshot row shape (flat, one per prop). */
interface SnapshotRow {
  player: string;
  stat: string;
  book: string;
  line: number;
  overOdds: number;
  underOdds: number;
  runTs: string;
}

/**
 * Write current props to data/line_snapshots/<runTs>.json.
 * Skip when USE_MOCK_ODDS=1. Prune files older than LINE_MOVEMENT_MAX_SNAPSHOT_AGE_DAYS.
 */
export function writeLineSnapshot(props: PlayerPropOdds[], runTs: string): void {
  if (process.env.USE_MOCK_ODDS === "1" || process.env.USE_MOCK_ODDS === "true") {
    return;
  }
  try {
    if (!fs.existsSync(path.dirname(LINE_SNAPSHOTS_DIR))) {
      fs.mkdirSync(path.dirname(LINE_SNAPSHOTS_DIR), { recursive: true });
    }
    if (!fs.existsSync(LINE_SNAPSHOTS_DIR)) {
      fs.mkdirSync(LINE_SNAPSHOTS_DIR, { recursive: true });
    }
    const rows: SnapshotRow[] = props.map((p) => ({
      player: p.player,
      stat: p.stat,
      book: p.book,
      line: p.line,
      overOdds: p.overOdds,
      underOdds: p.underOdds,
      runTs,
    }));
    const file = path.join(LINE_SNAPSHOTS_DIR, `${runTs}.json`);
    fs.writeFileSync(file, JSON.stringify(rows), "utf8");
    console.log(`[LINE] Snapshot written: ${rows.length} rows → data/line_snapshots/${path.basename(file)}`);

    const cutoff = Date.now() - LINE_MOVEMENT_MAX_SNAPSHOT_AGE_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LINE_SNAPSHOTS_DIR).filter((f) => f.endsWith(".json"));
    let pruned = 0;
    for (const f of files) {
      const full = path.join(LINE_SNAPSHOTS_DIR, f);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        pruned++;
      }
    }
    if (pruned > 0) console.log(`[LINE] Pruned ${pruned} old snapshots`);
  } catch (err) {
    console.warn("[LINE] Snapshot write failed:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Parse filename YYYYMMDD-HHMM.json to timestamp ms (start of that minute, local).
 */
function parseSnapshotFilenameToMs(name: string): number | null {
  const base = name.replace(".json", "");
  const match = base.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, h, min] = match;
  const date = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(d!, 10), parseInt(h!, 10), parseInt(min!, 10), 0, 0);
  return date.getTime();
}

/**
 * Load the most recent snapshot that is ≥ 3 hours older than currentRunTs.
 * currentRunTs format: YYYYMMDD-HHMM (e.g. 20260314-0600).
 * Returns { props, priorRunTs } (priorRunTs = chosen filename without .json) or null.
 */
export function loadPriorSnapshot(currentRunTs: string): { props: PlayerPropOdds[]; priorRunTs: string } | null {
  try {
    if (!fs.existsSync(LINE_SNAPSHOTS_DIR)) {
      console.log("[LINE] No prior snapshot found (first run or gap > 7 days)");
      return null;
    }
    const currentMs = parseSnapshotFilenameToMs(currentRunTs);
    if (currentMs == null) {
      console.log("[LINE] No prior snapshot found (invalid currentRunTs format)");
      return null;
    }
    const minPriorMs = currentMs - PRIOR_SNAPSHOT_MIN_AGE_MS;
    const files = fs.readdirSync(LINE_SNAPSHOTS_DIR).filter((f) => f.endsWith(".json"));
    const candidates: { name: string; ms: number }[] = [];
    for (const f of files) {
      const ms = parseSnapshotFilenameToMs(f);
      if (ms != null && ms <= minPriorMs) candidates.push({ name: f, ms });
    }
    if (candidates.length === 0) {
      console.log("[LINE] No prior snapshot found (first run or gap > 7 days)");
      return null;
    }
    candidates.sort((a, b) => b.ms - a.ms);
    const chosen = candidates[0]!;
    const priorRunTs = chosen.name.replace(".json", "");
    const raw = fs.readFileSync(path.join(LINE_SNAPSHOTS_DIR, chosen.name), "utf8");
    const rows: SnapshotRow[] = JSON.parse(raw);
    const ageMin = Math.round((currentMs - chosen.ms) / 60000);
    const ageH = Math.floor(ageMin / 60);
    const ageM = ageMin % 60;
    console.log(`[LINE] Prior snapshot: ${chosen.name} (${ageH}h ${ageM}m ago)`);

    const out: PlayerPropOdds[] = rows.map((r) => ({
      sport: "NBA" as const,
      player: r.player,
      team: null,
      opponent: null,
      league: "NBA",
      stat: r.stat as PlayerPropOdds["stat"],
      line: r.line,
      overOdds: r.overOdds,
      underOdds: r.underOdds,
      book: r.book,
      eventId: null,
      marketId: null,
      selectionIdOver: null,
      selectionIdUnder: null,
    }));
    return { props: out, priorRunTs };
  } catch (err) {
    console.warn("[LINE] loadPriorSnapshot failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Match pick to prior by normalized player + stat; prefer Pinnacle then DraftKings.
 * Return best prior row (by book weight) or null.
 */
function findPriorRow(pick: EvPick, priorProps: PlayerPropOdds[]): PlayerPropOdds | null {
  const pickKey = normalizeForMatch(resolvePlayerNameForMatch(normalizeName(pick.player)));
  const stat = pick.stat;
  const matches = priorProps.filter((p) => {
    const priorKey = normalizeForMatch(resolvePlayerNameForMatch(normalizeName(p.player)));
    return priorKey === pickKey && p.stat === stat;
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => getBookWeightValue(b.book) - getBookWeightValue(a.book));
  return matches[0] ?? null;
}

/**
 * Classify movement for one leg. Delta = currentLine - priorLine (positive = line went up).
 * Against our pick: over + delta>0, or under + delta<0. Favorable: over + delta<0, or under + delta>0.
 */
export function classifyMovement(pick: EvPick, priorProps: PlayerPropOdds[]): LineMovementResult {
  const prior = findPriorRow(pick, priorProps);
  if (!prior) {
    return { category: "no_prior", delta: 0, priorLine: pick.line, currentLine: pick.line, priorRunTs: "" };
  }
  const currentLine = pick.line;
  const priorLine = prior.line;
  const delta = currentLine - priorLine;
  const isOver = pick.outcome === "over";
  const againstMagnitude = isOver ? delta : -delta;
  const favorableMagnitude = isOver ? -delta : delta;

  let category: LineMovementCategory = "neutral";
  if (againstMagnitude >= LINE_MOVEMENT_BLOCK_THRESHOLD) category = "strong_against";
  else if (againstMagnitude >= LINE_MOVEMENT_FAVORABLE_THRESHOLD) category = "moderate_against";
  else if (favorableMagnitude >= LINE_MOVEMENT_FAVORABLE_THRESHOLD) category = "favorable";

  return {
    category,
    delta,
    priorLine,
    currentLine,
    priorRunTs: "",
  };
}

export interface EnrichLegsWithMovementOptions {
  /** When true, append new rows to existing line_movement.csv instead of overwriting (for combining PP + UD rows). */
  appendToExisting?: boolean;
}

/**
 * Enrich legs with lineMovement; optionally remove STRONG_AGAINST when BLOCK enabled.
 * Writes data/output_logs/line_movement.csv and logs summary.
 */
export function enrichLegsWithMovement(
  legs: EvPick[],
  priorProps: PlayerPropOdds[],
  priorRunTs: string,
  options?: EnrichLegsWithMovementOptions
): EvPick[] {
  const summary = { favorable: 0, neutral: 0, moderate_against: 0, strong_against: 0, blocked: 0, no_prior: 0 };
  const blockEnabled = isFeatureEnabled("LINE_MOVEMENT_BLOCK_ENABLED");
  const rows: string[] = [];

  const enriched: EvPick[] = [];
  for (const leg of legs) {
    const result = classifyMovement(leg, priorProps);
    const withPriorTs = { ...result, priorRunTs };
    leg.lineMovement = withPriorTs;

    if (result.category === "strong_against" && blockEnabled) {
      summary.blocked++;
      console.log(`[LINE] BLOCKED: ${leg.player} ${leg.stat} delta=${result.delta.toFixed(1)} (strong_against)`);
      continue;
    }

    if (result.category === "favorable") summary.favorable++;
    else if (result.category === "neutral") summary.neutral++;
    else if (result.category === "moderate_against") summary.moderate_against++;
    else if (result.category === "strong_against") summary.strong_against++;
    else summary.no_prior++;

    enriched.push(leg);
    rows.push([
      leg.id,
      leg.player,
      leg.stat,
      result.delta.toFixed(2),
      result.category,
      result.priorLine.toFixed(2),
      result.currentLine.toFixed(2),
      priorRunTs,
    ].join(","));
  }

  console.log(
    `[LINE] Movement summary: favorable=${summary.favorable} neutral=${summary.neutral} moderate_against=${summary.moderate_against} strong_against=${summary.strong_against} blocked=${summary.blocked} no_prior=${summary.no_prior}`
  );

  try {
    const outPath = getOutputPath(LINE_MOVEMENT_CSV);
    const header = "leg_id,player,stat,delta,category,priorLine,currentLine,priorRunTs";
    let existingRows: string[] = [];
    if (options?.appendToExisting && fs.existsSync(outPath)) {
      const raw = fs.readFileSync(outPath, "utf8");
      const lines = raw.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length > 1) existingRows = lines.slice(1);
    }
    fs.writeFileSync(outPath, [header, ...existingRows, ...rows].join("\n"), "utf8");
  } catch (err) {
    console.warn("[LINE] line_movement.csv write failed:", err instanceof Error ? err.message : String(err));
  }

  return enriched;
}

// ---- Archive-based line movement (data/legs_archive/prizepicks-legs-YYYYMMDD.csv) ----

const LEGS_ARCHIVE_DIR = path.join(process.cwd(), "data", "legs_archive");
const LINE_DELTA_SIGNIFICANT = 0.5;
const ODDS_DELTA_SIGNIFICANT = 10;

function parseCsvRows(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row: Record<string, string> = {};
    let rest = lines[i];
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (rest.startsWith('"')) {
        const end = rest.indexOf('"', 1);
        if (end === -1) {
          row[key] = rest.slice(1);
          rest = "";
        } else {
          row[key] = rest.slice(1, end);
          rest = rest.slice(end + 1).replace(/^,/, "");
        }
      } else {
        const idx = rest.indexOf(",");
        if (idx === -1) {
          row[key] = rest;
          rest = "";
        } else {
          row[key] = rest.slice(0, idx);
          rest = rest.slice(idx + 1);
        }
      }
    }
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Apply archive-based line movement: read today's prizepicks-legs-YYYYMMDD.csv,
 * group by player+stat, compute line/odds deltas (earliest vs latest run), set
 * direction (toward/against/none) and adjust legEv. Returns legs with lineMovement set where applicable.
 */
export function applyLineMovement(legs: EvPick[]): EvPick[] {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const yyyymmdd = `${y}${m}${d}`;
    const archivePath = path.join(LEGS_ARCHIVE_DIR, `prizepicks-legs-${yyyymmdd}.csv`);
    if (!fs.existsSync(archivePath)) return legs;

    const { rows } = parseCsvRows(archivePath);
    if (rows.length === 0) return legs;

    type GroupRow = { line: number; overOdds: number; runTimestamp: string };
    const key = (player: string, stat: string) => `${normalizeName(player)}|${String(stat).trim().toLowerCase()}`;
    const groups = new Map<string, GroupRow[]>();
    for (const r of rows) {
      const player = r.player ?? "";
      const stat = r.stat ?? "";
      const runTimestamp = r.runTimestamp ?? "";
      const line = parseFloat(r.line);
      const overOdds = parseFloat(r.overOdds);
      if (!player || !stat || !runTimestamp || !Number.isFinite(line) || !Number.isFinite(overOdds)) continue;
      const k = key(player, stat);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ line, overOdds, runTimestamp });
    }

    const movementByKey = new Map<string, { lineDelta: number; oddsDelta: number; runsObserved: number }>();
    for (const [k, list] of groups) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.runTimestamp.localeCompare(b.runTimestamp));
      const earliest = list[0];
      const latest = list[list.length - 1];
      const lineDelta = latest.line - earliest.line;
      const oddsDelta = latest.overOdds - earliest.overOdds;
      movementByKey.set(k, { lineDelta, oddsDelta, runsObserved: list.length });
    }

    const result = legs.map((leg) => {
      const k = key(leg.player, leg.stat);
      const mov = movementByKey.get(k);
      if (!mov) return leg;

      const significant = Math.abs(mov.lineDelta) >= LINE_DELTA_SIGNIFICANT || Math.abs(mov.oddsDelta) >= ODDS_DELTA_SIGNIFICANT;
      let direction: "toward" | "against" | "none" = "none";
      if (significant) {
        const pick = leg.outcome;
        const toward =
          (pick === "over" && mov.lineDelta < 0) ||
          (pick === "over" && mov.oddsDelta < 0) ||
          (pick === "under" && mov.lineDelta > 0) ||
          (pick === "under" && mov.oddsDelta > 0);
        direction = toward ? "toward" : "against";
      }

      const lineMovement = {
        direction,
        lineDelta: mov.lineDelta,
        oddsDelta: mov.oddsDelta,
        runsObserved: mov.runsObserved,
      };

      let legEv = leg.legEv;
      if (direction === "toward") {
        legEv *= 1.1;
        console.log(`[MOVE] Sharp toward: ${leg.player} ${leg.stat} delta=${mov.lineDelta}`);
      } else if (direction === "against") {
        legEv *= 0.92;
        console.log(`[MOVE] Steam against: ${leg.player} ${leg.stat} delta=${mov.lineDelta}`);
      }

      return {
        ...leg,
        legEv,
        lineMovement,
      };
    });

    return result;
  } catch (err) {
    console.warn("[MOVE] Error:", err instanceof Error ? err.message : String(err));
    return legs;
  }
}
