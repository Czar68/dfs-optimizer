import type { TabId, TabMeta } from '../config/tabs'

interface PrimarySecondaryTabsProps {
  tabs: TabMeta[]
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  topLegsLimit: 25 | 50 | 100
  setTopLegsLimit: (v: 25 | 50 | 100) => void
}

export default function PrimarySecondaryTabs({
  tabs,
  activeTab,
  onTabChange,
  topLegsLimit,
  setTopLegsLimit,
}: PrimarySecondaryTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 pb-2">
      <span className="text-[10px] uppercase tracking-wide text-emerald-300/90">Primary</span>
      <div className="flex gap-1 overflow-x-auto">
        {tabs.filter(tab => tab.kind === 'primary').map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? `bg-gray-800 ${tab.color} ring-1 ring-gray-700`
                : 'text-gray-400 hover:text-gray-200'
            }`}
            title={tab.desc}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500">Secondary</span>
      <div className="flex gap-1 overflow-x-auto">
        {tabs.filter(tab => tab.kind === 'secondary').map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? `bg-gray-800/80 ${tab.color} ring-1 ring-gray-700`
                : 'text-gray-600 hover:text-gray-400'
            }`}
            title={tab.desc}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {(activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud') && (
        <select
          className="ml-auto px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs"
          value={topLegsLimit}
          onChange={e => setTopLegsLimit(Number(e.target.value) as 25 | 50 | 100)}
        >
          <option value={25}>Top 25</option>
          <option value={50}>Top 50</option>
          <option value={100}>Top 100</option>
        </select>
      )}
    </div>
  )
}
