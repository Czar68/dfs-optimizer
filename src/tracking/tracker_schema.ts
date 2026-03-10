/**
 * src/tracking/tracker_schema.ts
 * Schema and persistence for tracking generated cards and their win/loss results over time.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { CardEvResult } from "../types";

export type LegResult = "Pending" | "Win" | "Loss" | "Push";

export interface TrackedLeg {
  playerName: string;
  market: string;
  line: number;
  pick: "Over" | "Under";
  projectedProb: number;
  consensusOdds: number | null;
  result: LegResult;
}

export interface TrackedCard {
  cardId: string;
  platform: "PP" | "UD";
  flexType: string;
  projectedEv: number;
  breakevenGap: number | undefined;
  timestamp: string;
  legs: TrackedLeg[];
}

const TRACKING_DIR = path.join(process.cwd(), "data", "tracking");
const PENDING_FILE = path.join(TRACKING_DIR, "pending_cards.json");

function stableCardId(card: CardEvResult): string {
  const legKeys = card.legs
    .map(({ pick, side }) => `${pick.player}|${pick.stat}|${pick.line}|${side}`)
    .sort()
    .join(";");
  const hash = crypto.createHash("sha256").update(legKeys + card.flexType).digest("hex").slice(0, 12);
  return hash;
}

function cardToTrackedLegs(card: CardEvResult): TrackedLeg[] {
  return card.legs.map(({ pick, side }) => {
    const odds = side === "over" ? pick.overOdds : pick.underOdds;
    return {
      playerName: pick.player,
      market: pick.stat,
      line: pick.line,
      pick: side === "over" ? "Over" : "Under",
      projectedProb: pick.trueProb,
      consensusOdds: odds ?? null,
      result: "Pending" as LegResult,
    };
  });
}

/**
 * Saves the given cards to data/tracking/pending_cards.json for the web dashboard.
 * Overwrites the file with the latest run's cards (top cards only).
 */
export function saveCardsToTracker(cards: CardEvResult[], options?: { platform?: "PP" | "UD"; maxCards?: number }): void {
  const platform = options?.platform ?? "PP";
  const maxCards = options?.maxCards ?? 50;
  const toSave = cards.slice(0, maxCards);

  const tracked: TrackedCard[] = toSave.map((card) => ({
    cardId: stableCardId(card),
    platform,
    flexType: card.flexType,
    projectedEv: card.cardEv,
    breakevenGap: card.breakevenGap,
    timestamp: new Date().toISOString(),
    legs: cardToTrackedLegs(card),
  }));

  const dir = path.dirname(PENDING_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PENDING_FILE, JSON.stringify({ timestamp: new Date().toISOString(), cards: tracked }, null, 2), "utf8");
  console.log(`[Tracker] Saved ${tracked.length} cards → ${path.basename(PENDING_FILE)}`);
}
