import { useState, useEffect, useCallback, useRef } from 'react'
import {
  runOptimizer,
  getJobStatus,
  getCards,
  getLegs,
  type CardRecord,
  type LegRecord,
  type JobStatusResponse,
} from './api'

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number | undefined, decimals = 1): string {
  if (v === undefined || v === null) return '—'
  return `${(v * 100).toFixed(decimals)}%`
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  })
}

function buildCopyText(card: CardRecord): string {
  const header = `${card.flexType} Card (EV: ${pct(card.cardEv)})`
  const sep = '─'.repeat(30)
  const legLines: string[] = []

  if (card.legs && card.legs.length > 0) {
    for (const leg of card.legs) {
      const p = leg.pick
      legLines.push(`${p.player} – ${p.stat} ${p.line} (${leg.side})`)
    }
  } else if (card.legIds) {
    for (const id of card.legIds) {
      if (id) legLines.push(id)
    }
  }

  return [header, sep, ...legLines].join('\n')
}

// ── Site badge ───────────────────────────────────────────────────────────────

function SiteBadge({ site }: { site: string }) {
  const color = site === 'PP'
    ? 'bg-green-700 text-green-100'
    : 'bg-purple-700 text-purple-100'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {site}
    </span>
  )
}

// ── Run Panel ────────────────────────────────────────────────────────────────

