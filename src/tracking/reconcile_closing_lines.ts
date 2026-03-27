/**
 * Phase 16O: Closing-line reconciliation for tracker/perf rows.
 *
 * Closing-line definition:
 * 1) Use latest snapshot at or before game start.
 * 2) Within that snapshot, match market conservatively by stable market id + side.
 * 3) Accept only if chosen-side odds are unique (or all equal); otherwise ambiguous -> skip.
 * 4) Never use post-start snapshots, never fabricate close from open.
 */

import fs from "fs";
import path from "path";
import { americanToImpliedProb } from "../odds_math";
import { readTrackerRows, writeTrackerRows } from "../perf_tracker_db";
import { inferSide, type PerfTrackerRow } from "../perf_tracker_types";
import { deriveClvMetrics } from "./clv_math";
import { stableMarketId } from "./id_normalization";
import type { TrackedCard, TrackedLeg } from "./tracker_schema";

type SnapshotRow = {
  league?: string;
  player?: string;
  stat?: string;
  line?: number;
  overOdds?: number;
  underOdds?: number;
};

type SnapshotFile = {
  fetchedAtUtc?: string;
  rows?: SnapshotRow[];
};

export type SnapshotIndexItem = {
  fetchedAtUtc: string;
  rows: SnapshotRow[];
};

export type ReconcileStats = {
  scanned: number;
  updated: number;
  alreadyPopulated: number;
  skippedNoStart: number;
  skippedNoMatch: number;
  skippedAmbiguous: number;
  skippedPostStartOnly: number;
};

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function loadSnapshots(snapshotsDir: string): SnapshotIndexItem[] {
  if (!fs.existsSync(snapshotsDir)) return [];
  const files = fs
    .readdirSync(snapshotsDir)
    .filter((f) => /^OddsAPI_.*\.json$/i.test(f))
    .sort();
  const out: SnapshotIndexItem[] = [];
  for (const f of files) {
    const full = path.join(snapshotsDir, f);
    const parsed = readJson<SnapshotFile>(full);
    if (!parsed?.fetchedAtUtc || !Array.isArray(parsed.rows)) continue;
    out.push({ fetchedAtUtc: parsed.fetchedAtUtc, rows: parsed.rows });
  }
  out.sort((a, b) => new Date(b.fetchedAtUtc).getTime() - new Date(a.fetchedAtUtc).getTime());
  return out;
}

