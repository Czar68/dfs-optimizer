/**
 * Site-agnostic merge: group by player+statType, keep the single best line by edge.
 * When multiple lines exist for the same (player, stat)—e.g. main + alternative lines from
 * the Odds API—the line with the highest edge (trueProb − breakeven) is kept. No PP/UD-specific logic.
 *
 * Intelligence layer: FantasyMatchupScore and ConfidenceDelta (FantasyProjection - BookmakerLine)
 * are carried on UnifiedProp / MergedProp and mapped into the 36-column inventory and 23-column
 * cards CSV (sheet column V/W index).
 */

import { americanToProb } from "../odds_math";
import type { UnifiedProp, MergedProp } from "../types/unified-prop";

function normalizePlayerName(name: string): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function toBigrams(value: string): Set<string> {
  const out = new Set<string>();
  if (value.length <= 2) {
    if (value.length > 0) out.add(value);
    return out;
  }
  for (let i = 0; i < value.length - 1; i++) out.add(value.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice similarity, 0..1. Handles TJ/T.J. and punctuation variants robustly. */
function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aa = normalizePlayerName(a);
  const bb = normalizePlayerName(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.96;
  const aBi = toBigrams(aa);
  const bBi = toBigrams(bb);
  if (aBi.size === 0 || bBi.size === 0) return 0;
  let intersection = 0;
  for (const token of aBi) if (bBi.has(token)) intersection++;
  return (2 * intersection) / (aBi.size + bBi.size);
}

function isAltLine(prop: UnifiedProp): boolean {
  const explicit = (prop as unknown as { isMainLine?: boolean }).isMainLine;
  if (explicit === false) return true;
  const marketId = String((prop as unknown as { marketId?: string }).marketId ?? prop.raw?.marketId ?? "").toLowerCase();
  if (marketId.includes("alternate") || marketId.endsWith("_alt")) return true;
  return false;
}

/**
 * Derive true probability (over) from American odds. Uses over odds; if invalid, 0.5.
 */
function trueProbFromOdds(odds: { over: number; under: number }): number {
  const over = Number(odds?.over);
  if (!Number.isFinite(over)) return 0.5;
  return americanToProb(over);
}

/**
 * Compute ConfidenceDelta = (FantasyProjection - BookmakerLine).
 * BookmakerLine is lineValue; FantasyProjection is FantasyMatchupScore when present.
 */
function confidenceDelta(prop: UnifiedProp): number | undefined {
  const fantasy = prop.FantasyMatchupScore ?? prop.fantasyMatchupScore;
  if (fantasy == null || !Number.isFinite(Number(fantasy))) return undefined;
  const line = Number(prop.lineValue);
  if (!Number.isFinite(line)) return undefined;
  return Number(fantasy) - line;
}

/**
 * Merge unified props: group by player and stat, identify all lines (including alternates),
 * keep the line with the highest edge (trueProb - breakeven) per group.
 * Adds fantasyMatchupScore and confidenceDelta to each MergedProp for CSV (36-col inventory, 23-col cards V/W).
 */
export function mergeProps(props: UnifiedProp[]): MergedProp[] {
  const SIMILARITY_THRESHOLD = 0.92;
  const buckets: Array<{
    canonicalPlayer: string;
    normalizedPlayer: string;
    statNorm: string;
    props: UnifiedProp[];
  }> = [];

  for (const p of props) {
    const statNorm = String(p.statType ?? "").trim().toLowerCase();
    const normalized = normalizePlayerName(String(p.player ?? ""));
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.statNorm !== statNorm) continue;
      const sim = nameSimilarity(normalized, b.normalizedPlayer);
      if (sim >= SIMILARITY_THRESHOLD && sim > bestScore) {
        bestScore = sim;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      buckets[bestIdx].props.push(p);
    } else {
      buckets.push({
        canonicalPlayer: String(p.player ?? ""),
        normalizedPlayer: normalized,
        statNorm,
        props: [p],
      });
    }
  }

  const out: MergedProp[] = [];
  let fuzzyMergeCount = 0;
  let groupsWithAltLines = 0;
  for (const bucket of buckets) {
    const group = bucket.props;
    const distinctNames = new Set(group.map((g) => normalizePlayerName(String(g.player ?? ""))));
    if (distinctNames.size > 1) fuzzyMergeCount++;
    const hasAltLine = group.some((g) => isAltLine(g));
    if (hasAltLine) groupsWithAltLines++;

    const withEdge = group.map((p) => {
      const trueProb = trueProbFromOdds(p.odds);
      const breakeven = Number(p.breakeven);
      const be = Number.isFinite(breakeven) ? breakeven : 0.5;
      const edge = trueProb - be;
      return { prop: p, trueProb, edge };
    });
    const best = withEdge.reduce((a, b) => (b.edge > a.edge ? b : a));
    const fantasyScore = best.prop.FantasyMatchupScore ?? best.prop.fantasyMatchupScore;
    const delta = confidenceDelta(best.prop);

    out.push({
      id: best.prop.id,
      provider: best.prop.provider,
      player: best.prop.player,
      statType: best.prop.statType,
      lineValue: best.prop.lineValue,
      breakeven: best.prop.breakeven,
      odds: best.prop.odds,
      edge: best.edge,
      trueProb: best.trueProb,
      raw: best.prop.raw,
      fantasyMatchupScore:
        fantasyScore != null && Number.isFinite(Number(fantasyScore)) ? Number(fantasyScore) : undefined,
      confidenceDelta: delta,
    });
  }

  const withFantasy = props.filter(
    (p) =>
      (p.FantasyMatchupScore != null && Number.isFinite(Number(p.FantasyMatchupScore))) ||
      (p.fantasyMatchupScore != null && Number.isFinite(Number(p.fantasyMatchupScore)))
  );
  console.log(
    `[mergeService] Legs with FantasyMatchupScore: ${withFantasy.length} of ${props.length} (merged output: ${out.length})`
  );
  console.log(
    `[mergeService] Fuzzy name merges: ${fuzzyMergeCount}; groups with main/alt lines: ${groupsWithAltLines}`
  );

  return out;
}
