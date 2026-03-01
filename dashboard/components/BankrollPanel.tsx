'use client';

import { BankrollSummary } from '../types';
import { formatCurrency, formatPercentage, getRiskColor } from '../lib/dashboard-data';
import { AlertTriangle, TrendingUp, DollarSign, Shield } from 'lucide-react';

interface BankrollPanelProps {
  summary: BankrollSummary;
}

export function BankrollPanel({ summary }: BankrollPanelProps) {
  const riskColorClass = getRiskColor(summary.riskLevel);
  const isOverCap = summary.totalStake > summary.dailyCap;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Bankroll Management</h2>
        <Shield className="h-5 w-5 text-gray-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Current Bankroll */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-1">
            <DollarSign className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">Current Bankroll</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(summary.currentBankroll)}
          </div>
        </div>

        {/* Total Stake */}
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-1">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-blue-600">Total Stake</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {formatCurrency(summary.totalStake)}
          </div>
          <div className="text-sm text-blue-600 mt-1">
            {formatPercentage(summary.riskPercentage)} of bankroll
          </div>
        </div>

        {/* Risk Level */}
        <div className={`rounded-lg p-4 ${riskColorClass}`}>
          <div className="flex items-center space-x-2 mb-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Risk Level</span>
          </div>
          <div className="text-2xl font-bold">
            {summary.riskLevel}
          </div>
          <div className="text-sm opacity-75 mt-1">
            {formatPercentage(summary.riskPercentage)} at risk
          </div>
        </div>

        {/* Daily Cap */}
        <div className={`rounded-lg p-4 ${isOverCap ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className="flex items-center space-x-2 mb-1">
            <Shield className={`h-4 w-4 ${isOverCap ? 'text-red-500' : 'text-green-500'}`} />
            <span className={`text-sm font-medium ${isOverCap ? 'text-red-600' : 'text-green-600'}`}>
              Daily Cap
            </span>
          </div>
          <div className={`text-2xl font-bold ${isOverCap ? 'text-red-900' : 'text-green-900'}`}>
            {formatCurrency(summary.dailyCap)}
          </div>
          <div className={`text-sm mt-1 ${isOverCap ? 'text-red-600' : 'text-green-600'}`}>
            {isOverCap ? 'OVER CAP' : 'Within limit'}
          </div>
        </div>
      </div>

      {/* Risk Warning */}
      {isOverCap && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="text-red-800 font-medium">
              Risk Warning: Total stake exceeds daily cap of {formatCurrency(summary.dailyCap)}
            </span>
          </div>
          <p className="text-red-700 text-sm mt-1">
            Consider reducing position sizes or dropping lower-EV recommendations.
          </p>
        </div>
      )}

      {/* Risk Assessment */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Risk Assessment:</span>
          <span className={`text-sm font-medium ${riskColorClass}`}>
            {summary.riskLevel === 'LOW' && '🟢 Conservative allocation - well within limits'}
            {summary.riskLevel === 'MEDIUM' && '🟡 Moderate risk - acceptable range'}
            {summary.riskLevel === 'HIGH' && '🟠 Higher risk - monitor closely'}
            {summary.riskLevel === 'VERY_HIGH' && '🔴 Very high risk - consider reducing exposure'}
          </span>
        </div>
      </div>
    </div>
  );
}
