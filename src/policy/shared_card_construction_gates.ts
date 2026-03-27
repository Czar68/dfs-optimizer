/**
 * Phase 17O — Site-invariant structural card construction gates (PP + UD).
 * EV/breakeven/payout evaluation stays in site evaluators; this module is layout / conflict / dedupe only.
 */

import type { CardEvResult, EvPick } from "../types";

/** Explicit shared gate order (identical semantics for PP and UD candidate legs). */
export const SHARED_CARD_CONSTRUCTION_GATE_ORDER = [
  "unique_players_per_card",
  "opposite_side_same_underlying_market",
  "team_and_game_density_limits",
] as const;

export const CARD_GATE_PASS = "CARD_GATE_PASS" as const;
export const CARD_GATE_FAIL_UNIQUE_PLAYERS = "CARD_GATE_UNIQUE_PLAYERS" as const;
export const CARD_GATE_FAIL_OPPOSITE_SAME_MARKET = "CARD_GATE_OPPOSITE_SAME_MARKET" as const;
export const CARD_GATE_FAIL_TEAM_GAME_LIMITS = "CARD_GATE_TEAM_GAME_LIMITS" as const;

export type CardConstructionGateCode =
  | typeof CARD_GATE_PASS
  | typeof CARD_GATE_FAIL_UNIQUE_PLAYERS
  | typeof CARD_GATE_FAIL_OPPOSITE_SAME_MARKET
  | typeof CARD_GATE_FAIL_TEAM_GAME_LIMITS;

/** Canonical density caps (historically PP `buildCardsForSize`; now shared with UD k-combos). */
export const MAX_LEGS_PER_TEAM_PER_CARD = 3 as const;
export const MAX_LEGS_PER_GAME_PER_CARD = 4 as const;

export function getGameKeyForCardGate(leg: EvPick): string {
  const t = leg.team ?? "";
  const o = leg.opponent ?? "";
  return [t, o].sort().join("_vs_");
}

/** Team + per-game density limits (same helper PP used for prospective legs). */
export function isCardWithinTeamAndGameDensityLimits(
  legs: EvPick[],
  limits?: { maxLegsPerTeamPerCard: number; maxLegsPerGamePerCard: number }
): boolean {
  const maxTeam = limits?.maxLegsPerTeamPerCard ?? MAX_LEGS_PER_TEAM_PER_CARD;
  const maxGame = limits?.maxLegsPerGamePerCard ?? MAX_LEGS_PER_GAME_PER_CARD;
  const teamCounts = new Map<string, number>();
  const gameCounts = new Map<string, number>();

  for (const leg of legs) {
    const team = leg.team ?? "";
    const gameKey = getGameKeyForCardGate(leg);

    if (team) {
      const c = teamCounts.get(team) ?? 0;
      if (c + 1 > maxTeam) return false;
      teamCounts.set(team, c + 1);
    }

    if (gameKey) {
      const g = gameCounts.get(gameKey) ?? 0;
      if (g + 1 > maxGame) return false;
      gameCounts.set(gameKey, g + 1);
    }
  }

  return true;
}

/** @deprecated Use {@link isCardWithinTeamAndGameDensityLimits} — kept for grep compatibility. */
export const isCardWithinCorrelationLimits = isCardWithinTeamAndGameDensityLimits;

export function passesUniquePlayersPerCard(legs: EvPick[]): boolean {
  const players = legs.map((l) => l.player);
  return new Set(players).size === players.length;
}

/**
 * Same player + same stat + same line with both over and under (invalid same-underlying book conflict).
 * With one leg per player, this normally cannot trigger; kept for explicit parity and defensive checks.
 */
export function hasOppositeSideSameUnderlyingMarket(legs: EvPick[]): boolean {
  const keyToSides = new Map<string, Set<EvPick["outcome"]>>();
  for (const leg of legs) {
    const k = `${leg.player}\u0000${String(leg.stat)}\u0000${leg.line}`;
    if (!keyToSides.has(k)) keyToSides.set(k, new Set());
    keyToSides.get(k)!.add(leg.outcome);
  }
  for (const sides of keyToSides.values()) {
    if (sides.has("over") && sides.has("under")) return true;
  }
  return false;
}

/**
 * Single pass through SHARED_CARD_CONSTRUCTION_GATE_ORDER; returns first failure or PASS.
 */
export function firstCardConstructionGateFailure(legs: EvPick[]): CardConstructionGateCode {
  if (!passesUniquePlayersPerCard(legs)) return CARD_GATE_FAIL_UNIQUE_PLAYERS;
  if (hasOppositeSideSameUnderlyingMarket(legs)) return CARD_GATE_FAIL_OPPOSITE_SAME_MARKET;
  if (!isCardWithinTeamAndGameDensityLimits(legs)) return CARD_GATE_FAIL_TEAM_GAME_LIMITS;
  return CARD_GATE_PASS;
}

export function prospectiveLegsPassStructuralGates(legs: EvPick[]): boolean {
  return firstCardConstructionGateFailure(legs) === CARD_GATE_PASS;
}

/** Stable unordered key from leg pick ids (matches legacy PP `buildCardsForSize` dedupe). */
export function constructionLegSetKeyFromPickIds(legIds: string[]): string {
  return [...legIds].sort().join("|");
}

export function constructionLegSetKeyFromCard(card: CardEvResult): string {
  return constructionLegSetKeyFromPickIds(card.legs.map((l) => l.pick.id));
}

/**
 * After candidate generation: keep best `cardEv` per unordered leg-id set (legacy PP behavior).
 */
export function dedupeCardCandidatesByLegIdSetBestCardEv(candidates: CardEvResult[]): CardEvResult[] {
  const bestByKey = new Map<string, CardEvResult>();
  for (const c of candidates) {
    const key = constructionLegSetKeyFromCard(c);
    const existing = bestByKey.get(key);
    if (!existing || c.cardEv > existing.cardEv) {
      bestByKey.set(key, c);
    }
  }
  return [...bestByKey.values()].sort((a, b) => b.cardEv - a.cardEv);
}

/**
 * UD wraps cards with `format` (structure id). Same leg-set may appear from different structures — keep higher EV.
 */
export function dedupeFormatCardEntriesByLegSetBestCardEv(
  entries: { format: string; card: CardEvResult }[]
): { format: string; card: CardEvResult }[] {
  const best = new Map<string, { format: string; card: CardEvResult }>();
  for (const e of entries) {
    const k = constructionLegSetKeyFromCard(e.card);
    const prev = best.get(k);
    if (!prev || e.card.cardEv > prev.card.cardEv) {
      best.set(k, e);
    }
  }
  return [...best.values()];
}
