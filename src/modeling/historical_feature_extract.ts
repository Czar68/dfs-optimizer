/**
 * Phase 80 — Extract historical features from perf_tracker.jsonl (grounded only).
 */

import fs from "fs";
import path from "path";
import type { PerfTrackerRow } from "../perf_tracker_types";
import { parseTrackerLine } from "../perf_tracker_types";
import { readTrackerRows } from "../perf_tracker_db";
import { normalizeStatToken, stableMarketId, stablePlayerId } from "../tracking/id_normalization";
import { getOppAdjustment } from "../matchups/opp_adjust";
import {
  arithmeticMean,
  sampleVarianceUnbiased,
  slopeLinearOnIndex,
} from "../../math_models/rolling_stats";
import type {
  FeatureCoverageEntry,
  HistoricalFeatureRegistryPayload,
  HistoricalFeatureRow,
} from "./historical_feature_registry";
import {
  HISTORICAL_FEATURE_FAMILIES,
  HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION,
} from "./historical_feature_registry";

const DEFAULT_LEAGUE = "NBA";

function compareChronological(a: PerfTrackerRow, b: PerfTrackerRow): number {
  const da = a.date.localeCompare(b.date);
  if (da !== 0) return da;
  const ta = a.gameStartTime ? Date.parse(a.gameStartTime) : 0;
  const tb = b.gameStartTime ? Date.parse(b.gameStartTime) : 0;
  if (ta !== tb) return ta - tb;
  return a.leg_id.localeCompare(b.leg_id);
}

export function marketGroupKey(r: PerfTrackerRow): string {
  if (r.playerId && r.marketId) return `${r.playerId}|${r.marketId}`;
  const league = DEFAULT_LEAGUE;
  const pid = stablePlayerId(league, r.player);
  const mid = stableMarketId(league, r.player, r.stat, r.line);
  return `${pid}|${mid}`;
}

function playerChainKey(r: PerfTrackerRow): string {
  return r.playerId ?? stablePlayerId(DEFAULT_LEAGUE, r.player);
}

