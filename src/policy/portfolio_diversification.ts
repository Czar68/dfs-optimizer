/**
 * Phase 77 — Post-candidate portfolio diversification (export layer only).
 * Does not modify per-card EV math; greedy selection uses raw `cardEv` minus soft exposure penalties,
 * with explicit hard guardrails. Card objects keep evaluator `cardEv`; diversification metadata is attached.
 */

import type { CardEvResult, EvPick, PortfolioDiversificationCardMeta } from "../types";

export const PORTFOLIO_DIVERSIFICATION_SCHEMA_VERSION = 1 as const;

/** Single source of truth for Phase 77 policy defaults (conservative). */
export const DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY = {
  /** Soft penalty weight × current portfolio count for that exact leg key (before adding). */
  penaltyPerLegExposure: 0.012,
  penaltyPerPlayerLegSlot: 0.004,
  penaltyPerPlayerStatExposure: 0.006,
  penaltyPerGameLegExposure: 0.003,
  /** Applied to max pairwise shared legs vs any already-selected card. */
  penaltyPerSharedLegWithSelected: 0.025,
  /** Hard: refuse export if leg key would appear more than this many times across the portfolio. */
  maxLegOccurrencesHard: 3,
  /** Hard: refuse if total leg slots for a player would exceed this (sum across portfolio). */
  maxPlayerLegSlotsHard: 14,
  /** Hard: refuse if shared legs with any single already-selected card exceed this. */
  maxPairwiseSharedLegsHard: 4,
} as const;

export type PortfolioDiversificationPolicy = {
  penaltyPerLegExposure: number;
  penaltyPerPlayerLegSlot: number;
  penaltyPerPlayerStatExposure: number;
  penaltyPerGameLegExposure: number;
  penaltyPerSharedLegWithSelected: number;
  maxLegOccurrencesHard: number;
  maxPlayerLegSlotsHard: number;
  maxPairwiseSharedLegsHard: number;
};

export type PortfolioDiversificationBreakdown = {
  penaltyTotal: number;
  legPenalty: number;
  playerPenalty: number;
  playerStatPenalty: number;
  gamePenalty: number;
  overlapPenalty: number;
};

function normPlayer(p: string): string {
  return p.trim().toLowerCase();
}

/** Stable exact-leg key for exposure (merge key when present). */
export function canonicalLegKey(pick: EvPick, side: "over" | "under"): string {
  if (pick.legKey && pick.legKey.length > 0) return pick.legKey;
  return `${pick.site}:${pick.id}:${side}`;
}

function playerStatKey(pick: EvPick): string {
  return `${normPlayer(pick.player)}|${pick.stat}`;
}

function gameClusterKey(pick: EvPick): string {
  if (pick.gameId && pick.gameId.length > 0) return `gid:${pick.gameId}`;
  const t = (pick.team ?? "").trim().toLowerCase();
  const o = (pick.opponent ?? "").trim().toLowerCase();
  return `teams:${t}|${o}`;
}

function legKeysForCard(card: CardEvResult): string[] {
  return card.legs.map((l) => canonicalLegKey(l.pick, l.side));
}

/** Stable identity for matching diversified output back to UD `{ format, card }` rows. */
export function cardIdentityKey(card: CardEvResult): string {
  const ids = card.legs.map((l) => l.pick.id).slice().sort().join("|");
  return `${card.flexType}|${ids}`;
}

