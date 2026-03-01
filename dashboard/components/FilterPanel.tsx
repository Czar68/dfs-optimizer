'use client';

import { FilterState, DashboardData } from '../types';
import { X, Filter } from 'lucide-react';

interface FilterPanelProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  data: DashboardData;
  type: 'cards' | 'singles';
}

export function FilterPanel({ filters, onFiltersChange, data, type }: FilterPanelProps) {
  // Get unique values from data
  const sports = Array.from(new Set([
    ...data.prizepicksCards.map(c => c.sport),
    ...data.underdogCards.map(c => c.sport),
    ...data.sportsbookSingles.map(s => s.sport),
  ]));

  const structures = Array.from(new Set([
    ...data.prizepicksCards.map(c => c.structure),
    ...data.underdogCards.map(c => c.structure),
  ]));

  const sites = Array.from(new Set([
    ...data.prizepicksCards.map(c => c.site),
    ...data.underdogCards.map(c => c.site),
  ]));

  const books = Array.from(new Set(
    data.sportsbookSingles.map(s => s.book)
  ));

  const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'];

  const updateFilter = (key: keyof FilterState, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const toggleArrayFilter = (key: keyof FilterState, value: string) => {
    const currentArray = filters[key] as string[];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    updateFilter(key, newArray);
  };

  const clearFilters = () => {
    onFiltersChange({
      sports: [],
      structures: [],
      sites: [],
      minEv: 0.05,
      minKelly: 0.5,
      riskLevels: [],
    });
  };

  const hasActiveFilters = filters.sports.length > 0 ||
    filters.structures.length > 0 ||
    filters.sites.length > 0 ||
    filters.minEv > 0.05 ||
    filters.minKelly > 0.5 ||
    filters.riskLevels.length > 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Filter className="h-5 w-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            <X className="h-3 w-3" />
            <span>Clear All</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Sport Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Sport</label>
          <div className="space-y-2">
            {sports.map(sport => (
              <label key={sport} className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.sports.includes(sport)}
                  onChange={() => toggleArrayFilter('sports', sport)}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{sport}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Structure Filter (only for cards) */}
        {type === 'cards' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Structure</label>
            <div className="space-y-2">
              {structures.map(structure => (
                <label key={structure} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.structures.includes(structure)}
                    onChange={() => toggleArrayFilter('structures', structure)}
                    className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{structure}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Site/Book Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {type === 'cards' ? 'Site' : 'Book'}
          </label>
          <div className="space-y-2">
            {(type === 'cards' ? sites : books).map(site => (
              <label key={site} className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.sites.includes(site)}
                  onChange={() => toggleArrayFilter('sites', site)}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{site}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Min EV/Edge Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Min {type === 'cards' ? 'EV' : 'Edge'}
          </label>
          <input
            type="range"
            min="0"
            max="0.20"
            step="0.01"
            value={filters.minEv}
            onChange={(e) => updateFilter('minEv', parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="text-sm text-gray-600">
            {(filters.minEv * 100).toFixed(1)}%
          </div>
        </div>

        {/* Min Kelly Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Min Kelly %</label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={filters.minKelly}
            onChange={(e) => updateFilter('minKelly', parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="text-sm text-gray-600">
            {filters.minKelly.toFixed(1)}%
          </div>
        </div>

        {/* Risk Level Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Risk Level</label>
          <div className="space-y-2">
            {riskLevels.map(level => (
              <label key={level} className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.riskLevels.includes(level)}
                  onChange={() => toggleArrayFilter('riskLevels', level)}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{level}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
