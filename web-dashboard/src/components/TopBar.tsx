import type { MatchRates } from '../context/RunContext'

interface TopBarProps {
  isLive: boolean
  bankroll: number | null
  matchRates: MatchRates | null
  flash?: boolean
}

const VITE_ESPN = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ENABLE_ESPN_ENRICHMENT) === 'true'
const VITE_FANTASY = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ENABLE_FANTASY_EV) === 'true'
const VITE_CALIB = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ENABLE_CALIBRATION_ADJEV) === 'true'

function FlagPill({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-medium"
      style={{
        background: on ? 'var(--color-background-success)' : 'var(--bg-elevated)',
        color: on ? 'var(--color-text-success)' : 'var(--text-muted)',
        border: '0.5px solid',
        borderColor: on ? 'var(--color-border-success)' : 'var(--border)',
      }}
    >
      {label} {on ? 'on' : 'off'}
    </span>
  )
}

export default function TopBar({ isLive, bankroll, matchRates, flash }: TopBarProps) {
  const now = new Date()
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <header
      className="h-12 shrink-0 grid grid-cols-3 items-center px-4 border-b border-[var(--border)]"
      style={{ background: 'var(--bg-surface)' }}
    >
      <div className={`flex items-center gap-2 flex-wrap ${flash ? 'flash-pulse' : ''}`}>
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: isLive ? 'var(--accent)' : 'var(--text-muted)' }}
          aria-hidden
        />
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
        >
          {isLive ? 'LIVE' : 'STALE'}
        </span>
        {matchRates != null && (
          <span className="text-[10px] font-mono shrink-0">
            <span style={{ color: 'var(--accent)' }}>PP {matchRates.pp.toFixed(0)}%</span>
            <span style={{ color: 'var(--text-muted)' }}> | </span>
            <span style={{ color: 'var(--warn)' }}>UD {matchRates.ud.toFixed(0)}%</span>
          </span>
        )}
      </div>
      <div
        className="text-xs text-center"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
      >
        {dateStr}
      </div>
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <span className="flex items-center gap-1.5">
          <FlagPill label="ESPN" on={VITE_ESPN} />
          <FlagPill label="FantasyEV" on={VITE_FANTASY} />
          <FlagPill label="CalibAdj" on={VITE_CALIB} />
        </span>
        <span
          className="text-xs"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
        >
          BANKROLL ${bankroll ?? '—'}
        </span>
        <span
          className="text-xs text-[var(--text-muted)] cursor-default"
          title="Keyboard shortcuts"
        >
          [?]
        </span>
      </div>
    </header>
  )
}
