/**
 * Phase 16L: Compress high-EV Telegram output — dedupe near-identical cards,
 * prefer best-bet tier (must_play first), cap per platform. No EV math changes.
 */

import type { CardEvResult } from "../types";
import { computeBestBetScore, type BestBetTier } from "../best_bets_score";

const TIER_SORT: Record<BestBetTier, number> = {
  must_play: 0,
  strong: 1,
  small: 2,
  lottery: 3,
  skip: 4,
};

/** Stable key for the set of legs (order-independent). */
export function legSetKey(card: CardEvResult): string {
  const parts = card.legs.map(({ pick, side }) => {
    const id = pick.id?.trim();
    if (id) return id;
    return `${pick.player}|${pick.stat}|${pick.line}|${side}`;
  });
  parts.sort();
  return parts.join(";");
}

/**
 * Keep one card per leg-set, preferring higher cardEv (near-dupes from combo search).
 */
export function dedupeCardsByLegSet(cards: CardEvResult[]): CardEvResult[] {
  const best = new Map<string, CardEvResult>();
  for (const card of cards) {
    const k = legSetKey(card);
    const prev = best.get(k);
    if (!prev || card.cardEv > prev.cardEv) best.set(k, card);
  }
  return [...best.values()];
}

function bestBetRank(card: CardEvResult): number {
  const sport = card.legs[0]?.pick.sport ?? "NBA";
  const { tier } = computeBestBetScore({
    cardEv: card.cardEv,
    avgEdgePct: card.avgEdgePct,
    winProbCash: card.winProbCash,
    legCount: card.legs.length,
    sport,
  });
  return TIER_SORT[tier] ?? 99;
}

/** Tier 1 (must_play) first, then by EV descending. */
export function sortCardsForTelegramDigest(cards: CardEvResult[]): CardEvResult[] {
  return [...cards].sort((a, b) => {
    const tr = bestBetRank(a) - bestBetRank(b);
    if (tr !== 0) return tr;
    const evDelta = b.cardEv - a.cardEv;
    if (evDelta !== 0) return evDelta;
    const aSite = a.site ?? a.legs[0]?.pick.site ?? "";
    const bSite = b.site ?? b.legs[0]?.pick.site ?? "";
    const siteCmp = aSite.localeCompare(bSite);
    if (siteCmp !== 0) return siteCmp;
    const aStruct = a.structureId ?? a.flexType ?? "";
    const bStruct = b.structureId ?? b.flexType ?? "";
    const structCmp = aStruct.localeCompare(bStruct);
    if (structCmp !== 0) return structCmp;
    return legSetKey(a).localeCompare(legSetKey(b));
  });
}

function isPpCard(card: CardEvResult): boolean {
  return (card.site ?? card.legs[0]?.pick.site) === "prizepicks";
}

export interface HighEvDigestOptions {
  maxPerPlatform: number;
  runLabel?: string;
}

function normalizeCardLine(line: string): string {
  // Keep one compact line per card for mobile readability.
  return line
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001F]/g, " ")
    .replace(/\s*([|,;:])\s*/g, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatSiteTag(card: CardEvResult): string {
  const site = (card.site ?? card.legs[0]?.pick.site ?? "").toLowerCase();
  if (site === "prizepicks") return "PP";
  if (site === "underdog") return "UD";
  if (site === "sleeper") return "SL";
  return "";
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatBepGap(card: CardEvResult): string {
  if (typeof card.breakevenGap !== "number" || !Number.isFinite(card.breakevenGap)) return "";
  const pctPoints = card.breakevenGap * 100;
  const sign = pctPoints >= 0 ? "+" : "";
  return `BE ${sign}${pctPoints.toFixed(1)}pp`;
}

function formatCardMetadata(card: CardEvResult): string {
  const parts: string[] = [];
  const site = formatSiteTag(card);
  if (site) parts.push(site);
  const struct = (card.structureId ?? card.flexType ?? "").trim();
  if (struct) parts.push(struct);
  if (card.legs.length > 0) parts.push(`${card.legs.length}L`);
  if (Number.isFinite(card.avgEdgePct)) parts.push(`edge ${formatPct(card.avgEdgePct)}`);
  const beGap = formatBepGap(card);
  if (beGap) parts.push(beGap);
  return parts.join(" • ");
}

function formatRunLabel(runLabel?: string): string {
  const raw = runLabel?.trim();
  if (!raw) return "";
  const isoMinuteUtc = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d{1,3})?)?Z$/;
  const m = raw.match(isoMinuteUtc);
  if (m) return `${m[1]} ${m[2]} UTC`;
  return raw;
}

/**
 * Same dedupe/cap/sort logic as {@link buildHighEvTelegramMessages} — for run-status reporting only.
 * Returns null when there are no cards.
 */
export function summarizeHighEvDigestCounts(
  cards: CardEvResult[],
  opts: Pick<HighEvDigestOptions, "maxPerPlatform">
): { shownCount: number; dedupedCount: number } | null {
  if (cards.length === 0) return null;
  const pp = cards.filter(isPpCard);
  const ud = cards.filter((c) => !isPpCard(c));
  const ppDeduped = dedupeCardsByLegSet(pp);
  const udDeduped = dedupeCardsByLegSet(ud);
  const ppPick = sortCardsForTelegramDigest(ppDeduped).slice(0, opts.maxPerPlatform);
  const udPick = sortCardsForTelegramDigest(udDeduped).slice(0, opts.maxPerPlatform);
  const shown = ppPick.length + udPick.length;
  const dedupedCount = ppDeduped.length + udDeduped.length;
  return { shownCount: shown, dedupedCount };
}

/** Build one concise plain-text digest message with PP/UD sections. */
export function buildHighEvTelegramMessages(
  cards: CardEvResult[],
  formatLine: (card: CardEvResult) => string,
  opts: HighEvDigestOptions
): string[] {
  const { maxPerPlatform, runLabel } = opts;
  if (cards.length === 0) return [];
  const pp = cards.filter(isPpCard);
  const ud = cards.filter((c) => !isPpCard(c));
  const ppDeduped = dedupeCardsByLegSet(pp);
  const udDeduped = dedupeCardsByLegSet(ud);
  const ppPick = sortCardsForTelegramDigest(ppDeduped).slice(0, maxPerPlatform);
  const udPick = sortCardsForTelegramDigest(udDeduped).slice(0, maxPerPlatform);
  const shown = ppPick.length + udPick.length;
  const dedupedTotal = ppDeduped.length + udDeduped.length;
  const compactLabel = formatRunLabel(runLabel);
  const when = compactLabel ? ` • ${compactLabel}` : "";
  const summary = `📌 Digest${when} • shown ${shown}/${cards.length} • deduped ${dedupedTotal}`;
  const sourceLine = `📊 PP ${ppPick.length}/${ppDeduped.length} • UD ${udPick.length}/${udDeduped.length}`;

  const lines: string[] = [summary, sourceLine];
  const pushSection = (title: string, picks: CardEvResult[]) => {
    if (picks.length === 0) return;
    lines.push("", title);
    for (let i = 0; i < picks.length; i++) {
      const body = normalizeCardLine(formatLine(picks[i]));
      const meta = formatCardMetadata(picks[i]);
      lines.push(`${i + 1}. ${body}${meta ? ` • ${meta}` : ""}`);
    }
  };
  pushSection("PP", ppPick);
  pushSection("UD", udPick);

  return [lines.join("\n")];
}
