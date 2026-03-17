/**
 * Synthetic legs for --mock-legs N (testing / parity / e2e).
 * trueProb 0.55–0.65, legEv/edge 2–6%, unique player/stat/line per leg.
 * Uses realistic NBA names so merge normalization (dots, initials, aliases) is exercised.
 */
import type { EvPick, Site } from "./types";

const MOCK_NBA_PLAYERS = [
  "LeBron James",
  "Stephen Curry",
  "Nikola Jokić",
  "Jayson Tatum",
  "Luka Dončić",
  "Kevin Durant",
  "Giannis Antetokounmpo",
  "De'Aaron Fox",
  "Karl-Anthony Towns",
  "Marcus Morris Sr.",
  "Anthony Davis",
  "Bam Adebayo",
  "C.J. McCollum",
  "T.J. McConnell",
  "D.J. Augustin",
  "Shai Gilgeous-Alexander",
  "Jaren Jackson Jr.",
  "Gary Payton II",
  "Kelly Oubre Jr.",
  "Wendell Carter Jr.",
];

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
      player: MOCK_NBA_PLAYERS[i % MOCK_NBA_PLAYERS.length],
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
      scoringWeight: 1.0,
    });
  }
  return picks;
}
