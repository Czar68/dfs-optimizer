'use client';

import { PrizePicksCard, UnderdogCard, FilterState } from '../types';
import { formatCurrency, formatPercentage, getEvColor, filterCards } from '../lib/dashboard-data';
import { Eye, TrendingUp, AlertTriangle } from 'lucide-react';

interface CardTableProps {
  cards: (PrizePicksCard | UnderdogCard)[];
  filters: FilterState;
  site: 'prizepicks' | 'underdog';
}

export function CardTable({ cards, filters, site }: CardTableProps) {
  const filteredCards = filterCards(cards, filters);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          {site === 'prizepicks' ? 'PrizePicks' : 'Underdog'} Cards
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({filteredCards.length} of {cards.length})
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
                Structure
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Legs
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                EV
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
            {filteredCards.map((card) => (
              <CardRow key={card.id} card={card} />
            ))}
          </tbody>
        </table>
      </div>

      {filteredCards.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No cards match the current filters</p>
        </div>
      )}
    </div>
  );
}

function CardRow({ card }: { card: PrizePicksCard | UnderdogCard }) {
  const evColor = getEvColor(card.ev);
  const riskColor = card.riskAdjustment.includes('FULL') ? 'text-red-600' :
                   card.riskAdjustment.includes('HALF') ? 'text-yellow-600' : 'text-green-600';

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {card.sport}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {card.structure}
        </span>
      </td>
      <td className="px-6 py-4 text-sm text-gray-900">
        <div className="max-w-xs">
          {card.legs.slice(0, 2).map((leg, i) => (
            <div key={i} className="text-xs text-gray-600">
              {leg.player} {leg.stat} {leg.side} {leg.line}
            </div>
          ))}
          {card.legs.length > 2 && (
            <div className="text-xs text-gray-400">
              +{card.legs.length - 2} more
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span className={`font-medium ${evColor}`}>
          {formatPercentage(card.ev)}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {formatPercentage(card.kellyPercentage / 100)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {formatCurrency(card.recommendedStake)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <div className="flex items-center space-x-1">
          <AlertTriangle className={`h-4 w-4 ${riskColor}`} />
          <span className={riskColor}>{card.riskAdjustment}</span>
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