function chosenSideOdds(row: SnapshotRow, side: "over" | "under"): number | undefined {
  const x = side === "over" ? row.overOdds : row.underOdds;
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function marketIdForRow(row: SnapshotRow): string | null {
  if (!row.league || !row.player || !row.stat || typeof row.line !== "number") return null;
  return stableMarketId(row.league, row.player, row.stat, row.line);
}

export function resolveCloseOddsFromSnapshots(
  snapshots: SnapshotIndexItem[],
  params: {
    marketId?: string;
    league?: string;
    playerName: string;
    stat: string;
    line: number;
    side: "over" | "under";
    gameStartTime?: string | null;
  }
): { status: "matched" | "no_start" | "no_match" | "ambiguous" | "post_start_only"; closeOddsAmerican?: number } {
  if (!params.gameStartTime) return { status: "no_start" };
  const startMs = new Date(params.gameStartTime).getTime();
  if (!Number.isFinite(startMs)) return { status: "no_start" };

  let sawPostStart = false;
  for (const snap of snapshots) {
    const snapMs = new Date(snap.fetchedAtUtc).getTime();
    if (!Number.isFinite(snapMs)) continue;
    if (snapMs > startMs) {
      sawPostStart = true;
      continue;
    }

    const candidates = snap.rows.filter((r) => {
      if (typeof r.line !== "number") return false;
      if (Math.abs(r.line - params.line) > 1e-9) return false;
      if (String(r.stat || "").toLowerCase() !== String(params.stat).toLowerCase()) return false;

      const rowMid = marketIdForRow(r);
      if (params.marketId && rowMid) return rowMid === params.marketId;

      // fallback conservative key
      return (
        String(r.player || "").toLowerCase() === params.playerName.toLowerCase() &&
        String(r.league || "").toLowerCase() === String(params.league || "NBA").toLowerCase()
      );
    });

    if (candidates.length === 0) continue;
    const oddsSet = new Set<number>();
    for (const c of candidates) {
      const o = chosenSideOdds(c, params.side);
      if (o != null) oddsSet.add(o);
    }
    if (oddsSet.size === 0) return { status: "no_match" };
    if (oddsSet.size > 1) return { status: "ambiguous" };
    return { status: "matched", closeOddsAmerican: Array.from(oddsSet)[0] };
  }

  return sawPostStart ? { status: "post_start_only" } : { status: "no_match" };
}

export function diagnoseClvMatchCoverage(
  rows: Array<{
    marketId?: string;
    league?: string;
    playerName: string;
    stat: string;
    line: number;
    side: "over" | "under";
    gameStartTime?: string | null;
    closeOddsAmerican?: number;
  }>,
  snapshots: SnapshotIndexItem[]
): {
  scanned: number;
  alreadyPopulated: number;
  matched: number;
  skippedNoStart: number;
  skippedNoMatch: number;
  skippedAmbiguous: number;
  skippedPostStartOnly: number;
} {
  let scanned = 0;
  let alreadyPopulated = 0;
  let matched = 0;
  let skippedNoStart = 0;
  let skippedNoMatch = 0;
  let skippedAmbiguous = 0;
  let skippedPostStartOnly = 0;
  for (const row of rows) {
    scanned += 1;
    if (typeof row.closeOddsAmerican === "number" && Number.isFinite(row.closeOddsAmerican)) {
      alreadyPopulated += 1;
      continue;
    }
    const m = resolveCloseOddsFromSnapshots(snapshots, {
      marketId: row.marketId,
      league: row.league,
      playerName: row.playerName,
      stat: row.stat,
      line: row.line,
      side: row.side,
      gameStartTime: row.gameStartTime,
    });
    if (m.status === "matched") matched += 1;
    else if (m.status === "no_start") skippedNoStart += 1;
    else if (m.status === "ambiguous") skippedAmbiguous += 1;
    else if (m.status === "post_start_only") skippedPostStartOnly += 1;
    else skippedNoMatch += 1;
  }
  return {
    scanned,
    alreadyPopulated,
    matched,
    skippedNoStart,
    skippedNoMatch,
    skippedAmbiguous,
    skippedPostStartOnly,
  };
}

function shouldSkipExisting(closeOddsAmerican: unknown, forceRecompute: boolean): boolean {
  if (forceRecompute) return false;
  return typeof closeOddsAmerican === "number" && Number.isFinite(closeOddsAmerican);
}

function applyClvToLeg(
  leg: TrackedLeg,
  side: "over" | "under",
  closeOddsAmerican: number
): void {
  leg.closeOddsAmerican = closeOddsAmerican;
  leg.closeImpliedProb = americanToImpliedProb(closeOddsAmerican);
  const openImplied = leg.openImpliedProb;
  const clv = deriveClvMetrics(openImplied, leg.closeImpliedProb);
  leg.clvDelta = clv.clvDelta;
  leg.clvPct = clv.clvPct;
}

export function reconcileClosingLines(options?: {
  rootDir?: string;
  snapshotsDir?: string;
  forceRecompute?: boolean;
}): { pendingStats: ReconcileStats; historyStats: ReconcileStats; perfStats: ReconcileStats } {
  const root = options?.rootDir ?? process.cwd();
  const snapshotsDir = options?.snapshotsDir ?? path.join(root, "data", "odds_snapshots");
  const forceRecompute = options?.forceRecompute ?? false;
  const snapshots = loadSnapshots(snapshotsDir);

  const pendingPath = path.join(root, "data", "tracking", "pending_cards.json");
  const historyPath = path.join(root, "data", "tracking", "history.json");

  const reconcileCardsFile = (filePath: string): ReconcileStats => {
    const stats: ReconcileStats = {
      scanned: 0,
      updated: 0,
      alreadyPopulated: 0,
      skippedNoStart: 0,
      skippedNoMatch: 0,
      skippedAmbiguous: 0,
      skippedPostStartOnly: 0,
    };
    const raw = readJson<{ timestamp?: string; cards?: TrackedCard[] }>(filePath);
    if (!raw || !Array.isArray(raw.cards)) return stats;

    for (const card of raw.cards) {
      for (const leg of card.legs || []) {
        stats.scanned += 1;
        if (shouldSkipExisting(leg.closeOddsAmerican, forceRecompute)) {
          stats.alreadyPopulated += 1;
          continue;
        }
        const marketId =
          leg.marketId ??
          stableMarketId("NBA", leg.playerName, leg.market, leg.line);
        const side: "over" | "under" = leg.pick === "Under" ? "under" : "over";
        const match = resolveCloseOddsFromSnapshots(snapshots, {
          marketId,
          league: "NBA",
          playerName: leg.playerName,
          stat: leg.market,
          line: leg.line,
          side,
          gameStartTime: leg.gameStartTime,
        });
        if (match.status === "matched" && typeof match.closeOddsAmerican === "number") {
          applyClvToLeg(leg, side, match.closeOddsAmerican);
          stats.updated += 1;
        } else if (match.status === "no_start") stats.skippedNoStart += 1;
        else if (match.status === "ambiguous") stats.skippedAmbiguous += 1;
        else if (match.status === "post_start_only") stats.skippedPostStartOnly += 1;
        else stats.skippedNoMatch += 1;
      }
    }

    writeJson(filePath, { ...raw, cards: raw.cards });
    return stats;
  };

  const pendingStats = reconcileCardsFile(pendingPath);
  const historyStats = reconcileCardsFile(historyPath);

  const perfRows = readTrackerRows();
  const perfStats: ReconcileStats = {
    scanned: 0,
    updated: 0,
    alreadyPopulated: 0,
    skippedNoStart: 0,
    skippedNoMatch: 0,
    skippedAmbiguous: 0,
    skippedPostStartOnly: 0,
  };
  for (const row of perfRows) {
    perfStats.scanned += 1;
    if (shouldSkipExisting((row as PerfTrackerRow).closeOddsAmerican, forceRecompute)) {
      perfStats.alreadyPopulated += 1;
      continue;
    }
    const side = row.side ?? inferSide(row.leg_id);
    const marketId =
      row.marketId ??
      stableMarketId("NBA", row.player, row.stat, row.line);
    const match = resolveCloseOddsFromSnapshots(snapshots, {
      marketId,
      league: "NBA",
      playerName: row.player,
      stat: row.stat,
      line: row.line,
      side,
      gameStartTime: row.gameStartTime ?? null,
    });
    if (match.status === "matched" && typeof match.closeOddsAmerican === "number") {
      row.closeOddsAmerican = match.closeOddsAmerican;
      row.closeImpliedProb = americanToImpliedProb(match.closeOddsAmerican);
      const openImplied = row.openImpliedProb ?? row.impliedProb;
      const clv = deriveClvMetrics(openImplied, row.closeImpliedProb);
      row.clvDelta = clv.clvDelta;
      row.clvPct = clv.clvPct;
      perfStats.updated += 1;
    } else if (match.status === "no_start") perfStats.skippedNoStart += 1;
    else if (match.status === "ambiguous") perfStats.skippedAmbiguous += 1;
    else if (match.status === "post_start_only") perfStats.skippedPostStartOnly += 1;
    else perfStats.skippedNoMatch += 1;
  }
  writeTrackerRows(perfRows);

  return { pendingStats, historyStats, perfStats };
}

function fmt(s: ReconcileStats): string {
  return `scanned=${s.scanned} updated=${s.updated} already=${s.alreadyPopulated} no_start=${s.skippedNoStart} no_match=${s.skippedNoMatch} ambiguous=${s.skippedAmbiguous} post_start_only=${s.skippedPostStartOnly}`;
}

if (require.main === module) {
  const force = process.argv.includes("--force-recompute");
  const result = reconcileClosingLines({ forceRecompute: force });
  console.log(`[reconcile:clv] pending: ${fmt(result.pendingStats)}`);
  console.log(`[reconcile:clv] history: ${fmt(result.historyStats)}`);
  console.log(`[reconcile:clv] perf:    ${fmt(result.perfStats)}`);
}

