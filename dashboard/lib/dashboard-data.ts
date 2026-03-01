// Dashboard data fetching and utilities
import { DashboardData, PrizePicksCard, UnderdogCard, SportsbookSingle } from '../types';

export async function fetchDashboardData(): Promise<DashboardData | null> {
  try {
    // In production, this would fetch from the generated dashboard_data.json
    const response = await fetch('/dashboard_data.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard data: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return null;
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function getEvColor(ev: number): string {
  if (ev >= 0.15) return 'text-green-600';
  if (ev >= 0.10) return 'text-green-500';
  if (ev >= 0.05) return 'text-yellow-500';
  return 'text-red-500';
}

export function getRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'LOW':
      return 'text-green-600 bg-green-50';
    case 'MEDIUM':
      return 'text-yellow-600 bg-yellow-50';
    case 'HIGH':
      return 'text-orange-600 bg-orange-50';
    case 'VERY_HIGH':
      return 'text-red-600 bg-red-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

export function getRiskLevel(riskPercentage: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' {
  if (riskPercentage > 0.15) return 'VERY_HIGH';
  if (riskPercentage > 0.10) return 'HIGH';
  if (riskPercentage > 0.05) return 'MEDIUM';
  return 'LOW';
}

export function filterCards<T extends PrizePicksCard | UnderdogCard>(
  cards: T[],
  filters: {
    sports: string[];
    structures: string[];
    sites: string[];
    minEv: number;
    minKelly: number;
    riskLevels: string[];
  }
): T[] {
  return cards.filter(card => {
    if (filters.sports.length > 0 && !filters.sports.includes(card.sport)) return false;
    if (filters.structures.length > 0 && !filters.structures.includes(card.structure)) return false;
    if (filters.sites.length > 0 && !filters.sites.includes(card.site)) return false;
    if (card.ev < filters.minEv) return false;
    if (card.kellyPercentage < filters.minKelly) return false;
    if (filters.riskLevels.length > 0) {
      const cardRiskLevel = getRiskLevel(card.recommendedStake / 750); // Assuming $750 bankroll
      if (!filters.riskLevels.includes(cardRiskLevel)) return false;
    }
    return true;
  });
}

export function filterSingles(
  singles: SportsbookSingle[],
  filters: {
    sports: string[];
    books: string[];
    minEdge: number;
    minKelly: number;
    riskLevels: string[];
  }
): SportsbookSingle[] {
  return singles.filter(single => {
    if (filters.sports.length > 0 && !filters.sports.includes(single.sport)) return false;
    if (filters.books.length > 0 && !filters.books.includes(single.book)) return false;
    if (single.edge < filters.minEdge) return false;
    if (single.kellyPercentage < filters.minKelly) return false;
    if (filters.riskLevels.length > 0) {
      const singleRiskLevel = getRiskLevel(single.recommendedStake / 750);
      if (!filters.riskLevels.includes(singleRiskLevel)) return false;
    }
    return true;
  });
}

export function calculateSummaryStats(data: DashboardData) {
  const totalCards = data.prizepicksCards.length + data.underdogCards.length;
  const totalSingles = data.sportsbookSingles.length;
  const totalStake = [
    ...data.prizepicksCards,
    ...data.underdogCards,
    ...data.sportsbookSingles
  ].reduce((sum, item) => sum + item.recommendedStake, 0);
  
  const avgEv = totalCards > 0 
    ? ([...data.prizepicksCards, ...data.underdogCards].reduce((sum, card) => sum + card.ev, 0) / totalCards)
    : 0;
  
  const avgEdge = totalSingles > 0
    ? (data.sportsbookSingles.reduce((sum, single) => sum + single.edge, 0) / totalSingles)
    : 0;

  return {
    totalCards,
    totalSingles,
    totalStake,
    avgEv,
    avgEdge,
    riskPercentage: totalStake / data.bankroll,
    riskLevel: getRiskLevel(totalStake / data.bankroll),
  };
}
