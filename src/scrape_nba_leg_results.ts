// src/scrape_nba_leg_results.ts
// For tracker rows missing result: fetch actual stat (NBA/ESPN box score), set result = actual >= line ? 1 : 0 and scrape_stat = actual; append/log.

import { readTrackerRows, writeTrackerRows } from "./perf_tracker_db";
import { PerfTrackerRow } from "./perf_tracker_types";
import {
  fetchAllPlayerStatsForDate,
  getStatValueFromBox,
  type PlayerGameStats,
} from "./espn_boxscore";

export type ActualStatFetcher = (
  date: string,
  player: string,
  stat: string,
  line: number
) => Promise<number | null>;

function normalizePlayerName(name: string): string {
  return name
    .replace(/\s*(Jr\.?|III?|IV|II)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Match tracker player to box score key (last name or full normalized). */
function findPlayerStat(
  datePlayerStats: Map<string, PlayerGameStats>,
  player: string
): PlayerGameStats | null {
  const norm = normalizePlayerName(player);
  const exact = datePlayerStats.get(norm);
  if (exact) return exact;
  const last = norm.split(" ").pop() ?? "";
  for (const [key, stats] of datePlayerStats) {
    if (key.endsWith(" " + last) || key === last) return stats;
  }
  return null;
}

const dateCache = new Map<string, Map<string, PlayerGameStats>>();

/** Real NBA fetcher via ESPN: scoreboard for date + summary per game (1s delay). Returns actual stat or null. */
export async function fetchActualStatFromNba(
  date: string,
  player: string,
  stat: string,
  line: number
): Promise<number | null> {
  if (!date || !player || !stat) return null;
  let cache = dateCache.get(date);
  if (!cache) {
    cache = await fetchAllPlayerStatsForDate(date);
    dateCache.set(date, cache);
  }
  const stats = findPlayerStat(cache, player);
  if (!stats) return null;
  const value = getStatValueFromBox(stats, stat);
  const shortDate = date.slice(5).replace("-", "/");
  console.log(`ESPN: ${player} ${shortDate} ${stat}=${value}`);
  return value;
}

/** Clear date cache (e.g. between test runs). */
export function clearEspnDateCache(): void {
  dateCache.clear();
}

/** Mock for tests: return value that yields hit (actual >= line) when hit is true. */
export function mockFetchActual(line: number, hit: boolean): ActualStatFetcher {
  return async () => (hit ? line + 1 : Math.max(0, line - 1));
}

/** Process tracker: fill result and scrape_stat for rows missing result using fetcher; rewrite JSONL. */
export async function scrapeAndUpdateTracker(
  fetcher: ActualStatFetcher = async () => null
): Promise<{ updated: number; skipped: number; noData: number }> {
  const rows = readTrackerRows();
  const start = process.env.PERF_SCRAPE_START;
  const end = process.env.PERF_SCRAPE_END;
  const toProcess =
    start || end
      ? rows.filter((r) => {
          if (start && r.date < start) return false;
          if (end && r.date > end) return false;
          return true;
        })
      : rows;
  if (start || end) console.log(`[Scraper] date range: ${start ?? "(any)"} to ${end ?? "(any)"} → ${toProcess.length} rows`);
  let updated = 0;
  let skipped = 0;
  let noData = 0;

  for (const row of toProcess) {
    if (row.result === 0 || row.result === 1) {
      skipped++;
      continue;
    }
    const actual = await fetcher(row.date, row.player, row.stat, row.line);
    if (actual === null || actual === undefined) {
      noData++;
      continue;
    }
    const hit = actual >= row.line ? 1 : 0;
    (row as PerfTrackerRow).scrape_stat = actual;
    (row as PerfTrackerRow).result = hit as 0 | 1;
    updated++;
    const ev = (row.playedEV * 100).toFixed(1);
    const shortDate = row.date.slice(5).replace("-", "/");
    console.log(
      `${shortDate} ${row.player} ${row.stat} ${actual} ${hit ? ">=" : "<"} ${row.line} ${hit ? "HIT" : "MISS"} EV${ev}%`
    );
  }

  if (updated > 0) {
    writeTrackerRows(rows);
  }
  return { updated, skipped, noData };
}

if (require.main === module) {
  scrapeAndUpdateTracker(fetchActualStatFromNba).then((r) =>
    console.log(`[Scraper] updated=${r.updated} skipped=${r.skipped} noData=${r.noData}`)
  );
}