function parseYyyyMmDd(d: string): Date {
  const [y, m, day] = d.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, day));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function lastN<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  return arr.slice(arr.length - n);
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function buildRow(
  r: PerfTrackerRow,
  priorSameMarket: PerfTrackerRow[],
  priorSamePlayerAnyMarket: PerfTrackerRow[]
): HistoricalFeatureRow {
  const gameTotal = finiteOrNull(r.gameTotal);
  const spread = finiteOrNull(r.spread);

  const statN = r.statNormalized ?? normalizeStatToken(r.stat);
  const mgk = marketGroupKey(r);
  const priorResolved = priorSameMarket.filter((p) => p.result === 0 || p.result === 1);
  const allHits = priorResolved.map((p) => p.result);

  const h5 = lastN(allHits, 5);
  const h10 = lastN(allHits, 10);
  const h20 = lastN(allHits, 20);
  const s5 = lastN(
    priorResolved
      .map((p) => p.scrape_stat)
      .filter((x): x is number => x != null && Number.isFinite(x)),
    5
  );
  const s10 = lastN(
    priorResolved
      .map((p) => p.scrape_stat)
      .filter((x): x is number => x != null && Number.isFinite(x)),
    10
  );

  const formL5HitRate = h5.length ? arithmeticMean(h5.map(Number)) : null;
  const formL10HitRate = h10.length ? arithmeticMean(h10.map(Number)) : null;
  const formL20HitRate = h20.length ? arithmeticMean(h20.map(Number)) : null;
  const formL5ScrapeStatMean = s5.length ? arithmeticMean(s5) : null;
  const formL10ScrapeStatMean = s10.length ? arithmeticMean(s10) : null;
  const formL5HitVariance = h5.length >= 2 ? sampleVarianceUnbiased(h5.map(Number)) : null;
  const formL10HitVariance = h10.length >= 2 ? sampleVarianceUnbiased(h10.map(Number)) : null;
  const formL10HitTrendSlope = h10.length >= 2 ? slopeLinearOnIndex(h10.map(Number)) : null;

  let daysRest: number | null = null;
  let isBackToBack: boolean | null = null;
  let playerGamesInLast4CalendarDays: number | null = null;

  const priorPlayerResolved = priorSamePlayerAnyMarket.filter((p) => p.result === 0 || p.result === 1);
  if (priorPlayerResolved.length > 0) {
    const last = priorPlayerResolved[priorPlayerResolved.length - 1];
    const dCur = parseYyyyMmDd(r.date);
    const dPrev = parseYyyyMmDd(last.date);
    daysRest = daysBetween(dPrev, dCur);
    isBackToBack = daysRest === 1;
  }

  const cur = parseYyyyMmDd(r.date);
  const windowStart = new Date(cur);
  windowStart.setUTCDate(windowStart.getUTCDate() - 3);
  const gameDates = new Set<string>();
  for (const p of priorPlayerResolved) {
    const d = parseYyyyMmDd(p.date);
    if (d >= windowStart && d <= cur) gameDates.add(p.date);
  }
  if (priorPlayerResolved.length > 0) {
    playerGamesInLast4CalendarDays = gameDates.size;
  }

  const oppAdj = getOppAdjustment(r.opponent ?? null, r.stat);
  const opponentDefRankForStat = oppAdj?.defRank ?? null;
  const opponentAbbrevResolved = oppAdj?.opponent ?? null;
  const opponentContextProvenance = oppAdj
    ? "opp_adjust_static_nba_rankings"
    : r.opponent
      ? "opp_adjust_no_mapping_or_stat"
      : "no_opponent_on_row";

  const openImpliedProb = r.openImpliedProb ?? r.impliedProb ?? null;
  const closeImpliedProb = r.closeImpliedProb ?? null;
  let impliedProbDeltaCloseMinusOpen: number | null = null;
  if (openImpliedProb != null && closeImpliedProb != null) {
    impliedProbDeltaCloseMinusOpen = closeImpliedProb - openImpliedProb;
  }

  const missingnessNotes: string[] = [];
  if (allHits.length < 5) missingnessNotes.push("formL5_insufficient_prior_games");
  if (allHits.length < 10) missingnessNotes.push("formL10_insufficient_prior_games");
  if (allHits.length < 20) missingnessNotes.push("formL20_insufficient_prior_games");
  if (!r.opponent) missingnessNotes.push("opponent_missing");
  if (openImpliedProb == null) missingnessNotes.push("open_implied_missing");

  const provenance: Record<string, string> = {
    source: "perf_tracker_jsonl",
    marketGroupKey: "stablePlayerId+stableMarketId_or_row_fields",
    rollingWindow: "prior_rows_same_market_group_chronological",
    opponentRank: opponentContextProvenance ?? "",
  };

  const rowKey = `${r.leg_id}|${r.date}`;

  return {
    schemaVersion: HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION,
    rowKey,
    legId: r.leg_id,
    date: r.date,
    gameStartTime: r.gameStartTime ?? null,
    platform: r.platform ?? null,
    player: r.player,
    stat: r.stat,
    statNormalized: statN,
    line: r.line,
    side: r.side ?? null,
    book: r.book ?? null,
    marketGroupKey: mgk,
    formPriorSampleSize: priorResolved.length,
    formL5HitRate,
    formL10HitRate,
    formL20HitRate,
    formL5ScrapeStatMean,
    formL10ScrapeStatMean,
    formL5HitVariance,
    formL10HitVariance,
    formL10HitTrendSlope,
    homeAway: r.homeAway ?? null,
    daysRest,
    isBackToBack,
    playerGamesInLast4CalendarDays,
    gameTotal,
    spread,
    opponentAbbrevResolved,
    opponentDefRankForStat,
    opponentContextProvenance,
    openImpliedProb,
    closeImpliedProb,
    impliedProbDeltaCloseMinusOpen,
    clvDelta: r.clvDelta ?? null,
    clvPct: r.clvPct ?? null,
    oddsBucket: r.oddsBucket ?? null,
    roleMinutesTrend: null,
    roleStabilityNote: "schema_only_no_minutes_series_in_repo",
    provenance,
    missingnessNotes,
  };
}

export function extractHistoricalFeaturesFromRows(
  rows: PerfTrackerRow[]
): HistoricalFeatureRow[] {
  const byMarket = new Map<string, PerfTrackerRow[]>();
  const byPlayer = new Map<string, PerfTrackerRow[]>();

  for (const r of rows) {
    if (!r.leg_id || !r.date) continue;
    const mk = marketGroupKey(r);
    const pk = playerChainKey(r);
    if (!byMarket.has(mk)) byMarket.set(mk, []);
    byMarket.get(mk)!.push(r);
    if (!byPlayer.has(pk)) byPlayer.set(pk, []);
    byPlayer.get(pk)!.push(r);
  }

  for (const [, arr] of byMarket) arr.sort(compareChronological);
  for (const [, arr] of byPlayer) arr.sort(compareChronological);

  const out: HistoricalFeatureRow[] = [];
  const sortedAll = [...rows].filter((r) => r.leg_id && r.date).sort(compareChronological);

  for (const r of sortedAll) {
    const mk = marketGroupKey(r);
    const pk = playerChainKey(r);
    const chain = byMarket.get(mk) ?? [];
    const idx = chain.findIndex((x) => x.leg_id === r.leg_id && x.date === r.date);
    const priorSameMarket = idx > 0 ? chain.slice(0, idx) : [];

    const pChain = byPlayer.get(pk) ?? [];
    const pIdx = pChain.findIndex((x) => x.leg_id === r.leg_id && x.date === r.date);
    const priorSamePlayer = pIdx > 0 ? pChain.slice(0, pIdx) : [];

    out.push(buildRow(r, priorSameMarket, priorSamePlayer));
  }

  return out;
}

function coverageFor(rows: HistoricalFeatureRow[], keys: (keyof HistoricalFeatureRow)[]): FeatureCoverageEntry[] {
  const n = rows.length || 1;
  return keys.map((field) => {
    let c = 0;
    for (const r of rows) {
      const v = r[field];
      if (v !== null && v !== undefined && v !== "") c++;
    }
    return { field: field as string, nonNullCount: c, fraction: c / n };
  });
}