function RunPanel() {
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatusResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startRun = useCallback(async (site: 'pp' | 'ud' | 'both') => {
    setError(null)
    setRunning(true)
    setStatus(null)
    try {
      const resp = await runOptimizer(site)
      setJobId(resp.jobId)

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const s = await getJobStatus(resp.jobId)
          setStatus(s)
          if (s.status !== 'running') {
            stopPolling()
            setRunning(false)
          }
        } catch {
          // keep polling
        }
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRunning(false)
    }
  }, [stopPolling])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h2 className="text-lg font-bold mb-3">Run Optimizer</h2>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => startRun('pp')}
          disabled={running}
          className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
        >
          PrizePicks
        </button>
        <button
          onClick={() => startRun('ud')}
          disabled={running}
          className="px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
        >
          Underdog
        </button>
        <button
          onClick={() => startRun('both')}
          disabled={running}
          className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
        >
          Run Both
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded p-2 text-sm text-red-200 mb-2">
          {error}
        </div>
      )}

      {status && (
        <div className="text-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-400">Job:</span>
            <span className="font-mono text-xs">{jobId}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              status.status === 'running' ? 'bg-yellow-700 text-yellow-100' :
              status.status === 'done' ? 'bg-green-700 text-green-100' :
              'bg-red-700 text-red-100'
            }`}>
              {status.status}
            </span>
            <span className="text-gray-500">
              {(status.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
          {status.log.length > 0 && (
            <pre className="bg-gray-950 rounded p-2 text-xs text-gray-400 max-h-40 overflow-y-auto font-mono">
              {status.log.slice(-20).join('\n')}
            </pre>
          )}
        </div>
      )}

      {running && !status && (
        <div className="text-sm text-yellow-400 animate-pulse">Starting...</div>
      )}
    </div>
  )
}

// ── Cards Table ──────────────────────────────────────────────────────────────

function CardsTable() {
  const [cards, setCards] = useState<CardRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [siteFilter, setSiteFilter] = useState('')
  const [slipFilter, setSlipFilter] = useState('')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const fetchCards = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await getCards({
        site: siteFilter || undefined,
        slip: slipFilter || undefined,
      })
      setCards(resp.cards)
    } catch {
      // silent
    }
    setLoading(false)
  }, [siteFilter, slipFilter])

  useEffect(() => {
    fetchCards()
  }, [fetchCards])

  const handleCopy = (card: CardRecord, idx: number) => {
    copyToClipboard(buildCopyText(card))
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Cards ({cards.length})</h2>
        <div className="flex gap-2 items-center">
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          >
            <option value="">All Sites</option>
            <option value="PP">PrizePicks</option>
            <option value="UD">Underdog</option>
          </select>
          <select
            value={slipFilter}
            onChange={(e) => setSlipFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          >
            <option value="">All Slips</option>
            {['3F','4F','5F','6F','7F','8F','2P','3P','4P','5P','6P'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={fetchCards}
            disabled={loading}
            className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800 text-left">
              <th className="py-2 px-2">Site</th>
              <th className="py-2 px-2">Slip</th>
              <th className="py-2 px-2 text-right">CardEV%</th>
              <th className="py-2 px-2 text-right">WinProb</th>
              <th className="py-2 px-2 text-right">AvgProb</th>
              <th className="py-2 px-2 text-right">AvgEdge%</th>
              <th className="py-2 px-2">Players</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card, i) => (
              <>
                <tr
                  key={i}
                  className="border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer transition-colors"
                  onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                >
                  <td className="py-2 px-2"><SiteBadge site={card.site} /></td>
                  <td className="py-2 px-2 font-mono">{card.flexType}</td>
                  <td className={`py-2 px-2 text-right font-mono font-semibold ${
                    card.cardEv > 0.10 ? 'text-green-400' :
                    card.cardEv > 0.05 ? 'text-green-300' :
                    card.cardEv > 0 ? 'text-yellow-300' : 'text-red-400'
                  }`}>
                    {pct(card.cardEv)}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">{pct(card.winProbCash)}</td>
                  <td className="py-2 px-2 text-right font-mono">{pct(card.avgProb)}</td>
                  <td className="py-2 px-2 text-right font-mono">{card.avgEdgePct?.toFixed(1)}%</td>
                  <td className="py-2 px-2 text-gray-400 text-xs max-w-xs truncate">
                    {card.legs
                      ? card.legs.map(l => l.pick.player).join(', ')
                      : card.legIds?.filter(Boolean).join(', ')}
                  </td>
                  <td className="py-2 px-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopy(card, i) }}
                      className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs transition-colors"
                    >
                      {copiedIdx === i ? 'Copied!' : 'Copy'}
                    </button>
                  </td>
                </tr>
                {expandedIdx === i && card.legs && (
                  <tr key={`${i}-detail`}>
                    <td colSpan={8} className="bg-gray-800/30 px-4 py-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left py-1">Player</th>
                            <th className="text-left py-1">Stat</th>
                            <th className="text-right py-1">Line</th>
                            <th className="text-left py-1">Side</th>
                            <th className="text-right py-1">TrueProb</th>
                            <th className="text-right py-1">Edge</th>
                            <th className="text-left py-1">Book</th>
                          </tr>
                        </thead>
                        <tbody>
                          {card.legs.map((leg, j) => (
                            <tr key={j} className="border-t border-gray-800/50">
                              <td className="py-1 font-medium">{leg.pick.player}</td>
                              <td className="py-1 text-gray-400">{leg.pick.stat}</td>
                              <td className="py-1 text-right font-mono">{leg.pick.line}</td>
                              <td className="py-1">{leg.side}</td>
                              <td className="py-1 text-right font-mono">{pct(leg.pick.trueProb)}</td>
                              <td className="py-1 text-right font-mono">{pct(leg.pick.edge)}</td>
                              <td className="py-1 text-gray-400">{leg.pick.book || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {cards.length === 0 && !loading && (
          <div className="text-center text-gray-500 py-8">
            No cards found. Run an optimizer first.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Legs Browser ─────────────────────────────────────────────────────────────

function LegsBrowser() {
  const [legs, setLegs] = useState<LegRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [siteFilter, setSiteFilter] = useState('')
  const [leagueFilter, setLeagueFilter] = useState('')
  const [search, setSearch] = useState('')

  const fetchLegs = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await getLegs({
        site: siteFilter || undefined,
        league: leagueFilter || undefined,
      })
      setLegs(resp.legs)
    } catch {
      // silent
    }
    setLoading(false)
  }, [siteFilter, leagueFilter])

  useEffect(() => {
    fetchLegs()
  }, [fetchLegs])

  const filtered = search
    ? legs.filter(l => l.player?.toLowerCase().includes(search.toLowerCase()))
    : legs

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Legs ({filtered.length})</h2>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Search player..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm w-40"
          />
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          >
            <option value="">All Sites</option>
            <option value="PP">PrizePicks</option>
            <option value="UD">Underdog</option>
          </select>
          <select
            value={leagueFilter}
            onChange={(e) => setLeagueFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          >
            <option value="">All Leagues</option>
            {['NBA','NFL','NHL','MLB'].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <button
            onClick={fetchLegs}
            disabled={loading}
            className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900">
            <tr className="text-gray-400 border-b border-gray-800 text-left">
              <th className="py-2 px-2">Site</th>
              <th className="py-2 px-2">Player</th>
              <th className="py-2 px-2">Team</th>
              <th className="py-2 px-2">Stat</th>
              <th className="py-2 px-2 text-right">Line</th>
              <th className="py-2 px-2">League</th>
              <th className="py-2 px-2 text-right">TrueProb</th>
              <th className="py-2 px-2 text-right">Edge</th>
              <th className="py-2 px-2 text-right">LegEV</th>
              <th className="py-2 px-2">Book</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((leg, i) => (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors">
                <td className="py-1.5 px-2"><SiteBadge site={leg.site} /></td>
                <td className="py-1.5 px-2 font-medium">{leg.player}</td>
                <td className="py-1.5 px-2 text-gray-400">{leg.team || '—'}</td>
                <td className="py-1.5 px-2">{leg.stat}</td>
                <td className="py-1.5 px-2 text-right font-mono">{leg.line}</td>
                <td className="py-1.5 px-2 text-gray-400">{leg.league}</td>
                <td className="py-1.5 px-2 text-right font-mono">{pct(leg.trueProb)}</td>
                <td className={`py-1.5 px-2 text-right font-mono ${
                  leg.edge > 0.05 ? 'text-green-400' :
                  leg.edge > 0.02 ? 'text-yellow-300' : 'text-gray-300'
                }`}>
                  {pct(leg.edge)}
                </td>
                <td className="py-1.5 px-2 text-right font-mono">{pct(leg.legEv)}</td>
                <td className="py-1.5 px-2 text-gray-400 text-xs">{leg.book || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && !loading && (
          <div className="text-center text-gray-500 py-8">
            No legs found. Run an optimizer first.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────

type Tab = 'cards' | 'legs'

export default function App() {
  const [tab, setTab] = useState<Tab>('cards')

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          NBA Props Optimizer
        </h1>
        <p className="text-gray-500 text-sm">
          PrizePicks + Underdog dashboard
        </p>
      </div>

      {/* Run Panel */}
      <div className="mb-6">
        <RunPanel />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        <button
          onClick={() => setTab('cards')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'cards'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Cards
        </button>
        <button
          onClick={() => setTab('legs')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'legs'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Legs
        </button>
      </div>

      {/* Content */}
      {tab === 'cards' && <CardsTable />}
      {tab === 'legs' && <LegsBrowser />}
    </div>
  )
}
