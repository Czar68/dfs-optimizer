import { useState, useEffect, useCallback } from 'react'
import Sidebar, { type SectionId } from './components/Sidebar'
import TopBar from './components/TopBar'
import CardsPanel from './components/CardsPanel'
import ControlPanel from './components/ControlPanel'
import MetricsPanel from './components/MetricsPanel'
import BreakevenPanel from './components/BreakevenPanel'
import LogsPanel from './components/LogsPanel'
import { RunProvider, useRun } from './context/RunContext'

const LIVE_THRESHOLD_MS = 2 * 60 * 60 * 1000 // 2 hours
const FLASH_DURATION_MS = 2000

const SHORTCUTS: { key: string; action: string }[] = [
  { key: '1', action: 'Cards' },
  { key: '2', action: 'Control' },
  { key: '3', action: 'Metrics' },
  { key: '4', action: 'Breakeven' },
  { key: '5', action: 'Logs' },
  { key: 'R', action: 'Refresh data' },
  { key: '?', action: 'This help' },
]

function AppContent() {
  const { lastRunLabel, lastRunMs, bankroll, lastMatchRates, triggerRefresh, onRunTsChange } = useRun()
  const [activeSection, setActiveSection] = useState<SectionId>('cards')
  const [flash, setFlash] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const isLive = lastRunMs != null && Date.now() - lastRunMs < LIVE_THRESHOLD_MS

  useEffect(() => {
    const unregister = onRunTsChange(() => {
      setFlash(true)
      setTimeout(() => setFlash(false), FLASH_DURATION_MS)
    })
    return unregister
  }, [onRunTsChange])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).closest('input, textarea, select')) return
      const key = e.key
      if (key === '1') setActiveSection('cards')
      else if (key === '2') setActiveSection('control')
      else if (key === '3') setActiveSection('metrics')
      else if (key === '4') setActiveSection('breakeven')
      else if (key === '5') setActiveSection('logs')
      else if (key === 'r' || key === 'R') triggerRefresh()
      else if (key === '?') setHelpOpen((open) => !open)
      else if (key === 'Escape' && helpOpen) setHelpOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [triggerRefresh, helpOpen])

  return (
    <div
      className="flex flex-col md:flex-row h-screen overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        lastRunLabel={lastRunLabel}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar isLive={isLive} bankroll={bankroll} matchRates={lastMatchRates} flash={flash} />
        <main className="flex-1 overflow-y-auto min-h-0 pb-8" style={{ background: "var(--color-background-tertiary)" }}>
          {activeSection === 'cards' && <CardsPanel />}
          {activeSection === 'control' && <ControlPanel />}
          {activeSection === 'metrics' && <MetricsPanel />}
          {activeSection === 'breakeven' && <BreakevenPanel />}
          {activeSection === 'logs' && <LogsPanel />}
        </main>
      </div>

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="rounded-lg border p-4 max-w-sm w-full"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
              Keyboard shortcuts
            </div>
            <table className="w-full text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
              <tbody style={{ color: 'var(--text-secondary)' }}>
                {SHORTCUTS.map(({ key, action }) => (
                  <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-1.5 pr-3" style={{ color: 'var(--accent)' }}>{key}</td>
                    <td className="py-1.5">{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Esc or ? to close
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <RunProvider>
      <AppContent />
    </RunProvider>
  )
}
