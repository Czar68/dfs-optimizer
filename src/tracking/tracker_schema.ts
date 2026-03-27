/**
 * src/tracking/tracker_schema.ts
 * Schema and persistence for tracking generated cards and their win/loss results over time.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { CardEvResult } from "../types";
import { americanToImpliedProb } from "../odds_math";
import { deriveClvMetrics } from "./clv_math";
import { normalizeStatToken, stableMarketId, stablePlayerId } from "./id_normalization";

export type LegResult = "Pending" | "Win" | "Loss" | "Push";

/** Lightweight book snapshot at selection (Phase 16N). */
export interface SelectionMarketSnapshot {
  book: string;
  oddsAmerican: number | null;
  line: number;
  statNormalized: string;
  timestampIso: string;
}

export interface TrackedLeg {
  playerName: string;
  market: string;
  line: number;
  pick: "Over" | "Under";
  projectedProb: number;
  consensusOdds: number | null;
  result: LegResult;
  /** Merge key from optimizer leg (when present) for rollup dedupe */
  legKey?: string;
  /** Phase 16N: stable ids (deterministic hash) */
  playerId?: string;
  marketId?: string;
  /** Chosen-side American odds at selection (open line) */
  openOddsAmerican?: number;
  /** Vigged market implied prob from open odds (chosen side) */
  openImpliedProb?: number;
  /** Model true prob at selection (same as projectedProb; explicit for exports) */
  openProbModel?: number;
  /** Phase 16R: preserved raw vs calibrated model probabilities */
  rawProbModel?: number;
  calibratedProbModel?: number;
  probCalibrationApplied?: boolean;
  probCalibrationBucket?: string;
  /** Filled when closing line is captured; never fabricated */
  closeOddsAmerican?: number;
  closeImpliedProb?: number;
  clvDelta?: number;
  clvPct?: number;
  selectionSnapshot?: SelectionMarketSnapshot;
  gameStartTime?: string | null;
  team?: string | null;
  opponent?: string | null;
  /** Reserved when home/away can be derived from slate; often null */
  homeAway?: "home" | "away" | null;
}

export interface TrackedCard {
  cardId: string;
  platform: "PP" | "UD";
  flexType: string;
  /** Canonical payout key (e.g. UD_6F_FLX). Required for truthful UD payout vs PP slip codes. */
  structureId?: string;
  projectedEv: number;
  breakevenGap: number | undefined;
  /** Recommended stake ($) from Kelly at run time; optional for older files */
  kellyStakeUsd?: number;
  timestamp: string;
  legs: TrackedLeg[];
}

const TRACKING_DIR = path.join(process.cwd(), "data", "tracking");
const PENDING_FILE = path.join(TRACKING_DIR, "pending_cards.json");

type LegMetaFromCsv = { gameStartTime?: string; team?: string; opponent?: string };

function parseSimpleCsv(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i] ?? "";
    return row;
  });
}

function buildLegMetaIndex(): Map<string, LegMetaFromCsv> {
  const index = new Map<string, LegMetaFromCsv>();
  const candidates = [
    path.join(process.cwd(), "prizepicks-legs.csv"),
    path.join(process.cwd(), "underdog-legs.csv"),
    path.join(process.cwd(), "data", "output_logs", "prizepicks-legs.csv"),
    path.join(process.cwd(), "data", "output_logs", "underdog-legs.csv"),
  ];
  for (const p of candidates) {
    for (const r of parseSimpleCsv(p)) {
      const id = (r.id || "").trim();
      const legKey = (r.leg_key || "").trim();
      const gameTime = (r.gameTime || "").trim();
      const team = (r.team || "").trim();
      const meta: LegMetaFromCsv = {
        gameStartTime: gameTime || undefined,
        team: team || undefined,
      };
      if (id) index.set(`id:${id}`, meta);
      if (legKey) index.set(`leg:${legKey}`, meta);
    }
  }
  return index;
}

function stableCardId(card: CardEvResult): string {
  const legKeys = card.legs
    .map(({ pick, side }) => `${pick.player}|${pick.stat}|${pick.line}|${side}`)
    .sort()
    .join(";");
  const hash = crypto.createHash("sha256").update(legKeys + card.flexType).digest("hex").slice(0, 12);
  return hash;
}

