import { useEffect, useState, useCallback } from 'react'

const VITE_DATA_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DATA_BASE) || ''
const DATA_BASE = (VITE_DATA_BASE || 'data').replace(/\/+$/, '')
const LAST_RUN_URL = `${DATA_BASE}/last_run.json`.replace(/\/+/g, '/')

interface LastRunData {
  flow?: string
  status?: string
  ts?: string
  error?: string
  metrics?: {
    pp_legs?: number
    ud_cards?: number
    tier1?: number
    tier2?: number
    sheets_pushed?: boolean
    telegram_sent?: boolean
  }
  bankroll?: number
}

function formatTs(ts: string | undefined): string {
  if (!ts) return '—'
  const m = String(ts).match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})?$/)
  if (!m) return ts
  const [, y, mo, d, h, min, sec] = m
  const secStr = sec ?? '00'
  return `${y}-${mo}-${d} ${h}:${min}:${secStr}`
}

function statusColor(status: string | undefined): string {
  if (status === 'success') return 'var(--color-text-success)'
  if (status === 'failed') return 'var(--color-text-danger)'
  if (status === 'dry_run_ok') return 'var(--warn)'
  return 'var(--text-secondary)'
}

export default function LogsPanel() {
  const [data, setData] = useState<LastRunData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(LAST_RUN_URL, { cache: 'no-store' })
      if (!res.ok) {
        setError('last_run.json not found — run the optimizer first')
        return
      }
      const json = await res.json() as LastRunData
      setData(json)
      setError(null)
    } catch {
      setError('Failed to load run data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  if (loading && !data && !error) {
    return (
      <div className="h-full min-h-[200px] flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Loading run data...
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="h-full min-h-[200px] flex items-center justify-center text-sm font-mono p-4" style={{ color: 'var(--text-muted)' }}>
        {error}
      </div>
    )
  }

  const m = data?.metrics
  const metricRows: { label: string; value: string; color?: string }[] = []
  if (data) {
    metricRows.push({ label: 'Flow', value: data.flow ?? '—' })
    metricRows.push({ label: 'Status', value: (data.status ?? '—').toUpperCase(), color: statusColor(data.status) })
    metricRows.push({ label: 'Timestamp', value: formatTs(data.ts) })
    if (data.error) metricRows.push({ label: 'Error', value: data.error, color: 'var(--color-text-danger)' })
    if (data.bankroll != null) metricRows.push({ label: 'Bankroll', value: `$${data.bankroll}` })
    if (m) {
      metricRows.push({ label: 'PP Legs', value: String(m.pp_legs ?? 0) })
      metricRows.push({ label: 'UD Cards', value: String(m.ud_cards ?? 0) })
      metricRows.push({ label: 'Tier 1', value: String(m.tier1 ?? 0) })
      metricRows.push({ label: 'Tier 2', value: String(m.tier2 ?? 0) })
      metricRows.push({ label: 'Sheets Pushed', value: m.sheets_pushed ? 'Yes' : 'No', color: m.sheets_pushed ? 'var(--color-text-success)' : 'var(--text-muted)' })
      metricRows.push({ label: 'Telegram Sent', value: m.telegram_sent ? 'Yes' : 'No', color: m.telegram_sent ? 'var(--color-text-success)' : 'var(--text-muted)' })
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-4 gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-primary)' }}>
          Last Run Summary
        </h2>
        <button
          type="button"
          onClick={fetchData}
          className="px-3 py-1.5 text-[11px] uppercase rounded border transition-colors"
          style={{ fontFamily: 'var(--font-ui)', borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
        >
          Refresh
        </button>
      </div>

      <div className="border border-[var(--border)] rounded overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        <table className="w-full text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
          <tbody>
            {metricRows.map((row) => (
              <tr key={row.label} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="px-4 py-2.5 text-left whitespace-nowrap" style={{ color: 'var(--text-muted)', width: '140px' }}>
                  {row.label}
                </td>
                <td className="px-4 py-2.5 text-left font-medium" style={{ color: row.color ?? 'var(--text-primary)' }}>
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.status === 'success' && m && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'PP LEGS', value: m.pp_legs ?? 0, accent: true },
            { label: 'UD CARDS', value: m.ud_cards ?? 0, accent: true },
            { label: 'TIER 1', value: m.tier1 ?? 0, accent: (m.tier1 ?? 0) > 0 },
            { label: 'TIER 2', value: m.tier2 ?? 0, accent: (m.tier2 ?? 0) > 0 },
          ].map((card) => (
            <div key={card.label} className="border border-[var(--border)] rounded p-3 text-center" style={{ background: 'var(--bg-surface)' }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                {card.label}
              </div>
              <div className="text-2xl font-bold" style={{ color: card.accent ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-[10px] mt-2" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Data source: last_run.json (updated after each optimizer run + deploy)
      </div>
    </div>
  )
}
