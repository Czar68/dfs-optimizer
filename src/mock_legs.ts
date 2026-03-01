/**
 * Synthetic legs for --mock-legs N (testing / parity / e2e).
 * trueProb 0.55–0.65, legEv/edge 2–6%, unique player/stat/line per leg.
 */
import type { EvPick, Site } from "./types";

export function createSyntheticEvPicks(n: number, site: Site): EvPick[] {
  const picks: EvPick[] = [];
  const stats: Array<{ stat: EvPick["stat"]; lineBase: number }> = [
    { stat: "points", lineBase: 18 },
    { stat: "rebounds", lineBase: 5 },
    { stat: "assists", lineBase: 4 },
    { stat: "points", lineBase: 22 },
    { stat: "rebounds", lineBase: 7 },
    { stat: "assists", lineBase: 6 },
  ];
  for (let i = 0; i < n; i++) {
    const statEntry = stats[i % stats.length];
    const trueProb = 0.55 + (i % 11) * 0.009; // 0.55–0.649
    const edge = 0.02 + (i % 5) * 0.01; // 2–6%
    const legEv = edge;
    const line = statEntry.lineBase + (i % 4);
    const id =
      site === "underdog"
        ? `underdog-mock-${i}-${statEntry.stat}-${line}`
        : `pp-mock-${i}-${statEntry.stat}-${line}`;
    picks.push({
      id,
      sport: "NBA",
      site,
      league: "NBA",
      player: `MockPlayer${i + 1}`,
      team: `T${(i % 5) + 1}`,
      opponent: null,
      stat: statEntry.stat,
      line,
      projectionId: `proj-mock-${i}`,
      gameId: `game-mock-${i}`,
      startTime: null,
      outcome: "over",
      trueProb,
      fairOdds: trueProb / (1 - trueProb),
      edge,
      book: "fanduel",
      overOdds: -150 + i * 5,
      underOdds: 130 - i * 5,
      legEv,
      isNonStandardOdds: false,
    });
  }
  return picks;
}
