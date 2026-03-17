/**
 * Control Panel — on static IONOS this shows bench legs from CSV data.
 * API task-launching buttons are hidden when no Express server is available.
 */

import { useEffect, useState, useCallback } from 'react'
import Papa from 'papaparse'

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || ''
const VITE_DATA_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DATA_BASE) || ''
const DATA_BASE = (VITE_DATA_BASE || 'data').replace(/\/+$/, '')

interface LegEntry {
  player?: string
  stat?: string
  line?: number
  edge?: number
  legEv?: number
  scoringWeight?: number
}

function statAbbrev(s: string): string {
  const map: Record<string, string> = {
    points: 'PTS', rebounds: 'REB', assists: 'AST', threes: '3PM',
    blocks: 'BLK', steals: 'STL', points_rebounds_assists: 'PRA',
    points_rebounds: 'PR', points_assists: 'PA', rebounds_assists: 'RA',
  }
  return map[String(s).toLowerCase().replace(/\s+/g, '_')] ?? s
}

function parseCsv<T>(url: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: true,
      complete: (r: { data?: unknown[] }) => resolve((r.data || []) as T[]),
      error: (err: Error) => reject(err),
    })
  })
}

export default function ControlPanel() {
  const [ppLegs, setPpLegs] = useState<LegEntry[]>([])
  const [udLegs, setUdLegs] = useState<LegEntry[]>([])
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchLegs = useCallback(async () => {
    try {
      const [pp, ud] = await Promise.all([
        parseCsv<LegEntry>(`${DATA_BASE}/prizepicks-legs.csv`).catch(() => []),
        parseCsv<LegEntry>(`${DATA_BASE}/underdog-legs.csv`).catch(() => []),
      ])
      const sortByEdge = (a: LegEntry, b: LegEntry) => (Number(b.edge) || 0) - (Number(a.edge) || 0)
      setPpLegs(Array.isArray(pp) ? pp.filter((l) => l.player).sort(sortByEdge).slice(0, 10) : [])
      setUdLegs(Array.isArray(ud) ? ud.filter((l) => l.player).sort(sortByEdge).slice(0, 10) : [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLegs()
    if (API_BASE) {
      fetch(`${API_BASE}/api/config`)
        .then((res) => setApiAvailable(res.ok))
        .catch(() => setApiAvailable(false))
    } else {
      setApiAvailable(false)
    }
  }, [fetchLegs])

  function renderLegTable(legs: LegEntry[], label: string) {
    return (
      <section className="flex flex-col gap-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
        <div className="text-[11px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-muted)' }}>
          {label}
        </div>
        {legs.length === 0 ? (
          <div className="text-[11px] py-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            No legs data. Run the optimizer.
          </div>
        ) : (
          <table className="w-full text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left py-1">Player</th>
                <th className="text-left py-1">Stat</th>
                <th className="text-right py-1">Line</th>
                <th className="text-right py-1">Edge%</th>
                <th className="text-right py-1">EV%</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--text-secondary)' }}>
              {legs.map((leg, i) => {
                const sw = leg.scoringWeight != null ? Number(leg.scoringWeight) : 1
                return (
                  <tr key={`${leg.player}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-1 truncate max-w-[140px]">{leg.player}</td>
                    <td className="py-1">{statAbbrev(String(leg.stat ?? ''))}</td>
                    <td className="py-1 text-right">
                      {Number(leg.line)}
                      {sw < 1 && <span className="ml-1 text-[10px] font-semibold" style={{ color: 'rgba(239,68,68,0.85)' }}>G</span>}
                      {sw > 1 && <span className="ml-1 text-[10px] font-semibold" style={{ color: 'rgba(34,197,94,0.85)' }}>D</span>}
                    </td>
                    <td className="py-1 text-right">{((Number(leg.edge) || 0) * 100).toFixed(1)}%</td>
                    <td className="py-1 text-right" style={{ color: (Number(leg.legEv) || 0) > 0 ? 'var(--accent)' : undefined }}>
                      {((Number(leg.legEv) || 0) * 100).toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    )
  }

  if (loading) {
    return (
      <div className="p-4 font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading control panel...
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-4" style={{ background: 'transparent' }}>
      {apiAvailable === false && (
        <div className="border border-[var(--border)] rounded px-4 py-3 text-xs" style={{ background: 'var(--bg-surface)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          Task controls require a local Express server (VITE_API_URL). On static hosting, use the command line:
          <br />
          <code style={{ color: 'var(--accent)' }}>scripts/run_optimizer.ps1 -Force</code> (full run) or <code style={{ color: 'var(--accent)' }}>npm run web:deploy</code> (deploy only)
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderLegTable(ppLegs, 'TOP PP LEGS (by edge)')}
        {renderLegTable(udLegs, 'TOP UD LEGS (by edge)')}
      </div>

      <section className="flex flex-col gap-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
        <div className="text-[11px] uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-muted)' }}>
          LEGEND
        </div>
        <div className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          <span style={{ color: 'rgba(239,68,68,0.85)' }}>G</span> = Goblin (PP reduced payout) &nbsp;
          <span style={{ color: 'rgba(34,197,94,0.85)' }}>D</span> = Demon (PP boosted) &nbsp;
          <span style={{ color: 'rgba(239,68,68,0.85)' }}>D</span> = UD Discounted (&lt;1×) &nbsp;
          <span style={{ color: 'rgba(34,197,94,0.85)' }}>B</span> = UD Boosted (&gt;1×)
        </div>
        <div className="text-[11px] uppercase tracking-wider mt-2" style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-muted)' }}>
          QUICK COMMANDS
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          <div className="border border-[var(--border)] rounded px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Full run:</span> <code>scripts/run_optimizer.ps1 -Force</code>
          </div>
          <div className="border border-[var(--border)] rounded px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Recalculate:</span> <code>scripts/run_optimizer.ps1 -Force -Recalculate</code>
          </div>
          <div className="border border-[var(--border)] rounded px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Deploy only:</span> <code>npm run web:deploy</code>
          </div>
          <div className="border border-[var(--border)] rounded px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Dry run:</span> <code>scripts/run_optimizer.ps1 -DryRun</code>
          </div>
        </div>
      </section>
    </div>
  )
}
