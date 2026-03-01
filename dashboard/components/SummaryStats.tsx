'use client';

import { DashboardData } from '../types';
import { formatCurrency, formatPercentage } from '../lib/dashboard-data';
import { BarChart3, TrendingUp, Users, Target } from 'lucide-react';

interface SummaryStatsProps {
  data: DashboardData;
  summary: {
    totalCards: number;
    totalSingles: number;
    totalStake: number;
    avgEv: number;
    avgEdge: number;
    riskPercentage: number;
    riskLevel: string;
  };
}

export function SummaryStats({ data, summary }: SummaryStatsProps) {
  const ppMetrics = data.metrics.optimizers.prizepicks;
  const udMetrics = data.metrics.optimizers.underdog;
  const sbMetrics = data.metrics.optimizers.sportsbook_singles;

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-2 mb-2">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium text-gray-600">Total Cards</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{summary.totalCards}</div>
          <div className="text-sm text-gray-500 mt-1">
            PrizePicks: {data.prizepicksCards.length} | Underdog: {data.underdogCards.length}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-2 mb-2">
            <Target className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-gray-600">Total Singles</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{summary.totalSingles}</div>
          <div className="text-sm text-gray-500 mt-1">
            Sportsbook single bets
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-2 mb-2">
            <TrendingUp className="h-5 w-5 text-purple-500" />
            <span className="text-sm font-medium text-gray-600">Avg EV/Edge</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {formatPercentage(summary.avgEv)}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Cards: {formatPercentage(summary.avgEv)} | Singles: {formatPercentage(summary.avgEdge)}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-2 mb-2">
            <Users className="h-5 w-5 text-orange-500" />
            <span className="text-sm font-medium text-gray-600">Total Stake</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {formatCurrency(summary.totalStake)}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {formatPercentage(summary.riskPercentage)} of bankroll
          </div>
        </div>
      </div>

      {/* Optimizer Performance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* PrizePicks Performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">PrizePicks Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Props Loaded</span>
              <span className="text-sm font-medium">{ppMetrics.propsLoaded}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Props Merged</span>
              <span className="text-sm font-medium">{ppMetrics.propsMerged}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Cards Generated</span>
              <span className="text-sm font-medium">{ppMetrics.cardsGenerated}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Total EV</span>
              <span className="text-sm font-medium text-green-600">
                {formatPercentage(ppMetrics.totalEvGenerated)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Kelly Allocation</span>
              <span className="text-sm font-medium text-blue-600">
                {formatPercentage(ppMetrics.totalKellyAllocation)}
              </span>
            </div>
          </div>

          {/* Structure Breakdown */}
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Cards by Structure</h4>
            <div className="space-y-1">
              {Object.entries(ppMetrics.cardsByStructure).map(([structure, count]) => (
                <div key={structure} className="flex justify-between text-sm">
                  <span className="text-gray-600">{structure}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Underdog Performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Underdog Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Props Loaded</span>
              <span className="text-sm font-medium">{udMetrics.propsLoaded}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Props Merged</span>
              <span className="text-sm font-medium">{udMetrics.propsMerged}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Cards Generated</span>
              <span className="text-sm font-medium">{udMetrics.cardsGenerated}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Total EV</span>
              <span className="text-sm font-medium text-green-600">
                {formatPercentage(udMetrics.totalEvGenerated)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Kelly Allocation</span>
              <span className="text-sm font-medium text-blue-600">
                {formatPercentage(udMetrics.totalKellyAllocation)}
              </span>
            </div>
          </div>

          {/* Structure Breakdown */}
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Cards by Structure</h4>
            <div className="space-y-1">
              {Object.entries(udMetrics.cardsByStructure).map(([structure, count]) => (
                <div key={structure} className="flex justify-between text-sm">
                  <span className="text-gray-600">{structure}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sportsbook Singles Performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sportsbook Singles</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Markets Loaded</span>
              <span className="text-sm font-medium">{sbMetrics.marketsLoaded}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Singles Generated</span>
              <span className="text-sm font-medium">{sbMetrics.singlesGenerated}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Total Edge</span>
              <span className="text-sm font-medium text-green-600">
                {formatPercentage(sbMetrics.totalEdgeGenerated)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Kelly Allocation</span>
              <span className="text-sm font-medium text-blue-600">
                {formatPercentage(sbMetrics.totalKellyAllocation)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Correlation Filters Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Correlation Filters Applied</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-sm font-medium text-red-700 mb-1">Same Player Conflicts</div>
            <div className="text-2xl font-bold text-red-900">
              {data.metrics.correlationFilters.cardsRemovedSamePlayer}
            </div>
            <div className="text-sm text-red-600">Cards removed</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="text-sm font-medium text-yellow-700 mb-1">Team Concentration</div>
            <div className="text-2xl font-bold text-yellow-900">
              {data.metrics.correlationFilters.cardsAdjustedTeamConcentration}
            </div>
            <div className="text-sm text-yellow-600">Cards adjusted</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm font-medium text-blue-700 mb-1">Correlation Conflicts</div>
            <div className="text-2xl font-bold text-blue-900">
              {data.metrics.correlationFilters.correlationConflicts}
            </div>
            <div className="text-sm text-blue-600">Pairs flagged</div>
          </div>
        </div>
      </div>
    </div>
  );
}
