/**
 * CardBuilder service: consumes MergedProp[] and produces legs + cards CSVs
 * in the exact format expected by sheets_push_cards.py (23-column A–W mapping).
 *
 * - Maps MergedProp to EvPick (with gameTime from prop or raw).
 * - Groups legs into cards, computes CardEV, AvgEdge%, CardKelly$ via evaluateFlexCard.
 * - Writes legs CSV and cards CSV with headers unchanged so Python requires no schema changes.
 */

import * as fs from "fs";
import type { MergedProp } from "../types/unified-prop";
import type { CardEvResult, EvPick, FlexType, Sport } from "../types";
import type { StatCategory } from "../types";
import { evaluateFlexCard } from "../card_ev";
import { getBreakevenThreshold } from "../../math_models/breakeven_from_registry";
import { computeBestBetScore } from "../best_bets_score";
import { getSelectionEv } from "../constants/evSelectionUtils";

// ---- Headers: exact match to sheets_push_cards.py and current writeLegsCsv / writeCardsCsv ----

export const LEGS_CSV_HEADERS = [
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
  "gameTime",
  "IsWithin24h",
  "leg_key",
  "leg_label",
  "confidenceDelta",
];

/** Cards CSV: maps to 23-column sheet A–W; confidenceDelta at V index, CardKelly$ at W (formula in sheet). */
export const CARDS_CSV_HEADERS = [
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
  "bestBetScore",
  "bestBetTier",
  "confidenceDelta",
];

// ---- GameTime: extract from MergedProp or raw ----

const RAW_GAMETIME_KEYS = ["commenceTime", "startTime", "gameTime", "commence_time", "start_time"];

