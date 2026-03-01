// src/fantasy.ts

/**
 * NBA fantasy scoring (PrizePicks rules):
 * - Points: 1
 * - Rebounds: 1.2
 * - Assists: 1.5
 * - Steals: 3
 * - Blocks: 3
 * - Turnovers: -1
 */

export interface NbaFantasyInputs {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
}

export function computeFantasyScoreNBA(inputs: NbaFantasyInputs): number {
  const { points, rebounds, assists, steals, blocks, turnovers } = inputs;

  return (
    1 * points +
    1.2 * rebounds +
    1.5 * assists +
    3 * steals +
    3 * blocks -
    1 * turnovers
  );
}

/**
 * NFL fantasy scoring (PrizePicks rules):
 * - Passing yards: 0.04 (1 per 25 yards)
 * - Passing TD: 4
 * - Interceptions: -1
 * - Rushing yards: 0.1 (1 per 10 yards)
 * - Rushing TD: 6
 * - Receptions: 1
 * - Receiving yards: 0.1
 * - Receiving TD: 6
 * - Fumbles lost: -2
 */

export interface NflFantasyInputs {
  passingYards: number;
  passingTDs: number;
  interceptions: number;
  rushingYards: number;
  rushingTDs: number;
  receptions: number;
  receivingYards: number;
  receivingTDs: number;
  fumblesLost: number;
}

export function computeFantasyScoreNFL(inputs: NflFantasyInputs): number {
  const {
    passingYards,
    passingTDs,
    interceptions,
    rushingYards,
    rushingTDs,
    receptions,
    receivingYards,
    receivingTDs,
    fumblesLost,
  } = inputs;

  return (
    0.04 * passingYards +
    4 * passingTDs -
    1 * interceptions +
    0.1 * rushingYards +
    6 * rushingTDs +
    1 * receptions +
    0.1 * receivingYards +
    6 * receivingTDs -
    2 * fumblesLost
  );
}
