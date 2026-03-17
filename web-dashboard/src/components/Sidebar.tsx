import { LayoutGrid, PlayCircle, BarChart2, Percent, Terminal } from 'lucide-react'

export type SectionId = 'cards' | 'control' | 'metrics' | 'breakeven' | 'logs'

const NAV_ITEMS: { id: SectionId; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'cards', label: 'Cards', icon: LayoutGrid },
  { id: 'control', label: 'Control', icon: PlayCircle },
  { id: 'metrics', label: 'Metrics', icon: BarChart2 },
  { id: 'breakeven', label: 'Breakeven', icon: Percent },
  { id: 'logs', label: 'Logs', icon: Terminal },
]

interface SidebarProps {
  activeSection: SectionId
  onSelect: (id: SectionId) => void
  lastRunLabel: string | null
}

export default function Sidebar({ activeSection, onSelect, lastRunLabel }: SidebarProps) {
  const navContent = (
    <>
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = activeSection === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`flex items-center gap-2 transition-colors ${!isActive ? 'hover:bg-[var(--bg-elevated)]' : ''}`}
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '13px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              background: isActive ? 'var(--bg-elevated)' : 'transparent',
              borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
            }}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </>
  )

  return (
    <>
      {/* Mobile: top tab bar */}
      <aside
        className="md:hidden shrink-0 flex flex-row items-center gap-1 px-2 py-2 border-b border-[var(--border)] overflow-x-auto"
        style={{ background: 'var(--bg-surface)' }}
      >
        <div
          className="text-[10px] font-medium tracking-wider shrink-0 mr-2"
          style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
        >
          PROPS
        </div>
        <div className="flex gap-0.5 flex-1 min-w-0">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-left transition-colors shrink-0"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '11px',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--bg-elevated)' : 'transparent',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            )
          })}
        </div>
        <div className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {lastRunLabel ?? '—'}
        </div>
      </aside>

      {/* Desktop: left sidebar */}
      <aside
        className="hidden md:flex w-[200px] shrink-0 flex-col border-r border-[var(--border)]"
        style={{ background: 'var(--bg-surface)' }}
      >
        <div className="p-3 border-b border-[var(--border)]">
          <div
            className="text-[11px] font-medium tracking-[0.15em]"
            style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
          >
            PROPS OPT
          </div>
        </div>
        <nav className="flex-1 py-2 flex flex-col">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                className={`w-full h-10 flex items-center gap-2 px-3 text-left transition-colors ${!isActive ? 'hover:bg-[var(--bg-elevated)]' : ''}`}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '13px',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--bg-elevated)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            )
          })}
        </nav>
        <div
          className="p-3 border-t border-[var(--border)] text-[10px] whitespace-pre-line"
          style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
        >
          LAST RUN
          {'\n'}
          {lastRunLabel ?? '—'}
        </div>
      </aside>
    </>
  )
}
