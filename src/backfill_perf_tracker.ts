// src/backfill_perf_tracker.ts
// Backfill data/perf_tracker.jsonl from:
// 1) data/legs_archive/ + data/tier_archive/ (date-stamped runs)
// 2) current data/output_logs/ tier + legs (runTimestamp date)

import fs from "fs";
import path from "path";
import { getOutputPath, PP_LEGS_CSV, UD_LEGS_CSV, TIER1_CSV, TIER2_CSV } from "./constants/paths";
import {
  appendTrackerRow,
  readTrackerRows,
  ensureDataDir,
} from "./perf_tracker_db";
import { PerfTrackerRow } from "./perf_tracker_types";
import { americanToImpliedProb } from "./odds_math";
import { getOddsBucket } from "./odds_buckets";

const LEGS_ARCHIVE_DIR = path.join(process.cwd(), "data", "legs_archive");
const TIER_ARCHIVE_DIR = path.join(process.cwd(), "data", "tier_archive");

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

function loadLegsMapFromPaths(ppPath: string, udPath: string): Map<string, LegInfo> {
  const map = new Map<string, LegInfo>();
  for (const p of [ppPath, udPath]) {
    if (!p || !fs.existsSync(p)) continue;
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

function loadLegsMap(): Map<string, LegInfo> {
  const ppPath = getOutputPath(PP_LEGS_CSV);
  const udPath = getOutputPath(UD_LEGS_CSV);
  return loadLegsMapFromPaths(ppPath, udPath);
}

/** Return YYYYMMDD dates that have legs archive files (from prizepicks-legs-*.csv names). */
function getArchiveDates(): string[] {
  if (!fs.existsSync(LEGS_ARCHIVE_DIR)) return [];
  const files = fs.readdirSync(LEGS_ARCHIVE_DIR);
  const dates = new Set<string>();
  for (const f of files) {
    const m = f.match(/^prizepicks-legs-(\d{8})\.csv$/);
    if (m) dates.add(m[1]);
  }
  return [...dates].sort();
}

/** YYYYMMDD -> YYYY-MM-DD for tracker date field. */
function archiveDateToIso(dateYyyyMmDd: string): string {
  return `${dateYyyyMmDd.slice(0, 4)}-${dateYyyyMmDd.slice(4, 6)}-${dateYyyyMmDd.slice(6, 8)}`;
}

function dateFromRunTimestamp(ts: string): string {
  // "2026-02-23T14:49:55 ET" -> "2026-02-23"
  const match = ts.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

const LEG_COLS = ["leg1Id", "leg2Id", "leg3Id", "leg4Id", "leg5Id", "leg6Id"] as const;

function processTierRows(
  date: string,
  tierNum: 1 | 2,
  headers: string[],
  rows: string[][],
  legsMap: Map<string, LegInfo>,
  seen: Set<string>
): { appended: number; skipped: number } {
  let appended = 0;
  let skipped = 0;
  const siteIdx = headers.indexOf("site");
  const flexTypeIdx = headers.indexOf("flexType");

  for (const row of rows) {
    const rec = toRecord(headers, row);
    const kellyFracVal = rec.kellyFrac ?? "";
    const kellyStakeVal = rec.kellyStake ?? "";
    const kellyFrac = kellyFracVal ? parseFloat(kellyFracVal) : (kellyStakeVal ? 0.2 : 0);
    const siteRaw = siteIdx >= 0 ? (rec.site ?? "").trim().toUpperCase() : "";
    const platform = siteRaw === "UD" || siteRaw === "UNDERDOG" ? "UD" : "PP";
    const structure = flexTypeIdx >= 0 ? (rec.flexType ?? "").trim().toUpperCase() : "";

    for (const col of LEG_COLS) {
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
        platform: platform || undefined,
        structure: structure || undefined,
      };
      appendTrackerRow(trackerRow);
      appended++;
    }
  }
  return { appended, skipped };
}

export function backfillPerfTracker(): { appended: number; skipped: number } {
  ensureDataDir();
  const existing = readTrackerRows();
  const seen = new Set<string>();
  for (const r of existing) {
    seen.add(`${r.date}\t${r.leg_id}`);
  }

  let totalAppended = 0;
  let totalSkipped = 0;

  // 1) Walk legs_archive + tier_archive by date
  const dates = getArchiveDates();
  for (const dateYyyyMmDd of dates) {
    const ppPath = path.join(LEGS_ARCHIVE_DIR, `prizepicks-legs-${dateYyyyMmDd}.csv`);
    const udPath = path.join(LEGS_ARCHIVE_DIR, `underdog-legs-${dateYyyyMmDd}.csv`);
    const t1Path = path.join(TIER_ARCHIVE_DIR, `tier1-${dateYyyyMmDd}.csv`);
    const t2Path = path.join(TIER_ARCHIVE_DIR, `tier2-${dateYyyyMmDd}.csv`);
    if (!fs.existsSync(ppPath) || !fs.existsSync(udPath) || !fs.existsSync(t1Path) || !fs.existsSync(t2Path)) continue;

    const legsMap = loadLegsMapFromPaths(ppPath, udPath);
    const dateIso = archiveDateToIso(dateYyyyMmDd);

    const { headers: h1, rows: r1 } = parseCsv(t1Path);
    const { headers: h2, rows: r2 } = parseCsv(t2Path);
    const filterMock = (headers: string[], rows: string[][]): { rows: string[][]; mockCount: number } => {
      let mockCount = 0;
      const rowsOut = rows.filter((row) => {
        const rec = toRecord(headers, row);
        if (rec.runTimestamp?.startsWith("MOCK-")) {
          mockCount++;
          return false;
        }
        return true;
      });
      return { rows: rowsOut, mockCount };
    };
    const f1 = h1.indexOf("runTimestamp") >= 0 ? filterMock(h1, r1) : { rows: r1, mockCount: 0 };
    const f2 = h2.indexOf("runTimestamp") >= 0 ? filterMock(h2, r2) : { rows: r2, mockCount: 0 };
    if (f1.mockCount > 0) console.log(`[BACKFILL] Skipped ${f1.mockCount} mock rows from ${path.basename(t1Path)}`);
    if (f2.mockCount > 0) console.log(`[BACKFILL] Skipped ${f2.mockCount} mock rows from ${path.basename(t2Path)}`);
    let app = 0;
    let sk = 0;
    if (h1.length > 0 && h1.indexOf("leg1Id") >= 0) {
      const a = processTierRows(dateIso, 1, h1, f1.rows, legsMap, seen);
      app += a.appended;
      sk += a.skipped;
    }
    if (h2.length > 0 && h2.indexOf("leg1Id") >= 0) {
      const a = processTierRows(dateIso, 2, h2, f2.rows, legsMap, seen);
      app += a.appended;
      sk += a.skipped;
    }
    totalAppended += app;
    totalSkipped += sk;
    console.log(`[Backfill] date=${dateYyyyMmDd} legs=${legsMap.size} appended=${app} skipped=${sk}`);
  }

  // 2) Current run from output_logs (tier + legs, date from runTimestamp)
  const legsMap = loadLegsMap();
  for (const tierFile of [TIER1_CSV, TIER2_CSV]) {
    const p = getOutputPath(tierFile);
    const { headers, rows } = parseCsv(p);
    if (headers.length === 0) continue;
    const runIdx = headers.indexOf("runTimestamp");
    if (runIdx === -1) continue;
    const tierNum = tierFile === "tier1.csv" ? 1 : 2;
    let mockSkipped = 0;

    for (const row of rows) {
      const rec = toRecord(headers, row);
      const runTimestamp = rec.runTimestamp ?? "";
      if (runTimestamp.startsWith("MOCK-")) {
        mockSkipped++;
        continue;
      }
      const date = dateFromRunTimestamp(runTimestamp);
      if (!date) continue;
      const { appended, skipped } = processTierRows(
        date,
        tierNum as 1 | 2,
        headers,
        [row],
        legsMap,
        seen
      );
      totalAppended += appended;
      totalSkipped += skipped;
    }
    if (mockSkipped > 0) console.log(`[BACKFILL] Skipped ${mockSkipped} mock rows from ${tierFile}`);
  }

  return { appended: totalAppended, skipped: totalSkipped };
}

if (require.main === module) {
  const { appended, skipped } = backfillPerfTracker();
  console.log(`[PerfTracker] Backfill: appended=${appended} skipped=${skipped}`);
}
