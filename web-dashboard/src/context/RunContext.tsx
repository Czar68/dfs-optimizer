import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || ''
const VITE_DATA_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DATA_BASE) || ''
// Use VITE_DATA_BASE when set (production); else fallback to "data" for static host (avoids API_BASE/artifacts/... 404 on IONOS)
const DATA_BASE_FOR_POLL = VITE_DATA_BASE || 'data'
const LAST_RUN_URL = `${DATA_BASE_FOR_POLL}/last_run.json`.replace(/\/+/g, '/')
const MATCH_RATE_HISTORY_URL = `${DATA_BASE_FOR_POLL}/match_rate_history.csv`.replace(/\/+/g, '/')
const POLL_MS = 60_000

interface LastRunData {
  ts?: string
  bankroll?: number
}

function parseLastRunTs(ts: string | undefined): { label: string; ms: number } | null {
  if (ts == null) return null
  const s = String(ts).trim()
  if (!s) return null
  // Accept YYYYMMDD-HHMM or YYYYMMDD-HHMMSS (optimizer writes slice(0,15) => no seconds)
  const m = s.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})?$/)
  if (!m) return null
  const [, y, mo, d, h, min, sec] = m
  const secNum = sec != null && sec !== '' ? parseInt(sec, 10) : 0
  const ms = new Date(
    parseInt(y!, 10),
    parseInt(mo!, 10) - 1,
    parseInt(d!, 10),
    parseInt(h!, 10),
    parseInt(min!, 10),
    secNum
  ).getTime()
  const label = `${y}${mo}${d} ${h}:${min}`
  return { label, ms }
}

export interface MatchRates {
  pp: number
  ud: number
}

interface RunContextValue {
  lastRunLabel: string | null
  lastRunMs: number | null
  bankroll: number | null
  lastMatchRates: MatchRates | null
  refreshTrigger: number
  triggerRefresh: () => void
  onRunTsChange: (callback: () => void) => void
}

const RunContext = createContext<RunContextValue | null>(null)

export function RunProvider({
  children,
  onRunTsChange,
}: {
  children: React.ReactNode
  onRunTsChange?: (ts: string | null) => void
}) {
  const [lastRunLabel, setLastRunLabel] = useState<string | null>(null)
  const [lastRunMs, setLastRunMs] = useState<number | null>(null)
  const [bankroll, setBankroll] = useState<number | null>(null)
  const [lastMatchRates, setLastMatchRates] = useState<MatchRates | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const changeCallbacksRef = useRef<(() => void)[]>([])

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((n) => n + 1)
  }, [])

  const onRunTsChangeRegister = useCallback((cb: () => void) => {
    changeCallbacksRef.current = [...changeCallbacksRef.current, cb]
    return () => {
      changeCallbacksRef.current = changeCallbacksRef.current.filter((f) => f !== cb)
    }
  }, [])

  const lastTsRef = useRef<string | null>(null)
  useEffect(() => {
    function parseMatchRateCsv(text: string): MatchRates | null {
      const lines = text.trim().split(/\r?\n/).filter(Boolean)
      if (lines.length < 2) return null
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
      const ppIdx = headers.indexOf('pp_rate')
      const udIdx = headers.indexOf('ud_rate')
      if (ppIdx === -1 || udIdx === -1) return null
      const lastRow = lines[lines.length - 1].split(',')
      const ppRaw = parseFloat(lastRow[ppIdx] ?? '')
      const udRaw = parseFloat(lastRow[udIdx] ?? '')
      if (!Number.isFinite(ppRaw) || !Number.isFinite(udRaw)) return null
      // CSV columns are canonical: pp_rate = PrizePicks, ud_rate = Underdog.
      // TopBar badges use this struct directly, so keep mapping 1:1.
      return { pp: ppRaw, ud: udRaw }
    }
    const poll = () => {
      Promise.all([
        fetch(LAST_RUN_URL, { cache: 'no-store' }).then((res) => (res.ok ? res.json() : null)),
        fetch(MATCH_RATE_HISTORY_URL, { cache: 'no-store' }).then((res) => (res.ok ? res.text() : '')),
      ]).then(([data, csvText]) => {
        if (data) {
          const tsStr = data.ts != null ? String(data.ts) : null
          const parsed = parseLastRunTs(tsStr ?? undefined)
          if (parsed) {
            setLastRunLabel(parsed.label)
            setLastRunMs(parsed.ms)
            const prevTs = lastTsRef.current
            if (tsStr != null && prevTs !== null && tsStr !== prevTs) {
              onRunTsChange?.(tsStr)
              changeCallbacksRef.current.forEach((cb) => cb())
              setRefreshTrigger((n) => n + 1)
            }
            if (tsStr != null) lastTsRef.current = tsStr
          }
          if (typeof data.bankroll === 'number') setBankroll(data.bankroll)
        }
        const rates = csvText ? parseMatchRateCsv(csvText) : null
        setLastMatchRates(rates)
      }).catch(() => {})
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [onRunTsChange])

  const value: RunContextValue = {
    lastRunLabel,
    lastRunMs,
    bankroll,
    lastMatchRates,
    refreshTrigger,
    triggerRefresh,
    onRunTsChange: onRunTsChangeRegister,
  }

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>
}

export function useRun() {
  const ctx = useContext(RunContext)
  if (!ctx) throw new Error('useRun must be used within RunProvider')
  return ctx
}