export function getGameTimeFromMergedProp(m: MergedProp): string {
  if (m.gameTime && String(m.gameTime).trim()) return String(m.gameTime).trim();
  const raw = m.raw as Record<string, unknown> | undefined;
  if (!raw) return "";
  for (const key of RAW_GAMETIME_KEYS) {
    const v = raw[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

// ---- MergedProp → EvPick (for card EV and legs CSV) ----

export function mergedPropsToEvPicks(
  merged: MergedProp[],
  defaultSport: Sport = "NBA"
): EvPick[] {
  return merged.map((m) => mergedPropToEvPick(m, defaultSport));
}

export function mergedPropToEvPick(m: MergedProp, defaultSport: Sport = "NBA"): EvPick {
  const gameTime = getGameTimeFromMergedProp(m);
  const site = m.provider === "PP" ? "prizepicks" : "underdog";
  const rawLegEv = (m as unknown as { legEv?: number }).legEv;
  const legEv = typeof rawLegEv === "number" ? rawLegEv : m.edge;
  return {
    id: m.id,
    sport: defaultSport,
    site,
    league: "NBA",
    player: m.player,
    team: null,
    opponent: null,
    stat: m.statType as StatCategory,
    line: m.lineValue,
    projectionId: m.id,
    gameId: null,
    startTime: gameTime || null,
    outcome: "over",
    trueProb: m.trueProb,
    fairOdds: 0,
    edge: m.edge,
    book: null,
    overOdds: m.odds.over,
    underOdds: m.odds.under,
    legEv,
    isNonStandardOdds: false,
    scoringWeight: 1.0,
    udPickFactor: null,
    legKey: m.id,
    legLabel: `${m.player} ${String(m.statType)} ${m.lineValue}`,
    confidenceDelta: m.confidenceDelta,
  };
}

// ---- Card building: group MergedProp into cards, compute CardEV / AvgEdge% / Kelly ----

const SLIP_BUILD_SPEC: { size: number; flexType: FlexType }[] = [
  { size: 5, flexType: "5F" },
  { size: 6, flexType: "6F" },
  { size: 5, flexType: "5P" },
  { size: 6, flexType: "6P" },
  { size: 4, flexType: "4F" },
  { size: 4, flexType: "4P" },
  { size: 3, flexType: "3F" },
  { size: 3, flexType: "3P" },
  { size: 2, flexType: "2P" },
];

const MIN_LEG_EV_BY_FLEX: Record<string, number> = {
  "2P": 0.020,
  "3P": 0.017,
  "3F": 0.017,
  "4P": 0.015,
  "4F": 0.015,
  "5P": 0.013,
  "5F": 0.013,
  "6P": 0.012,
  "6F": 0.012,
};

const MAX_CARD_BUILD_ATTEMPTS = 2000;
const MAX_LEGS_POOL = 30;

export interface CardBuilderOptions {
  defaultSport?: Sport;
  minCardEv?: number;
  maxCardsPerFlexType?: number;
}

function expectedLegCountForFlexType(flexType: FlexType): number {
  const n = parseInt(flexType.replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 2 && n <= 8 ? n : 0;
}

const PP_STAT_ABBREV: Record<string, string> = {
  points: "PTS",
  rebounds: "REB",
  assists: "AST",
  threes: "3PM",
  steals: "STL",
  blocks: "BLK",
  fantasy_points: "FP",
  pra: "PRA",
  "pts+reb+ast": "PRA",
  points_rebounds_assists: "PRA",
  "pts+ast": "PA",
  "pts+reb": "PR",
  "reb+ast": "RA",
  turnovers: "TO",
  stocks: "STK",
};

function formatLegPlayerPropLine(leg: { pick: EvPick }): string {
  const p = leg.pick;
  const abbr =
    PP_STAT_ABBREV[p.stat?.toLowerCase() ?? ""] ??
    p.stat?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ??
    "";
  return `${p.player} ${abbr} o${p.line}`;
}

export async function buildCardsFromMergedProps(
  merged: MergedProp[],
  options: CardBuilderOptions = {}
): Promise<CardEvResult[]> {
  const { defaultSport = "NBA", minCardEv = 0.008, maxCardsPerFlexType = 50 } = options;
  const evPicks = mergedPropsToEvPicks(merged, defaultSport);
  const sortedByEdge = [...evPicks].filter((l) => l.edge > 0).sort((a, b) => b.edge - a.edge);
  const pool = sortedByEdge.slice(0, MAX_LEGS_POOL);

  const allCards: CardEvResult[] = [];
  const maxLegEv = pool.length > 0 ? Math.max(...pool.map((l) => getSelectionEv(l))) : 0;

  for (const { size, flexType } of SLIP_BUILD_SPEC) {
    const requiredLegEv = MIN_LEG_EV_BY_FLEX[flexType];
    if (maxLegEv < requiredLegEv) continue;

    const structureBE = getBreakevenThreshold(flexType);
    const minEdge = 0.015;
    const candidates: EvPick[] = pool.filter(
      (leg) => leg.trueProb >= structureBE + minEdge
    );
    const bestByKey = new Map<string, CardEvResult>();
    let attempts = 0;

    while (attempts < MAX_CARD_BUILD_ATTEMPTS && bestByKey.size < maxCardsPerFlexType) {
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      const chosen: EvPick[] = [];
      const usedPlayers = new Set<string>();

      for (const leg of shuffled) {
        if (chosen.length >= size) break;
        if (usedPlayers.has(leg.player)) continue;
        chosen.push(leg);
        usedPlayers.add(leg.player);
      }

      if (chosen.length !== size) {
        attempts++;
        continue;
      }

      const cardLegs = chosen.map((pick) => ({ pick, side: "over" as const }));
      const result = await evaluateFlexCard(flexType, cardLegs, 1);
      attempts++;

      if (!result || !Number.isFinite(result.cardEv)) continue;
      if (result.cardEv < (MIN_LEG_EV_BY_FLEX[flexType] ?? minCardEv)) continue;

      const key = result.legs
        .map((l) => l.pick.id)
        .slice()
        .sort()
        .join("|");
      const existing = bestByKey.get(key);
      if (!existing || result.cardEv > existing.cardEv) {
        bestByKey.set(key, result);
      }
    }

    const flexCards = [...bestByKey.values()].sort((a, b) => b.cardEv - a.cardEv);
    allCards.push(...flexCards);
  }

  return allCards.sort((a, b) => b.cardEv - a.cardEv);
}

// ---- CSV export (exact header structure for sheets_push_cards.py) ----

function escapeCsvLeg(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  return s.includes(",") ? s.replace(/,/g, ";") : s;
}

function escapeCsvCard(value: unknown): string {
  if (value == null || value === undefined) return "";
  const s = String(value);
  return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeLegsCsv(
  legs: EvPick[],
  outPath: string,
  runTimestamp: string
): void {
  const runDate = new Date();
  const lines: string[] = [LEGS_CSV_HEADERS.join(",")];

  for (const leg of legs) {
    let gameTime = "";
    let isWithin24h = "";
    if (leg.startTime) {
      gameTime = leg.startTime;
      const start = new Date(leg.startTime);
      const diffHours = (start.getTime() - runDate.getTime()) / (1000 * 60 * 60);
      isWithin24h = diffHours >= 0 && diffHours <= 24 ? "TRUE" : "FALSE";
    }

    const row = [
      leg.sport,
      leg.id,
      leg.player,
      leg.team ?? "",
      leg.stat,
      leg.line,
      leg.league ?? "",
      leg.book ?? "",
      leg.overOdds ?? "",
      leg.underOdds ?? "",
      leg.trueProb,
      leg.edge,
      leg.legEv,
      runTimestamp,
      gameTime,
      isWithin24h,
      leg.legKey ?? "",
      leg.legLabel ?? "",
      leg.confidenceDelta != null && Number.isFinite(leg.confidenceDelta) ? leg.confidenceDelta : "",
    ].map(escapeCsvLeg);

    lines.push(row.join(","));
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

export function writeCardsCsv(
  cards: CardEvResult[],
  outPath: string,
  runTimestamp: string
): void {
  const lines: string[] = [CARDS_CSV_HEADERS.join(",")];

  for (const card of cards) {
    const expectedLegs = expectedLegCountForFlexType(card.flexType);
    if (expectedLegs > 0 && card.legs.length !== expectedLegs) continue;

    const legIds = card.legs.map((l) => l.pick.id);
    const sport = card.legs.length > 0 ? card.legs[0].pick.sport : "NBA";
    const siteLeg = `pp-${card.flexType.toLowerCase()}`;
    const playerPropLine = card.legs.map(formatLegPlayerPropLine).join(" | ");
    const kr = card.kellyResult;

    const bb = computeBestBetScore({
      cardEv: card.cardEv,
      avgEdgePct: card.avgEdgePct,
      winProbCash: card.winProbCash,
      legCount: card.legs.length,
      sport,
    });

    const breakevenGap =
      card.breakevenGap ?? card.avgProb - getBreakevenThreshold(card.flexType);

    const cardConfidenceDelta =
      card.legs.length > 0
        ? (() => {
            const deltas = card.legs
              .map((l) => l.pick.confidenceDelta)
              .filter((d): d is number => d != null && Number.isFinite(d));
            if (deltas.length === 0) return "";
            return deltas.reduce((a, b) => a + b, 0) / deltas.length;
          })()
        : "";

    const row = [
      sport,
      "PP",
      card.flexType,
      siteLeg,
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
      runTimestamp,
      bb.score,
      bb.tier,
      cardConfidenceDelta,
    ].map(escapeCsvCard);

    lines.push(row.join(","));
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

/**
 * One-shot: build cards from MergedProp[], write legs and cards CSVs.
 * Output paths must be under the same directory Python uses (e.g. OUTPUT_DIR).
 */
export async function buildAndExportFromMergedProps(
  merged: MergedProp[],
  legsCsvPath: string,
  cardsCsvPath: string,
  runTimestamp: string,
  options: CardBuilderOptions = {}
): Promise<{ legs: EvPick[]; cards: CardEvResult[] }> {
  const evPicks = mergedPropsToEvPicks(merged, options.defaultSport ?? "NBA");
  writeLegsCsv(evPicks, legsCsvPath, runTimestamp);

  const cards = await buildCardsFromMergedProps(merged, options);
  writeCardsCsv(cards, cardsCsvPath, runTimestamp);

  return { legs: evPicks, cards };
}
