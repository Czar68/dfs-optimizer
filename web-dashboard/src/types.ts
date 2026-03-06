export interface Card {
  sport: string;
  site: string;
  flexType: string;
  siteLeg?: string;
  playerPropLine?: string;
  cardEv: number;
  kellyStake: number;
  kellyFrac: number;
  avgEdgePct: number;
  winProbCash?: number;
  leg1Id: string;
  leg2Id: string;
  leg3Id: string;
  leg4Id: string;
  leg5Id: string;
  leg6Id: string;
  leg7Id?: string;
  leg8Id?: string;
  runTimestamp: string;
}

export interface LegInfo {
  id: string;
  player: string;
  stat: string;
  line: string;
  team?: string;
}

export type LegsLookup = Map<string, LegInfo>;
