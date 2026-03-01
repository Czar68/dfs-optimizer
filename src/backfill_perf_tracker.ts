// src/backfill_perf_tracker.ts
// Backfill data/perf_tracker.jsonl from tier1.csv, tier2.csv + prizepicks-legs.csv, underdog-legs.csv (last 30 days logic: use current tier/legs and runTimestamp date).

import fs from "fs";
import path from "path";
import {
  appendTrackerRow,
  readTrackerRows,
  ensureDataDir,
} from "./perf_tracker_db";
import { PerfTrackerRow } from "./perf_tracker_types";
import { americanToImpliedProb } from "./odds_math";
import { getOddsBucket } from "./odds_buckets";

const cwd = process.cwd();

function parseCsv(path: string): { headers: string[]; rows: string[][] } {
  if (!fs.existsSync(path)) return { headers: [], rows: [] };
  const raw = fs.readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const row: string[] = [];
    let rest = lines[i];
    for (let c = 0; c < headers.length; c++) {
      if (rest.startsWith('"')) {
        const end = rest.indexOf('"', 1);
        if (end === -1) {
          row.push(rest.slice(1));
          rest = "";
        } else {
          row.push(rest.slice(1, end));
          rest = rest.slice(end + 1).replace(/^,/, "");
        }
      } else {
        const idx = rest.indexOf(",");
        if (idx === -1) {
          row.push(rest);
          rest = "";
        } else {
          row.push(rest.slice(0, idx));
          rest = rest.slice(idx + 1);
        }
      }
    }
    if (rest) row.push(rest);
    rows.push(row);
  }
  return { headers, rows };
}

function toRecord(headers: string[], row: string[]): Record<string, string> {
  const rec: Record<string, string> = {};
  headers.forEach((h, i) => {
    rec[h] = row[i] ?? "";
  });
  return rec;
}

type LegInfo = {
  player: string;
  stat: string;
  line: number;
  book: string;
  trueProb: number;
  legEv: number;
  overOdds?: number;
  underOdds?: number;
};

function loadLegsMap(): Map<string, LegInfo> {
  const map = new Map<string, LegInfo>();
  for (const file of ["prizepicks-legs.csv", "underdog-legs.csv"]) {
    const p = path.join(cwd, file);
    const { headers, rows } = parseCsv(p);
    if (headers.length === 0) continue;
    const idIdx = headers.indexOf("id");
    const playerIdx = headers.indexOf("player");
    const statIdx = headers.indexOf("stat");
    const lineIdx = headers.indexOf("line");
    const bookIdx = headers.indexOf("book");
    const trueProbIdx = headers.indexOf("trueProb");
    const legEvIdx = headers.indexOf("legEv");
    const overOddsIdx = headers.indexOf("overOdds");
    const underOddsIdx = headers.indexOf("underOdds");
    if (
      idIdx === -1 ||
      playerIdx === -1 ||
      statIdx === -1 ||
      lineIdx === -1 ||
      bookIdx === -1 ||
      trueProbIdx === -1 ||
      legEvIdx === -1
    )
      continue;
    for (const row of rows) {
      const id = row[idIdx]?.trim();
      if (!id) continue;
      const lineNum = parseFloat(row[lineIdx] ?? "0") || 0;
      const trueProb = parseFloat(row[trueProbIdx] ?? "0.5") || 0.5;
      const legEv = parseFloat(row[legEvIdx] ?? "0") || 0;
      const overOdds = overOddsIdx >= 0 ? parseFloat(row[overOddsIdx] ?? "") : undefined;
      const underOdds = underOddsIdx >= 0 ? parseFloat(row[underOddsIdx] ?? "") : undefined;
      map.set(id, {
        player: (row[playerIdx] ?? "").trim(),
        stat: (row[statIdx] ?? "").trim(),
        line: lineNum,
        book: (row[bookIdx] ?? "").trim(),
        trueProb,
        legEv,
        overOdds: Number.isFinite(overOdds) ? overOdds : undefined,
        underOdds: Number.isFinite(underOdds) ? underOdds : undefined,
      });
    }
  }
  return map;
}

