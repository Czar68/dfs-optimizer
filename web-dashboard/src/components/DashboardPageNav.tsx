export type DashboardPageId = 'overview' | 'explore' | 'diagnostics'

const PAGES: { id: DashboardPageId; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Run health & verdict' },
  { id: 'explore', label: 'Explore Legs', hint: 'Tables & cards' },
  { id: 'diagnostics', label: 'Diagnostics', hint: 'Audit & validation' },
]

interface Props {
  active: DashboardPageId
  onChange: (id: DashboardPageId) => void
}

export default function DashboardPageNav({ active, onChange }: Props) {
  return (
    <nav
      className="flex flex-wrap gap-1 p-1 rounded-lg bg-zinc-900/50 border border-zinc-800/60"
      aria-label="Dashboard sections"
    >
      {PAGES.map((p) => {
        const isOn = active === p.id
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            title={p.hint}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isOn
                ? 'bg-zinc-100 text-zinc-900 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            {p.label}
          </button>
        )
      })}
    </nav>
  )
}

export function dashboardPageFromSearch(search: string): DashboardPageId {
  const p = new URLSearchParams(search).get('page')
  if (p === 'explore' || p === 'diagnostics') return p
  return 'overview'
}
