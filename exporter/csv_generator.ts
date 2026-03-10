/**
 * exporter/csv_generator.ts
 *
 * Standardized CSV output for PrizePicks and Underdog bulk uploaders.
 * All EV, Kelly, and win-probability values consumed from math_models
 * (locked-down canonical source). This module only formats and writes;
 * it NEVER computes or tweaks mathematical values.
 */

import fs from "fs";
import path from "path";

import type { CardEvResult, EvPick, FlexType, Sport } from "../src/types";
import { computeWinProbs } from "../math_models/win_probabilities";
import { calculateKellyStake } from "../math_models/kelly_staking";
import { probToAmerican } from "../math_models/breakeven_binomial";
import { getBreakevenThreshold } from "../math_models/breakeven_from_registry";

// ---------------------------------------------------------------------------
// CSV primitives
// ---------------------------------------------------------------------------

function escapeCsv(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function writeCsvFile(
  filePath: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const dir = path.dirname(filePath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsv).join(","));
  fs.writeFileSync(filePath, [headerLine, ...dataLines].join("\n"), "utf8");
  console.log(`[csv_generator] Wrote ${rows.length} rows → ${path.basename(filePath)}`);
}

// ---------------------------------------------------------------------------
// Eastern-time ISO string (matches optimizer run timestamp format)
// ---------------------------------------------------------------------------

