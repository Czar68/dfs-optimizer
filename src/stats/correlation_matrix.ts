// src/stats/correlation_matrix.ts
// Phase 8.4: Stat correlation coherence adjustment.
//
// Combo stats like PRA (Points+Rebounds+Assists) are mathematically
// constrained by their components. If we have model probabilities for
// PTS, REB, AST independently, we can check whether the PRA line
// is coherent with its parts — and adjust if not.
//
// Example: PRA 32.5 → but our model says PTS O28.5 at 60%, REB O9.5
// at 55%, AST O6.5 at 50%. Components imply mean PTS~29+REB~10+AST~6.5
// = 45.5 >> 32.5 → PRA line looks soft, boost.
//
// When component models disagree with the combo line, we adjust the
// combo stat's trueProb by up to ±CORR_MAX_SHIFT.

import { EvPick } from "../types";

const CORR_MAX_SHIFT = 0.03;

interface ComponentDef {
  parts: string[];
  corrWithParts: number;
}

const COMBO_STATS: Record<string, ComponentDef> = {
  pra:     { parts: ["points", "rebounds", "assists"], corrWithParts: 0.85 },
  pr:      { parts: ["points", "rebounds"],            corrWithParts: 0.80 },
  pa:      { parts: ["points", "assists"],             corrWithParts: 0.82 },
  ra:      { parts: ["rebounds", "assists"],            corrWithParts: 0.78 },
  stocks:  { parts: ["steals", "blocks"],              corrWithParts: 0.70 },
};

const STAT_NORMALIZE: Record<string, string> = {
  pts: "points", reb: "rebounds", ast: "assists",
  stl: "steals", blk: "blocks", tov: "turnovers",
  "3pm": "threes", to: "turnovers",
};

function normStat(s: string): string {
  const lower = s.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return STAT_NORMALIZE[lower] ?? lower;
}

export interface CorrelationAdjustment {
  comboStat: string;
  componentProbs: { stat: string; trueProb: number }[];
  componentMean: number;
  comboProb: number;
  shift: number;
}

/**
 * Given a combo stat leg and a set of all legs for the same player,
 * compute whether the combo line is coherent with its component parts.
 *
 * If the average component trueProb significantly exceeds/falls below
 * the combo trueProb, we shift the combo probability toward the
 * component consensus.
 */
export function getCorrelationAdjustment(
  comboLeg: EvPick,
  allLegsForPlayer: EvPick[]
): CorrelationAdjustment | null {
  const comboStatNorm = normStat(comboLeg.stat);
  const comboDef = COMBO_STATS[comboStatNorm];
  if (!comboDef) return null;

  const componentProbs: { stat: string; trueProb: number }[] = [];
  for (const part of comboDef.parts) {
    const partLeg = allLegsForPlayer.find(
      (l) =>
        normStat(l.stat) === part &&
        l.player.toLowerCase() === comboLeg.player.toLowerCase()
    );
    if (partLeg) {
      componentProbs.push({ stat: part, trueProb: partLeg.trueProb });
    }
  }

  if (componentProbs.length < 2) return null;

  const componentMean =
    componentProbs.reduce((s, c) => s + c.trueProb, 0) / componentProbs.length;
  const comboProb = comboLeg.trueProb;

  const rawDiff = componentMean - comboProb;
  const weightedDiff = rawDiff * comboDef.corrWithParts;
  const shift = Math.max(
    -CORR_MAX_SHIFT,
    Math.min(CORR_MAX_SHIFT, weightedDiff)
  );

  if (Math.abs(shift) < 0.005) return null;

  return {
    comboStat: comboStatNorm,
    componentProbs,
    componentMean,
    comboProb,
    shift,
  };
}

/**
 * Apply correlation adjustments to all combo-stat legs in the array.
 * Groups legs by player, finds combo+component pairs, adjusts combo probs.
 * Mutates trueProb and legEv on the combo legs.
 */
export function applyCorrelationAdjustments(
  legs: EvPick[],
  debug = false
): { adjustedCount: number; adjustments: CorrelationAdjustment[] } {
  const byPlayer = new Map<string, EvPick[]>();
  for (const leg of legs) {
    const key = leg.player.toLowerCase();
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key)!.push(leg);
  }

  const adjustments: CorrelationAdjustment[] = [];
  let adjustedCount = 0;

  for (const [, playerLegs] of byPlayer) {
    for (const leg of playerLegs) {
      const adj = getCorrelationAdjustment(leg, playerLegs);
      if (!adj) continue;

      const oldProb = leg.trueProb;
      leg.trueProb = Math.max(0.01, Math.min(0.99, oldProb + adj.shift));
      const oldEdge = leg.edge;
      leg.edge = leg.trueProb - 0.5;
      leg.legEv = leg.edge;
      adjustedCount++;
      adjustments.push(adj);

      if (debug) {
        console.log(
          `[CORR] ${leg.player} ${adj.comboStat}: ` +
            `combo=${(oldProb * 100).toFixed(1)}% → ${(leg.trueProb * 100).toFixed(1)}% ` +
            `(shift ${adj.shift > 0 ? "+" : ""}${(adj.shift * 100).toFixed(1)}%, ` +
            `components=[${adj.componentProbs.map((c) => `${c.stat}:${(c.trueProb * 100).toFixed(1)}%`).join(", ")}])`
        );
      }
    }
  }

  return { adjustedCount, adjustments };
}
