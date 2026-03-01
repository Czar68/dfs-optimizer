'use client';

import { useState, useEffect } from 'react';
import { DashboardData, FilterState, BankrollSummary } from '../types';
import { fetchDashboardData, formatCurrency, formatPercentage, calculateSummaryStats, getRiskColor } from '../lib/dashboard-data';
import { CardTable } from '../components/CardTable';
import { SinglesTable } from '../components/SinglesTable';
import { BankrollPanel } from '../components/BankrollPanel';
import { FilterPanel } from '../components/FilterPanel';
import { SummaryStats } from '../components/SummaryStats';
import { RefreshCw, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'prizepicks' | 'underdog' | 'singles' | 'summary'>('summary');
  const [filters, setFilters] = useState<FilterState>({
    sports: [],
    structures: [],
    sites: [],
    minEv: 0.05,
    minKelly: 0.5,
    riskLevels: [],
  });

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const dashboardData = await fetchDashboardData();
      if (dashboardData) {
        setData(dashboardData);
        setError(null);
      } else {
        setError('Failed to load dashboard data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-2">Error loading dashboard</p>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const summaryStats = calculateSummaryStats(data);
  const bankrollSummary: BankrollSummary = {
    currentBankroll: data.bankroll,
    totalStake: summaryStats.totalStake,
    riskPercentage: summaryStats.riskPercentage,
    riskLevel: summaryStats.riskLevel,
    dailyCap: data.dailyRiskCap * data.bankroll,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <TrendingUp className="h-8 w-8 text-blue-500" />
              <h1 className="text-xl font-bold text-gray-900">Betting Dashboard</h1>
              <span className="text-sm text-gray-500">
                Last updated: {new Date(data.timestamp).toLocaleString()}
              </span>
            </div>
            <button
              onClick={loadData}
              className="flex items-center space-x-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Bankroll Panel */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <BankrollPanel summary={bankrollSummary} />
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'summary', label: 'Daily Summary', icon: TrendingUp },
              { id: 'prizepicks', label: 'PrizePicks', icon: DollarSign },
              { id: 'underdog', label: 'Underdog', icon: DollarSign },
              { id: 'singles', label: 'Sportsbook Singles', icon: TrendingUp },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'summary' && (
          <div className="space-y-6">
            <SummaryStats data={data} summary={summaryStats} />
          </div>
        )}

        {activeTab === 'prizepicks' && (
          <div className="space-y-6">
            <FilterPanel
              filters={filters}
              onFiltersChange={setFilters}
              data={data}
              type="cards"
            />
            <CardTable
              cards={data.prizepicksCards}
              filters={filters}
              site="prizepicks"
            />
          </div>
        )}

        {activeTab === 'underdog' && (
          <div className="space-y-6">
            <FilterPanel
              filters={filters}
              onFiltersChange={setFilters}
              data={data}
              type="cards"
            />
            <CardTable
              cards={data.underdogCards}
              filters={filters}
              site="underdog"
            />
          </div>
        )}

        {activeTab === 'singles' && (
          <div className="space-y-6">
            <FilterPanel
              filters={filters}
              onFiltersChange={setFilters}
              data={data}
              type="singles"
            />
            <SinglesTable
              singles={data.sportsbookSingles}
              filters={filters}
            />
          </div>
        )}
      </div>
    </div>
  );
}