function toEasternIso(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = fmt
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second} ET`;
}

// ---------------------------------------------------------------------------
// Leg display helpers
// ---------------------------------------------------------------------------

function formatLegLabel(leg: { pick: EvPick; side: "over" | "under" }): string {
  const p = leg.pick;
  return `${p.player} ${p.stat} ${leg.side === "over" ? "O" : "U"} ${p.line}`;
}

function legId(pick: EvPick): string {
  return pick.id ?? `${pick.player}-${pick.stat}-${pick.line}`;
}

// ---------------------------------------------------------------------------
// PrizePicks Cards CSV
// ---------------------------------------------------------------------------

export interface PPCardsCsvOptions {
  outPath: string;
  cards: CardEvResult[];
  runTimestamp?: string;
}

const PP_CARDS_HEADERS = [
  "Sport",
  "site",
  "flexType",
  "Site-Leg",
  "Player-Prop-Line",
  "cardEv",
  "winProbCash",
  "winProbAny",
  "avgProb",
  "avgEdgePct",
  "breakevenGap",
  "leg1Id",
  "leg2Id",
  "leg3Id",
  "leg4Id",
  "leg5Id",
  "leg6Id",
  "kellyRawFraction",
  "kellyCappedFraction",
  "kellyFinalFraction",
  "kellyStake",
  "kellyRiskAdjustment",
  "efficiencyScore",
  "portfolioRank",
  "runTimestamp",
];

export function writePPCardsCsv(opts: PPCardsCsvOptions): void {
  const ts = opts.runTimestamp ?? toEasternIso();
  const rows: (string | number | null | undefined)[][] = [];

  for (const card of opts.cards) {
    const sport = card.legs[0]?.pick?.sport ?? "NBA";
    const legIds = card.legs.map((l) => legId(l.pick));
    const playerPropLine = card.legs.map(formatLegLabel).join(" | ");
    const kr = card.kellyResult;
    const breakevenGap =
      card.breakevenGap ?? (card.avgProb - getBreakevenThreshold(card.flexType));

    rows.push([
      sport,
      "PP",
      card.flexType,
      `pp-${card.flexType.toLowerCase()}`,
      playerPropLine,
      card.cardEv,
      card.winProbCash,
      card.winProbAny,
      card.avgProb,
      card.avgEdgePct,
      breakevenGap,
      legIds[0] ?? "",
      legIds[1] ?? "",
      legIds[2] ?? "",
      legIds[3] ?? "",
      legIds[4] ?? "",
      legIds[5] ?? "",
      kr?.rawKellyFraction ?? "",
      kr?.cappedKellyFraction ?? "",
      kr?.finalKellyFraction ?? "",
      kr?.recommendedStake ?? "",
      kr?.riskAdjustment ?? "",
      card.efficiencyScore ?? "",
      card.portfolioRank ?? "",
      ts,
    ]);
  }

  writeCsvFile(opts.outPath, PP_CARDS_HEADERS, rows);
}

// ---------------------------------------------------------------------------
// PrizePicks Legs CSV
// ---------------------------------------------------------------------------

export interface PPLegsCsvOptions {
  outPath: string;
  legs: EvPick[];
  runTimestamp?: string;
}

const PP_LEGS_HEADERS = [
  "Sport",
  "id",
  "player",
  "team",
  "stat",
  "line",
  "league",
  "book",
  "overOdds",
  "underOdds",
  "trueProb",
  "edge",
  "legEv",
  "runTimestamp",
  "startTime",
  "legKey",
  "legLabel",
];

export function writePPLegsCsv(opts: PPLegsCsvOptions): void {
  const ts = opts.runTimestamp ?? toEasternIso();
  const rows: (string | number | null | undefined)[][] = opts.legs.map((p) => [
    p.sport,
    p.id,
    p.player,
    p.team ?? "",
    p.stat,
    p.line,
    p.league,
    p.book ?? "",
    p.overOdds ?? "",
    p.underOdds ?? "",
    p.trueProb,
    p.edge,
    p.legEv,
    ts,
    p.startTime ?? "",
    p.legKey ?? "",
    p.legLabel ?? "",
  ]);
  writeCsvFile(opts.outPath, PP_LEGS_HEADERS, rows);
}

// ---------------------------------------------------------------------------
// Underdog Cards CSV
// ---------------------------------------------------------------------------

export interface UDCardsCsvOptions {
  outPath: string;
  cards: CardEvResult[];
  runTimestamp?: string;
}

const UD_CARDS_HEADERS = [
  "Sport",
  "site",
  "structureId",
  "Player-Prop-Line",
  "cardEv",
  "winProbCash",
  "winProbAny",
  "avgProb",
  "avgEdgePct",
  "breakevenGap",
  "leg1Id",
  "leg2Id",
  "leg3Id",
  "leg4Id",
  "leg5Id",
  "leg6Id",
  "leg7Id",
  "leg8Id",
  "kellyRawFraction",
  "kellyCappedFraction",
  "kellyFinalFraction",
  "kellyStake",
  "kellyRiskAdjustment",
  "efficiencyScore",
  "portfolioRank",
  "runTimestamp",
];

export function writeUDCardsCsv(opts: UDCardsCsvOptions): void {
  const ts = opts.runTimestamp ?? toEasternIso();
  const rows: (string | number | null | undefined)[][] = [];

  for (const card of opts.cards) {
    const sport = card.legs[0]?.pick?.sport ?? "NBA";
    const legIds = card.legs.map((l) => legId(l.pick));
    const playerPropLine = card.legs.map(formatLegLabel).join(" | ");
    const kr = card.kellyResult;
    const breakevenGap =
      card.breakevenGap ?? (card.avgProb - getBreakevenThreshold(card.flexType));

    rows.push([
      sport,
      "UD",
      card.flexType,
      playerPropLine,
      card.cardEv,
      card.winProbCash,
      card.winProbAny,
      card.avgProb,
      card.avgEdgePct,
      breakevenGap,
      legIds[0] ?? "",
      legIds[1] ?? "",
      legIds[2] ?? "",
      legIds[3] ?? "",
      legIds[4] ?? "",
      legIds[5] ?? "",
      legIds[6] ?? "",
      legIds[7] ?? "",
      kr?.rawKellyFraction ?? "",
      kr?.cappedKellyFraction ?? "",
      kr?.finalKellyFraction ?? "",
      kr?.recommendedStake ?? "",
      kr?.riskAdjustment ?? "",
      card.efficiencyScore ?? "",
      card.portfolioRank ?? "",
      ts,
    ]);
  }

  writeCsvFile(opts.outPath, UD_CARDS_HEADERS, rows);
}

// ---------------------------------------------------------------------------
// Underdog Legs CSV
// ---------------------------------------------------------------------------

export interface UDLegsCsvOptions {
  outPath: string;
  legs: EvPick[];
  runTimestamp?: string;
}

const UD_LEGS_HEADERS = [
  "Sport",
  "id",
  "player",
  "team",
  "stat",
  "line",
  "league",
  "book",
  "overOdds",
  "underOdds",
  "trueProb",
  "edge",
  "legEv",
  "runTimestamp",
  "startTime",
  "isNonStandardOdds",
  "legKey",
  "legLabel",
];

export function writeUDLegsCsv(opts: UDLegsCsvOptions): void {
  const ts = opts.runTimestamp ?? toEasternIso();
  const rows: (string | number | null | undefined)[][] = opts.legs.map((p) => [
    p.sport,
    p.id,
    p.player,
    p.team ?? "",
    p.stat,
    p.line,
    p.league,
    p.book ?? "",
    p.overOdds ?? "",
    p.underOdds ?? "",
    p.trueProb,
    p.edge,
    p.legEv,
    ts,
    p.startTime ?? "",
    p.isNonStandardOdds ? "TRUE" : "FALSE",
    p.legKey ?? "",
    p.legLabel ?? "",
  ]);
  writeCsvFile(opts.outPath, UD_LEGS_HEADERS, rows);
}

// ---------------------------------------------------------------------------
// Unified picks export (both platforms, single file)
// ---------------------------------------------------------------------------

export interface UnifiedPicksCsvOptions {
  outPath: string;
  ppCards?: CardEvResult[];
  udCards?: CardEvResult[];
  runTimestamp?: string;
}

const UNIFIED_HEADERS = [
  "platform",
  "sport",
  "structure",
  "cardEv",
  "kellyStake",
  "winProbCash",
  "avgProb",
  "avgEdgePct",
  "legs",
  "runTimestamp",
];

export function writeUnifiedPicksCsv(opts: UnifiedPicksCsvOptions): void {
  const ts = opts.runTimestamp ?? toEasternIso();
  const rows: (string | number | null | undefined)[][] = [];

  for (const card of opts.ppCards ?? []) {
    const sport = card.legs[0]?.pick?.sport ?? "NBA";
    const legsStr = card.legs.map(formatLegLabel).join(" | ");
    const stake = calculateKellyStake(card.cardEv, 600, sport);

    rows.push([
      "PP",
      sport,
      card.flexType,
      card.cardEv,
      stake,
      card.winProbCash,
      card.avgProb,
      card.avgEdgePct,
      legsStr,
      ts,
    ]);
  }

  for (const card of opts.udCards ?? []) {
    const sport = card.legs[0]?.pick?.sport ?? "NBA";
    const legsStr = card.legs.map(formatLegLabel).join(" | ");
    const stake = calculateKellyStake(card.cardEv, 600, sport);

    rows.push([
      "UD",
      sport,
      card.flexType,
      card.cardEv,
      stake,
      card.winProbCash,
      card.avgProb,
      card.avgEdgePct,
      legsStr,
      ts,
    ]);
  }

  writeCsvFile(opts.outPath, UNIFIED_HEADERS, rows);
}
