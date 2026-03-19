export type TabId = 'must_play' | 'strong' | 'all' | 'lottery' | 'top_legs_pp' | 'top_legs_ud' | 'tracker'

export interface TabMeta {
  id: TabId
  label: string
  color: string
  desc: string
  kind: 'primary' | 'secondary'
}

export const TABS: TabMeta[] = [
  { id: 'all', label: 'Cards', color: 'text-emerald-300', desc: 'Primary execution surface for NBA cards', kind: 'primary' },
  { id: 'top_legs_pp', label: 'Top Legs (PP)', color: 'text-blue-300', desc: 'Replacement console for PrizePicks legs', kind: 'primary' },
  { id: 'top_legs_ud', label: 'Top Legs (UD)', color: 'text-orange-300', desc: 'Replacement console for Underdog legs', kind: 'primary' },
  { id: 'must_play', label: 'Tier 1', color: 'text-emerald-400', desc: 'Highest-conviction card subset', kind: 'secondary' },
  { id: 'strong', label: 'Tier 2+', color: 'text-green-400', desc: 'Strong plus Tier 1 cards', kind: 'secondary' },
  { id: 'lottery', label: 'Lottery', color: 'text-amber-400', desc: 'High EV, low hit-rate cards', kind: 'secondary' },
  { id: 'tracker', label: 'Logs / Tracker', color: 'text-cyan-400', desc: 'Grade and track pending cards', kind: 'secondary' },
]

export function getTabMeta(activeTab: TabId): TabMeta {
  return (
    TABS.find((t) => t.id === activeTab) ?? {
      id: activeTab,
      label: activeTab,
      color: 'text-gray-300',
      desc: 'Operator workflow view',
      kind: 'secondary',
    }
  )
}
