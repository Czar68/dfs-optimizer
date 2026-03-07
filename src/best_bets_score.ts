import { Sport } from "./types";
import { getKellyFraction } from "./kelly_staking";

const LEG_PENALTY: Record<number, number> = {
  2: 1.0,
  3: 1.0,
  4: 1.0,
  5: 0.95,
  6: 0.85,
  7: 0.55,
  8: 0.30,
};

function legPenalty(legCount: number): number {
  return LEG_PENALTY[legCount] ?? (legCount > 8 ? 0.2 : 1.0);
}

export interface BestBetInput {
  cardEv: number;
  avgEdgePct: number;
  winProbCash: number;
  legCount: number;
  sport: Sport;
  historicalWeight?: number;
  fragile?: boolean;
}

export type BestBetTier = "must_play" | "strong" | "small" | "lottery" | "skip";

export interface BestBetResult {
  score: number;
  tier: BestBetTier;
  tierLabel: string;
  tierReason: string;
  legPenalty: number;
  components: {
    edge: number;
    winProb: number;
    kellyFrac: number;
    legPen: number;
    histWeight: number;
    fragPen: number;
  };
}

/*
 * Thresholds (score = edge × winProb × kellyFrac × legPenalty × histWeight × fragPen):
 *   must_play — score ≥ 0.0008, winProb ≥ 10%, legs ≤ 5, edge ≥ 5%
 *   strong   — score ≥ 0.0004, winProb ≥ 5%, legs ≤ 6
 *   small    — score ≥ 0.0001, winProb ≥ 3%
 *   lottery  — cardEv ≥ 10% (high EV but low win probability)
 *   skip     — below all thresholds
 */
export function computeBestBetScore(input: BestBetInput): BestBetResult {
  const edge = input.avgEdgePct > 1 ? input.avgEdgePct / 100 : input.avgEdgePct;
  const winProb = input.winProbCash;
  const kellyFrac = getKellyFraction(input.sport);
  const legPen = legPenalty(input.legCount);
  const histWeight = input.historicalWeight ?? 1.0;
  const fragPen = input.fragile ? 0.5 : 1.0;

  const score = edge * winProb * kellyFrac * legPen * histWeight * fragPen;

  let tier: BestBetTier;
  let tierLabel: string;
  let tierReason: string;

  if (
    score >= 0.0008 &&
    winProb >= 0.10 &&
    input.legCount <= 5 &&
    edge >= 0.05 &&
    !input.fragile
  ) {
    tier = "must_play";
    tierLabel = "Must Play";
    tierReason = `High score (${(score * 10000).toFixed(1)}), ${(winProb * 100).toFixed(0)}% win prob, ${input.legCount} legs, ${(edge * 100).toFixed(1)}% edge`;
  } else if (
    score >= 0.0004 &&
    winProb >= 0.05 &&
    input.legCount <= 6 &&
    !input.fragile
  ) {
    tier = "strong";
    tierLabel = "Strong Play";
    tierReason = `Good score (${(score * 10000).toFixed(1)}), ${(winProb * 100).toFixed(0)}% win prob, ${input.legCount} legs`;
  } else if (score >= 0.0001 && winProb >= 0.03) {
    tier = "small";
    tierLabel = "Small Play";
    tierReason = `Moderate score (${(score * 10000).toFixed(1)}), ${(winProb * 100).toFixed(1)}% win prob`;
  } else if (input.cardEv >= 0.10) {
    tier = "lottery";
    tierLabel = "Lottery";
    tierReason = `High EV (${(input.cardEv * 100).toFixed(0)}%) but low win probability (${(winProb * 100).toFixed(1)}%)`;
  } else {
    tier = "skip";
    tierLabel = "Skip";
    tierReason = `Below thresholds: score=${(score * 10000).toFixed(2)}, edge=${(edge * 100).toFixed(1)}%, winProb=${(winProb * 100).toFixed(1)}%`;
  }

  return {
    score,
    tier,
    tierLabel,
    tierReason,
    legPenalty: legPen,
    components: { edge, winProb, kellyFrac, legPen, histWeight, fragPen },
  };
}

export function constrainPortfolioStake(
  stakes: number[],
  bankroll: number,
  maxPct = 0.06,
  topN = 30
): number[] {
  const sorted = [...stakes].sort((a, b) => b - a);
  const top = sorted.slice(0, topN);
  const totalTop = top.reduce((s, v) => s + v, 0);
  const maxTotal = bankroll * maxPct;

  if (totalTop <= maxTotal) return stakes;

  const scale = maxTotal / totalTop;
  return stakes.map(s => Math.max(1, Math.round(s * scale * 100) / 100));
}