const COVERAGE_KEYS: (keyof HistoricalFeatureRow)[] = [
  "formL5HitRate",
  "formL10HitRate",
  "formL20HitRate",
  "formL5ScrapeStatMean",
  "formL10HitTrendSlope",
  "daysRest",
  "gameTotal",
  "spread",
  "opponentDefRankForStat",
  "openImpliedProb",
  "closeImpliedProb",
  "clvDelta",
];

export function buildHistoricalFeatureRegistryPayload(options?: {
  cwd?: string;
  trackerPath?: string;
  jsonlRelativePath?: string;
  maxSampleRows?: number;
}): HistoricalFeatureRegistryPayload {
  const cwd = options?.cwd ?? process.cwd();
  const trackerPath = options?.trackerPath ?? path.join(cwd, "data", "perf_tracker.jsonl");
  const jsonlRel = options?.jsonlRelativePath ?? "artifacts/historical_feature_rows.jsonl";
  const maxSample = options?.maxSampleRows ?? 50;

  const rows: PerfTrackerRow[] = fs.existsSync(trackerPath)
    ? fs
        .readFileSync(trackerPath, "utf8")
        .split("\n")
        .map(parseTrackerLine)
        .filter((x): x is PerfTrackerRow => x != null)
    : readTrackerRows();

  const features = extractHistoricalFeaturesFromRows(rows);
  const marketGroups = new Set(features.map((f) => f.marketGroupKey)).size;

  const coverage = coverageFor(features, COVERAGE_KEYS);

  const missingnessByFamily: HistoricalFeatureRegistryPayload["missingnessByFamily"] = {
    recent_form: {
      fields: ["formL5HitRate", "formL10HitRate", "formL20HitRate", "formL10HitTrendSlope"],
      note: "Requires prior resolved rows (result 0/1) in same market group; early rows null.",
    },
    schedule: {
      fields: ["daysRest", "isBackToBack", "playerGamesInLast4CalendarDays", "homeAway", "gameTotal", "spread"],
      note: "daysRest needs prior game for player; homeAway/gameTotal/spread only when present on tracker row.",
    },
    opponent_context: {
      fields: ["opponentDefRankForStat"],
      note: "Static NBA table in opp_adjust; null if opponent missing or stat not mapped.",
    },
    market_context: {
      fields: ["openImpliedProb", "closeImpliedProb", "clvDelta"],
      note: "From tracker columns; older rows may lack close/CLV.",
    },
    role_stability: {
      fields: ["roleMinutesTrend"],
      note: "Placeholder only — no minutes feed wired.",
    },
  };

  const jsonlPath = path.join(cwd, jsonlRel);
  fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
  const jsonlBody =
    features.length === 0 ? "" : features.map((line) => JSON.stringify(line)).join("\n") + "\n";
  fs.writeFileSync(jsonlPath, jsonlBody, "utf8");

  return {
    schemaVersion: HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    sourcePath: trackerPath,
    rowCount: features.length,
    marketGroups,
    families: HISTORICAL_FEATURE_FAMILIES,
    coverage,
    missingnessByFamily,
    rowsSample: features.slice(0, maxSample),
    jsonlRelativePath: jsonlRel,
  };
}

export function writeHistoricalFeatureRegistryArtifacts(
  cwd: string,
  payload: HistoricalFeatureRegistryPayload
): void {
  const outDir = path.join(cwd, "data", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_historical_feature_registry.json");
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  const md = formatHistoricalFeatureRegistryMarkdown(payload);
  fs.writeFileSync(path.join(outDir, "latest_historical_feature_registry.md"), md, "utf8");
}

export function formatHistoricalFeatureRegistryMarkdown(p: HistoricalFeatureRegistryPayload): string {
  const lines: string[] = [
    "# Phase 80 — Historical feature registry (backtest)",
    "",
    `Generated: **${p.generatedAtUtc}**`,
    "",
    `- **Source:** \`${p.sourcePath}\``,
    `- **Rows:** ${p.rowCount} | **Market groups:** ${p.marketGroups}`,
    `- **JSONL:** \`${p.jsonlRelativePath}\` (full rows)`,
    "",
    "## Feature families",
    "",
  ];
  for (const [k, v] of Object.entries(p.families)) {
    lines.push(`- **${k}:** ${v}`, "");
  }
  lines.push("## Coverage (non-null fraction)", "", "| Field | Non-null | % |", "|---|---:|---:|");
  for (const c of p.coverage) {
    lines.push(`| ${c.field} | ${c.nonNullCount} | ${(c.fraction * 100).toFixed(1)}% |`);
  }
  lines.push("", "## Missingness by family", "");
  for (const [k, v] of Object.entries(p.missingnessByFamily)) {
    lines.push(`### ${k}`, "", v.note, "", `- Fields: ${v.fields.join(", ")}`, "");
  }
  lines.push("## Sample rows (truncated in JSON)", "", "```json", JSON.stringify(p.rowsSample.slice(0, 3), null, 2), "```", "");
  return lines.join("\n");
}