function playerLegCountsForCard(card: CardEvResult): Map<string, number> {
  const m = new Map<string, number>();
  for (const { pick } of card.legs) {
    const k = normPlayer(pick.player);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function computeSoftPenalty(
  card: CardEvResult,
  policy: PortfolioDiversificationPolicy,
  state: {
    legCounts: Map<string, number>;
    playerLegSlots: Map<string, number>;
    playerStatCounts: Map<string, number>;
    gameLegCounts: Map<string, number>;
    selected: CardEvResult[];
  }
): PortfolioDiversificationBreakdown {
  let legPenalty = 0;
  let playerPenalty = 0;
  let playerStatPenalty = 0;
  let gamePenalty = 0;
  let overlapPenalty = 0;

  for (const { pick, side } of card.legs) {
    const lk = canonicalLegKey(pick, side);
    legPenalty += policy.penaltyPerLegExposure * (state.legCounts.get(lk) ?? 0);
    const pk = normPlayer(pick.player);
    playerPenalty += policy.penaltyPerPlayerLegSlot * (state.playerLegSlots.get(pk) ?? 0);
    const psk = playerStatKey(pick);
    playerStatPenalty += policy.penaltyPerPlayerStatExposure * (state.playerStatCounts.get(psk) ?? 0);
    const gk = gameClusterKey(pick);
    gamePenalty += policy.penaltyPerGameLegExposure * (state.gameLegCounts.get(gk) ?? 0);
  }

  const keys = new Set(legKeysForCard(card));
  let maxShare = 0;
  for (const s of state.selected) {
    const other = new Set(legKeysForCard(s));
    let shared = 0;
    for (const k of keys) {
      if (other.has(k)) shared++;
    }
    if (shared > maxShare) maxShare = shared;
  }
  overlapPenalty = policy.penaltyPerSharedLegWithSelected * maxShare;

  const penaltyTotal = legPenalty + playerPenalty + playerStatPenalty + gamePenalty + overlapPenalty;
  return {
    penaltyTotal,
    legPenalty,
    playerPenalty,
    playerStatPenalty,
    gamePenalty,
    overlapPenalty,
  };
}

export function hardViolatesPortfolioConstraints(
  card: CardEvResult,
  policy: PortfolioDiversificationPolicy,
  state: {
    legCounts: Map<string, number>;
    playerLegSlots: Map<string, number>;
    selected: CardEvResult[];
  }
): boolean {
  for (const { pick, side } of card.legs) {
    const lk = canonicalLegKey(pick, side);
    if ((state.legCounts.get(lk) ?? 0) + 1 > policy.maxLegOccurrencesHard) return true;
  }
  const candPlayerCounts = playerLegCountsForCard(card);
  for (const [player, add] of candPlayerCounts) {
    if ((state.playerLegSlots.get(player) ?? 0) + add > policy.maxPlayerLegSlotsHard) return true;
  }
  const keys = new Set(legKeysForCard(card));
  for (const s of state.selected) {
    const other = new Set(legKeysForCard(s));
    let shared = 0;
    for (const k of keys) {
      if (other.has(k)) shared++;
    }
    if (shared > policy.maxPairwiseSharedLegsHard) return true;
  }
  return false;
}

function applyCardToState(card: CardEvResult, state: {
  legCounts: Map<string, number>;
  playerLegSlots: Map<string, number>;
  playerStatCounts: Map<string, number>;
  gameLegCounts: Map<string, number>;
  selected: CardEvResult[];
}): void {
  for (const { pick, side } of card.legs) {
    const lk = canonicalLegKey(pick, side);
    state.legCounts.set(lk, (state.legCounts.get(lk) ?? 0) + 1);
    const pk = normPlayer(pick.player);
    state.playerLegSlots.set(pk, (state.playerLegSlots.get(pk) ?? 0) + 1);
    const psk = playerStatKey(pick);
    state.playerStatCounts.set(psk, (state.playerStatCounts.get(psk) ?? 0) + 1);
    const gk = gameClusterKey(pick);
    state.gameLegCounts.set(gk, (state.gameLegCounts.get(gk) ?? 0) + 1);
  }
  state.selected.push(card);
}

function emptyState(): {
  legCounts: Map<string, number>;
  playerLegSlots: Map<string, number>;
  playerStatCounts: Map<string, number>;
  gameLegCounts: Map<string, number>;
  selected: CardEvResult[];
} {
  return {
    legCounts: new Map(),
    playerLegSlots: new Map(),
    playerStatCounts: new Map(),
    gameLegCounts: new Map(),
    selected: [],
  };
}

export type PortfolioDiversificationReport = {
  schemaVersion: typeof PORTFOLIO_DIVERSIFICATION_SCHEMA_VERSION;
  policy: PortfolioDiversificationPolicy;
  candidateCount: number;
  exportCap: number;
  diversifiedCount: number;
  greedyStoppedEarly: boolean;
  /** Top `exportCap` by raw export ranking (cardEv comparator) — reference concentration. */
  rawTopK: Array<{
    flexType: string;
    cardEv: number;
    legKeys: string[];
  }>;
  diversifiedExported: Array<{
    flexType: string;
    rawCardEv: number;
    diversificationAdjustedScore: number;
    breakdown: PortfolioDiversificationBreakdown;
  }>;
  legHistogramRawTopK: Record<string, number>;
  legHistogramDiversified: Record<string, number>;
  topRepeatedLegsRawTopK: Array<{ legKey: string; count: number }>;
  topRepeatedLegsDiversified: Array<{ legKey: string; count: number }>;
  maxPairwiseOverlapDiversified: number;
};

function histogramLegs(cards: CardEvResult[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const c of cards) {
    for (const k of legKeysForCard(c)) {
      h[k] = (h[k] ?? 0) + 1;
    }
  }
  return h;
}

function topRepeated(h: Record<string, number>, n: number): Array<{ legKey: string; count: number }> {
  return Object.entries(h)
    .map(([legKey, count]) => ({ legKey, count }))
    .sort((a, b) => b.count - a.count || a.legKey.localeCompare(b.legKey))
    .slice(0, n);
}

function maxPairwiseOverlap(cards: CardEvResult[]): number {
  let max = 0;
  const keySets = cards.map((c) => new Set(legKeysForCard(c)));
  for (let i = 0; i < keySets.length; i++) {
    for (let j = i + 1; j < keySets.length; j++) {
      let shared = 0;
      for (const k of keySets[i]) {
        if (keySets[j].has(k)) shared++;
      }
      if (shared > max) max = shared;
    }
  }
  return max;
}

/**
 * Greedy diversified export: starts from raw EV ordering (`sortedCards`), never mutates `cardEv`.
 * Returns annotated cards (shallow copy + metadata) and a machine-checkable report.
 */
export function selectDiversifiedPortfolioExport(
  sortedCards: CardEvResult[],
  exportCap: number,
  policy: PortfolioDiversificationPolicy = { ...DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY }
): { exported: CardEvResult[]; report: PortfolioDiversificationReport } {
  const cap = Math.min(exportCap, sortedCards.length);
  const rawTop = sortedCards.slice(0, cap);
  const remaining = sortedCards.slice();
  const state = emptyState();
  const exported: CardEvResult[] = [];
  let greedyStoppedEarly = false;

  while (exported.length < cap && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Number.MAX_VALUE;
    let bestBreakdown: PortfolioDiversificationBreakdown | null = null;

    for (let i = 0; i < remaining.length; i++) {
      const card = remaining[i];
      if (hardViolatesPortfolioConstraints(card, policy, state)) continue;
      const raw = card.cardEv;
      const bd = computeSoftPenalty(card, policy, state);
      const score = raw - bd.penaltyTotal;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestBreakdown = bd;
      }
    }

    if (bestIdx < 0 || bestBreakdown === null) {
      greedyStoppedEarly = true;
      break;
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    const rank = exported.length + 1;
    const meta: PortfolioDiversificationCardMeta = {
      greedyRank: rank,
      penaltyTotal: bestBreakdown.penaltyTotal,
      legPenalty: bestBreakdown.legPenalty,
      playerPenalty: bestBreakdown.playerPenalty,
      playerStatPenalty: bestBreakdown.playerStatPenalty,
      gamePenalty: bestBreakdown.gamePenalty,
      overlapPenalty: bestBreakdown.overlapPenalty,
    };
    const annotated: CardEvResult = {
      ...chosen,
      rawCardEv: chosen.cardEv,
      diversificationAdjustedScore: bestScore,
      portfolioDiversification: meta,
      portfolioRank: rank,
    };
    exported.push(annotated);
    applyCardToState(chosen, state);
  }

  if (exported.length < cap && remaining.length > 0) greedyStoppedEarly = true;

  const hRaw = histogramLegs(rawTop);
  const hDiv = histogramLegs(exported);

  const report: PortfolioDiversificationReport = {
    schemaVersion: PORTFOLIO_DIVERSIFICATION_SCHEMA_VERSION,
    policy: { ...policy },
    candidateCount: sortedCards.length,
    exportCap: cap,
    diversifiedCount: exported.length,
    greedyStoppedEarly,
    rawTopK: rawTop.map((c) => ({
      flexType: c.flexType,
      cardEv: c.cardEv,
      legKeys: legKeysForCard(c),
    })),
    diversifiedExported: exported.map((c) => ({
      flexType: c.flexType,
      rawCardEv: c.rawCardEv ?? c.cardEv,
      diversificationAdjustedScore: c.diversificationAdjustedScore ?? c.cardEv,
      breakdown: {
        penaltyTotal: c.portfolioDiversification!.penaltyTotal,
        legPenalty: c.portfolioDiversification!.legPenalty,
        playerPenalty: c.portfolioDiversification!.playerPenalty,
        playerStatPenalty: c.portfolioDiversification!.playerStatPenalty,
        gamePenalty: c.portfolioDiversification!.gamePenalty,
        overlapPenalty: c.portfolioDiversification!.overlapPenalty,
      },
    })),
    legHistogramRawTopK: hRaw,
    legHistogramDiversified: hDiv,
    topRepeatedLegsRawTopK: topRepeated(hRaw, 15),
    topRepeatedLegsDiversified: topRepeated(hDiv, 15),
    maxPairwiseOverlapDiversified: maxPairwiseOverlap(exported),
  };

  return { exported, report };
}

/**
 * UD export path: same greedy diversification on sorted `{ format, card }[]` (already primary-ranked).
 * Re-attaches `format` from the matching pre-diversification row via {@link cardIdentityKey}.
 */
export function selectDiversifiedPortfolioFormatEntries(
  sortedEntries: { format: string; card: CardEvResult }[],
  exportCap: number,
  policy: PortfolioDiversificationPolicy = { ...DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY }
): { exported: { format: string; card: CardEvResult }[]; report: PortfolioDiversificationReport } {
  const idToFormat = new Map(
    sortedEntries.map((e) => [cardIdentityKey(e.card), e.format] as const)
  );
  const cards = sortedEntries.map((e) => e.card);
  const { exported, report } = selectDiversifiedPortfolioExport(cards, exportCap, policy);
  const out = exported.map((card) => ({
    format: idToFormat.get(cardIdentityKey(card)) ?? card.structureId ?? card.flexType,
    card,
  }));
  return { exported: out, report };
}