function dateFromRunTimestamp(ts: string): string {
  // "2026-02-23T14:49:55 ET" -> "2026-02-23"
  const match = ts.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function backfillPerfTracker(): { appended: number; skipped: number } {
  ensureDataDir();
  const legsMap = loadLegsMap();
  const existing = readTrackerRows();
  const seen = new Set<string>();
  for (const r of existing) {
    seen.add(`${r.date}\t${r.leg_id}`);
  }

  let appended = 0;
  let skipped = 0;
  const legCols = ["leg1Id", "leg2Id", "leg3Id", "leg4Id", "leg5Id", "leg6Id"];

  for (const tierFile of ["tier1.csv", "tier2.csv"]) {
    const p = path.join(cwd, tierFile);
    const { headers, rows } = parseCsv(p);
    if (headers.length === 0) continue;
    const runIdx = headers.indexOf("runTimestamp");
    // Phase 6: capture site + flexType for structure calibration
    const siteIdx = headers.indexOf("site");
    const flexTypeIdx = headers.indexOf("flexType");
    if (runIdx === -1) continue;
    const tierNum = tierFile === "tier1.csv" ? 1 : 2;

    for (const row of rows) {
      const rec = toRecord(headers, row);
      const runTimestamp = rec.runTimestamp ?? "";
      const date = dateFromRunTimestamp(runTimestamp);
      if (!date) continue;
      const kellyFracVal = rec.kellyFrac ?? "";
      const kellyStakeVal = rec.kellyStake ?? "";
      const kellyFrac = kellyFracVal ? parseFloat(kellyFracVal) : (kellyStakeVal ? 0.2 : 0);

      // Phase 6: derive platform ("PP" | "UD") and structure (e.g. "4P", "3F")
      const siteRaw = siteIdx >= 0 ? (rec.site ?? rec["site"] ?? "").trim().toUpperCase() : "";
      const platform = siteRaw === "UD" || siteRaw === "UNDERDOG" ? "UD" : "PP";
      const structure = flexTypeIdx >= 0 ? (rec.flexType ?? "").trim().toUpperCase() : "";

      for (const col of legCols) {
        const legId = (rec[col] ?? "").trim();
        if (!legId) continue;
        const key = `${date}\t${legId}`;
        if (seen.has(key)) {
          skipped++;
          continue;
        }
        const leg = legsMap.get(legId);
        if (!leg) continue;
        seen.add(key);
        const side: "over" | "under" = "over";
        const overOdds = leg.overOdds;
        const underOdds = leg.underOdds;
        const impliedProb =
          overOdds != null && Number.isFinite(overOdds)
            ? americanToImpliedProb(overOdds)
            : undefined;
        const oddsBucket =
          overOdds != null && underOdds != null
            ? getOddsBucket(overOdds, underOdds, side)
            : undefined;
        const trackerRow: PerfTrackerRow = {
          date,
          leg_id: legId,
          player: leg.player,
          stat: leg.stat,
          line: leg.line,
          book: leg.book,
          trueProb: leg.trueProb,
          projectedEV: leg.legEv,
          playedEV: leg.legEv,
          kelly: kellyFrac,
          card_tier: tierNum,
          result: undefined,
          scrape_stat: undefined,
          hist_mult: undefined,
          overOdds: overOdds ?? undefined,
          underOdds: underOdds ?? undefined,
          side,
          impliedProb: impliedProb ?? undefined,
          oddsBucket: oddsBucket ?? undefined,
          // Phase 6: structure fields for per-structure calibration
          platform: platform || undefined,
          structure: structure || undefined,
        };
        appendTrackerRow(trackerRow);
        appended++;
      }
    }
  }

  return { appended, skipped };
}

if (require.main === module) {
  const { appended, skipped } = backfillPerfTracker();
  console.log(`[PerfTracker] Backfill: appended=${appended} skipped=${skipped}`);
}
