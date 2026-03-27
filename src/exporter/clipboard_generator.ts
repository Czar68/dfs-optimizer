/**
 * src/exporter/clipboard_generator.ts
 * Formats cards into a condensed, mobile-friendly string for copy/paste to phone or Telegram.
 */

import type { CardEvResult, Site } from "../types";

const STAT_ABBREV: Record<string, string> = {
  points: "Pts",
  rebounds: "Reb",
  assists: "Ast",
  threes: "3PM",
  steals: "Stl",
  blocks: "Blk",
  turnovers: "TO",
  fantasy_points: "FP",
  pra: "PRA",
  "pts+reb+ast": "PRA",
  points_rebounds_assists: "PRA",
  "pts+ast": "PA",
  "pts+reb": "PR",
  "reb+ast": "RA",
  points_rebounds: "PR",
  points_assists: "PA",
  rebounds_assists: "RA",
  stocks: "STK",
};

function shortName(player: string): string {
  const parts = player.trim().split(/\s+/);
  if (parts.length === 0) return player;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first.charAt(0).toUpperCase()}. ${last}`;
}

function statLabel(stat: string): string {
  const key = stat?.toLowerCase().replace(/_/g, " ") ?? "";
  return STAT_ABBREV[key] ?? stat?.replace(/_/g, " ") ?? stat;
}

/** Resolve platform for labeling: explicit card.site, else first leg's site. */
function resolveCardSite(card: CardEvResult): Site | undefined {
  return card.site ?? card.legs[0]?.pick.site;
}

/**
 * Short tag for clipboard/Telegram: must match the canonical structure key used in EV math
 * (PP slip codes; UD `UD_*` ids), never UD-as-PP.
 */
export function formatCardClipTag(card: CardEvResult): string {
  const site = resolveCardSite(card);
  const structKey = card.structureId ?? card.flexType;
  if (site === "underdog") {
    return `[UD ${structKey}]`;
  }
  if (site === "prizepicks" || site === undefined) {
    return `[PP ${structKey}]`;
  }
  return `[${site} ${structKey}]`;
}

/**
 * Formats a single card into a highly readable, condensed mobile-friendly string.
 * Example: [PP 5F] • L. James OVER 24.5 Pts • S. Curry UNDER 5.5 Ast ... (EV: +12.5%)
 */
export function generateClipboardString(card: CardEvResult): string {
  const tag = formatCardClipTag(card);
  const legParts = card.legs.map(({ pick, side }) => {
    const name = shortName(pick.player);
    const market = statLabel(pick.stat);
    const dir = side === "over" ? "OVER" : "UNDER";
    return `${name} ${dir} ${pick.line} ${market}`;
  });
  const evPct = (card.cardEv * 100).toFixed(1);
  const evSign = card.cardEv >= 0 ? "+" : "";
  const footer = `(EV: ${evSign}${evPct}%)`;
  return `${tag} • ${legParts.join(" • ")} ${footer}`;
}

/** Minimal shape for tracker cards (TrackedCard from tracker_schema). Same output format as generateClipboardString. */
export interface TrackedCardClipboardInput {
  platform: "PP" | "UD";
  flexType: string;
  projectedEv: number;
  legs: { playerName: string; market: string; line: number; pick: "Over" | "Under" }[];
}

export function generateClipboardStringFromTrackedCard(card: TrackedCardClipboardInput): string {
  const tag = `[${card.platform} ${card.flexType}]`;
  const legParts = card.legs.map((leg) => {
    const name = shortName(leg.playerName);
    const market = statLabel(leg.market);
    const dir = leg.pick === "Over" ? "OVER" : "UNDER";
    return `${name} ${dir} ${leg.line} ${market}`;
  });
  const evPct = (card.projectedEv * 100).toFixed(1);
  const evSign = card.projectedEv >= 0 ? "+" : "";
  const footer = `(EV: ${evSign}${evPct}%)`;
  return `${tag} • ${legParts.join(" • ")} ${footer}`;
}
