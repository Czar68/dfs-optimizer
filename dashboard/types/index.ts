// Dashboard types
export interface DashboardData {
  timestamp: string;
  bankroll: number;
  maxKellyFraction: number;
  dailyRiskCap: number;
  prizepicksCards: PrizePicksCard[];
  underdogCards: UnderdogCard[];
  sportsbookSingles: SportsbookSingle[];
  metrics: DailyMetrics;
}

export interface PrizePicksCard {
  id: string;
  site: 'prizepicks';
  sport: string;
  structure: string;
  legs: CardLeg[];
  ev: number;
  kellyPercentage: number;
  recommendedStake: number;
  riskAdjustment: string;
  winProb: number;
}

export interface UnderdogCard {
  id: string;
  site: 'underdog';
  sport: string;
  structure: string;
  legs: CardLeg[];
  ev: number;
  kellyPercentage: number;
  recommendedStake: number;
  riskAdjustment: string;
  winProb: number;
}

export interface CardLeg {
  player: string;
  team: string;
  opponent: string;
  stat: string;
  line: number;
  side: 'over' | 'under';
  legEv: number;
}

export interface SportsbookSingle {
  id: string;
  sport: string;
  book: string;
  market: string;
  side: string;
  odds: number;
  edge: number;
  kellyPercentage: number;
  recommendedStake: number;
  riskAdjustment: string;
  winProb: number;
}

export interface DailyMetrics {
  date: string;
  bankroll: number;
  optimizers: {
    prizepicks: {
      propsLoaded: number;
      propsMerged: number;
      cardsGenerated: number;
      cardsByStructure: Record<string, number>;
      avgEvByStructure: Record<string, number>;
      totalEvGenerated: number;
      totalKellyAllocation: number;
    };
    underdog: {
      propsLoaded: number;
      propsMerged: number;
      cardsGenerated: number;
      cardsByStructure: Record<string, number>;
      avgEvByStructure: Record<string, number>;
      totalEvGenerated: number;
      totalKellyAllocation: number;
    };
    sportsbook_singles: {
      marketsLoaded: number;
      singlesGenerated: number;
      totalEdgeGenerated: number;
      totalKellyAllocation: number;
    };
  };
  correlationFilters: {
    cardsRemovedSamePlayer: number;
    cardsAdjustedTeamConcentration: number;
    correlationConflicts: number;
  };
  stakeSizing: {
    totalRecommendedStake: number;
    bankrollPercentageAtRisk: number;
    scalingApplied: boolean;
  };
}

export interface FilterState {
  sports: string[];
  structures: string[];
  sites: string[];
  minEv: number;
  minKelly: number;
  riskLevels: string[];
}

export interface BankrollSummary {
  currentBankroll: number;
  totalStake: number;
  riskPercentage: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  dailyCap: number;
}
