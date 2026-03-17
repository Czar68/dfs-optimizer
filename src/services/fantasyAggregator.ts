/**
 * Synthetic fantasy score from component props (e.g. Points, Rebounds, Assists).
 * Uses derivedFrom and isDerived for provenance.
 * Used by ENABLE_FANTASY_EV path in applyFantasyAdjEv.
 */

import type { UnifiedProp } from "../types/unified-prop";

const PLACEHOLDER_ODDS = { over: 0, under: 0 };
const DEFAULT_BREAKEVEN = 0.5;

/**
 * Find component props (e.g. Points, Rebounds, Assists) per player, apply scoringMap multipliers,
 * and return one UnifiedProp per player with isDerived true and derivedFrom listing component IDs.
 */
export function calculateFantasyScore(
  props: UnifiedProp[],
  scoringMap: Record<string, number>
): UnifiedProp[] {
  const statKeys = new Set(Object.keys(scoringMap).map((s) => s.trim().toLowerCase()));
  if (statKeys.size === 0) return [];

  const byPlayer = new Map<string, UnifiedProp[]>();
  for (const p of props) {
    if (p.isDerived) continue;
    const stat = String(p.statType ?? "").trim().toLowerCase();
    if (!statKeys.has(stat)) continue;
    const player = String(p.player ?? "").trim().toLowerCase();
    if (!byPlayer.has(player)) byPlayer.set(player, []);
    byPlayer.get(player)!.push(p);
  }

  const out: UnifiedProp[] = [];
  for (const [playerNorm, group] of byPlayer) {
    const byStat = new Map<string, UnifiedProp>();
    for (const p of group) {
      const stat = String(p.statType).trim().toLowerCase();
      if (!statKeys.has(stat)) continue;
      if (!byStat.has(stat)) byStat.set(stat, p);
    }
    const components = [...byStat.values()];
    if (components.length === 0) continue;

    let score = 0;
    const ids: string[] = [];
    for (const p of components) {
      const stat = String(p.statType).trim().toLowerCase();
      const multKey = Object.keys(scoringMap).find((k) => k.trim().toLowerCase() === stat);
      const mult = Number(scoringMap[stat] ?? (multKey != null ? scoringMap[multKey] : 0)) || 0;
      score += p.lineValue * mult;
      ids.push(p.id);
    }

    const first = components[0];
    const playerName = first.player ?? playerNorm;
    const id = `fantasy-${playerNorm}-${ids.join("-").slice(0, 32)}`;

    out.push({
      id,
      provider: first.provider,
      player: playerName,
      statType: "fantasy_score",
      lineValue: Math.round(score * 100) / 100,
      breakeven: DEFAULT_BREAKEVEN,
      odds: PLACEHOLDER_ODDS,
      raw: { components: components.map((c) => c.raw), scoringMap },
      derivedFrom: ids,
      isDerived: true,
    });
  }
  return out;
}