function cardToTrackedLegs(card: CardEvResult, legMetaIndex?: Map<string, LegMetaFromCsv>): TrackedLeg[] {
  const ts = new Date().toISOString();
  return card.legs.map(({ pick, side }) => {
    const odds = side === "over" ? pick.overOdds : pick.underOdds;
    const openOddsAmerican = odds != null && Number.isFinite(odds) ? odds : undefined;
    const openImpliedProb =
      openOddsAmerican != null ? americanToImpliedProb(openOddsAmerican) : undefined;
    const league = pick.league || "NBA";
    const playerId = stablePlayerId(league, pick.player);
    const marketId = stableMarketId(league, pick.player, pick.stat, pick.line);
    const statNormalized = normalizeStatToken(String(pick.stat));
    const book = pick.book ?? "unknown";
    const clv = deriveClvMetrics(openImpliedProb, undefined);

    const metaById = pick.id ? legMetaIndex?.get(`id:${pick.id}`) : undefined;
    const metaByLeg = pick.legKey ? legMetaIndex?.get(`leg:${pick.legKey}`) : undefined;
    const meta = metaById ?? metaByLeg;
    return {
      playerName: pick.player,
      market: pick.stat,
      line: pick.line,
      pick: side === "over" ? "Over" : "Under",
      projectedProb: pick.trueProb,
      consensusOdds: odds ?? null,
      result: "Pending" as LegResult,
      legKey: pick.legKey,
      playerId,
      marketId,
      openOddsAmerican,
      openImpliedProb,
      openProbModel: pick.trueProb,
      rawProbModel: pick.rawTrueProb ?? pick.trueProb,
      calibratedProbModel: pick.calibratedTrueProb ?? pick.trueProb,
      probCalibrationApplied: pick.probCalibrationApplied ?? false,
      probCalibrationBucket: pick.probCalibrationBucket,
      closeOddsAmerican: undefined,
      closeImpliedProb: undefined,
      clvDelta: clv.clvDelta,
      clvPct: clv.clvPct,
      selectionSnapshot: {
        book,
        oddsAmerican: odds ?? null,
        line: pick.line,
        statNormalized,
        timestampIso: ts,
      },
      gameStartTime: pick.startTime ?? meta?.gameStartTime ?? undefined,
      team: pick.team ?? meta?.team ?? undefined,
      opponent: pick.opponent ?? meta?.opponent ?? undefined,
      homeAway: null,
    };
  });
}

function resolvePlatform(card: CardEvResult, fallback: "PP" | "UD"): "PP" | "UD" {
  if (card.site === "underdog") return "UD";
  if (card.site === "prizepicks") return "PP";
  return fallback;
}

/**
 * Top-N per side by card EV for combined PP+UD tracker rows (max total ≈ 2 * maxPerSide).
 */
export function mergeTopCardsForTracker(pp: CardEvResult[], ud: CardEvResult[], maxPerSide = 25): CardEvResult[] {
  const a = [...pp].sort((x, y) => y.cardEv - x.cardEv).slice(0, maxPerSide);
  const b = [...ud].sort((x, y) => y.cardEv - x.cardEv).slice(0, maxPerSide);
  return [...a, ...b];
}

/**
 * Saves the given cards to data/tracking/pending_cards.json for the web dashboard.
 * Overwrites the file with the latest run's cards (top cards only).
 * Platform per card comes from `card.site` when set; `options.platform` is only a fallback.
 */
export function saveCardsToTracker(cards: CardEvResult[], options?: { platform?: "PP" | "UD"; maxCards?: number }): void {
  const fallbackPlatform = options?.platform ?? "PP";
  const maxCards = options?.maxCards ?? 50;
  const toSave = cards.slice(0, maxCards);
  const legMetaIndex = buildLegMetaIndex();

  const tracked: TrackedCard[] = toSave.map((card) => ({
    cardId: stableCardId(card),
    platform: resolvePlatform(card, fallbackPlatform),
    flexType: card.flexType,
    structureId: card.structureId ?? card.flexType,
    projectedEv: card.cardEv,
    breakevenGap: card.breakevenGap,
    kellyStakeUsd: card.kellyResult?.recommendedStake,
    timestamp: new Date().toISOString(),
    legs: cardToTrackedLegs(card, legMetaIndex),
  }));

  const dir = path.dirname(PENDING_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PENDING_FILE, JSON.stringify({ timestamp: new Date().toISOString(), cards: tracked }, null, 2), "utf8");
  console.log(`[Tracker] Saved ${tracked.length} cards → ${path.basename(PENDING_FILE)}`);
}
