'use client';

import { SportsbookSingle, FilterState } from '../types';
import { formatCurrency, formatPercentage, getEvColor, filterSingles } from '../lib/dashboard-data';
import { Eye, TrendingUp, AlertTriangle } from 'lucide-react';

interface SinglesTableProps {
  singles: SportsbookSingle[];
  filters: FilterState;
}

export function SinglesTable({ singles, filters }: SinglesTableProps) {
  const filteredSingles = filterSingles(singles, filters);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          Sportsbook Singles
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({filteredSingles.length} of {singles.length})
          </span>
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sport
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Book
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Market
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Side
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Odds
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Edge
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Kelly
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stake
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Risk
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSingles.map((single) => (
              <SingleRow key={single.id} single={single} />
            ))}
          </tbody>
        </table>
      </div>

      {filteredSingles.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No singles match the current filters</p>
        </div>
      )}
    </div>
  );
}

function SingleRow({ single }: { single: SportsbookSingle }) {
  const edgeColor = getEvColor(single.edge);
  const riskColor = single.riskAdjustment.includes('FULL') ? 'text-red-600' :
                   single.riskAdjustment.includes('HALF') ? 'text-yellow-600' : 'text-green-600';

  const oddsColor = single.odds > 0 ? 'text-green-600' : 'text-red-600';

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {single.sport}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          {single.book}
        </span>
      </td>
      <td className="px-6 py-4 text-sm text-gray-900">
        <div className="max-w-xs">
          <div className="text-xs text-gray-600">
            {single.market}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          single.side === 'over' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {single.side}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span className={`font-medium ${oddsColor}`}>
          {single.odds > 0 ? '+' : ''}{single.odds}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span className={`font-medium ${edgeColor}`}>
          {formatPercentage(single.edge)}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {formatPercentage(single.kellyPercentage / 100)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {formatCurrency(single.recommendedStake)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <div className="flex items-center space-x-1">
          <AlertTriangle className={`h-4 w-4 ${riskColor}`} />
          <span className={riskColor}>{single.riskAdjustment}</span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        <button className="text-blue-600 hover:text-blue-900">
          <Eye className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
