/**
 * Pick Tracker — view and grade pending cards (Win/Loss/Push per leg).
 * Fetches from GET /api/tracker/cards, saves via POST /api/tracker/cards.
 * Stats from GET /api/tracker/stats; archive via POST /api/tracker/archive; copy via POST /api/tracker/clipboard.
 */

import { useEffect, useState, useCallback } from 'react'

/** Stats response from GET /api/tracker/stats (fully-graded cards from pending + history). */
export interface TrackerStats {
  totalGradedCards: number
  totalCashed: number
  cardWinRatePct: number
  legWinRatePct: number
  roiPct: number
  totalStaked: number
  totalReturn: number
  kellyNetProfitUsd?: number
  kellyStakeUsdSum?: number
  ambiguousGradedCards?: number
  byPlatform: Record<'PP' | 'UD', { total: number; cashed: number; winRatePct: number; roiPct: number }>
  byEvBucket: Record<'<5%' | '5-10%' | '10%+', { total: number; cashed: number; winRatePct: number; roiPct: number }>
  periods?: Partial<Record<'day' | 'week' | 'month' | 'year' | 'lifetime', TrackerStats>>
  topLegs?: Array<{
    key: string
    playerName: string
    market: string
    line: number
    pick: string
    wins: number
    losses: number
    pushes: number
    gradedLegs: number
  }>
  topCards?: Array<{
    cardId: string
    platform: string
    flexType: string
    structureId?: string
    projectedEv: number
    timestamp: string
    grossReturn: number
    ambiguous: boolean
    kellyStakeUsd?: number
    netProfitUsd: number
  }>
  reportingMeta?: { anchor: string }
}

export type LegResult = 'Pending' | 'Win' | 'Loss' | 'Push'

export interface TrackedLeg {
  playerName: string
  market: string
  line: number
  pick: 'Over' | 'Under'
  projectedProb: number
  consensusOdds: number | null
  result: LegResult
}

export interface TrackedCard {
  cardId: string
  platform: 'PP' | 'UD'
  flexType: string
  projectedEv: number
  breakevenGap: number | undefined
  timestamp: string
  legs: TrackedLeg[]
}

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || ''

function statLabel(s: string): string {
  const abbr: Record<string, string> = {
    points: 'Pts', rebounds: 'Reb', assists: 'Ast', threes: '3PM',
    steals: 'Stl', blocks: 'Blk', turnovers: 'TO', pra: 'PRA',
    'pts+reb+ast': 'PRA', points_rebounds_assists: 'PRA',
  }
  return abbr[s?.toLowerCase() ?? ''] ?? s?.replace(/_/g, ' ') ?? s
}

const RESULT_OPTIONS: LegResult[] = ['Pending', 'Win', 'Loss', 'Push']

const RESULT_STYLE: Record<LegResult, string> = {
  Pending: 'bg-gray-700/50 text-gray-300 border-gray-600',
  Win: 'bg-emerald-900/50 text-emerald-300 border-emerald-600',
  Loss: 'bg-red-900/50 text-red-300 border-red-600',
  Push: 'bg-amber-900/50 text-amber-300 border-amber-600',
}

const PERIOD_OPTIONS: { id: keyof NonNullable<TrackerStats['periods']>; label: string }[] = [
  { id: 'lifetime', label: 'Lifetime' },
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
]

export default function PickTracker() {
  const [cards, setCards] = useState<TrackedCard[]>([])
  const [timestamp, setTimestamp] = useState<string | null>(null)
  const [stats, setStats] = useState<TrackerStats | null>(null)
  const [period, setPeriod] = useState<keyof NonNullable<TrackerStats['periods']>>('lifetime')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const fetchCards = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/tracker/cards`)
      const data = await res.json()
      setCards(Array.isArray(data.cards) ? data.cards : [])
      setTimestamp(data.timestamp ?? null)
    } catch (e) {
      setMessage('Failed to load tracker: ' + (e as Error).message)
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tracker/stats`)
      const data = await res.json()
      setStats(data?.totalGradedCards != null ? data : null)
    } catch {
      setStats(null)
    }
  }, [])

  const displayStats: TrackerStats | null =
    stats == null ? null : (stats.periods?.[period] as TrackerStats | undefined) ?? stats

  useEffect(() => {
    fetchCards()
  }, [fetchCards])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const setLegResult = useCallback((cardIndex: number, legIndex: number, result: LegResult) => {
    setCards((prev) => {
      const next = prev.map((card, ci) => {
        if (ci !== cardIndex) return card
        return {
          ...card,
          legs: card.legs.map((leg, li) =>
            li === legIndex ? { ...leg, result } : leg
          ),
        }
      })
      return next
    })
  }, [])

  const saveChanges = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/tracker/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards }),
      })
      const data = await res.json()
      if (data.ok) {
        setMessage(`Saved ${data.count ?? cards.length} cards.`)
        setTimestamp(new Date().toISOString())
      } else {
        setMessage(data.error || 'Save failed')
      }
    } catch (e) {
      setMessage('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [cards])

  const archiveCompleted = useCallback(async () => {
    setArchiving(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/tracker/archive`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setMessage(`Archived ${data.archived} cards. ${data.remaining} pending remaining.`)
        await fetchCards()
        await fetchStats()
      } else {
        setMessage(data.error || 'Archive failed')
      }
    } catch (e) {
      setMessage('Archive failed: ' + (e as Error).message)
    } finally {
      setArchiving(false)
    }
  }, [fetchCards, fetchStats])

  const copyToEntry = useCallback(async (card: TrackedCard) => {
    try {
      const res = await fetch(`${API_BASE}/api/tracker/clipboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card }),
      })
      const data = await res.json()
      const text = data?.text
      if (typeof text !== 'string') throw new Error('No text returned')
      await navigator.clipboard?.writeText(text)
      setMessage('Copied to clipboard.')
      setTimeout(() => setMessage(null), 2000)
    } catch (e) {
      setMessage('Copy failed: ' + (e as Error).message)
    }
  }, [])

  if (loading) {
    return (
      <div className="p-6 text-gray-400">Loading tracker cards…</div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats — ROI & win rate; period rollups (anchor = server time) */}
      {stats && displayStats && (
        <div className="rounded-lg border border-cyan-800/60 bg-gray-900/80 px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-cyan-400 font-semibold text-sm">Performance (graded cards)</div>
            {stats.periods && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Period</span>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as typeof period)}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200"
                >
                  {PERIOD_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {stats.reportingMeta?.anchor && (
            <div className="text-[10px] text-gray-500">
              Anchor: {new Date(stats.reportingMeta.anchor).toLocaleString()} (day/month/year use ET; week = Monday UTC bucket)
            </div>
          )}
          {displayStats.totalGradedCards === 0 ? (
            <div className="text-sm text-gray-500">No fully graded cards in this period.</div>
          ) : (
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-white">ROI: <span className={displayStats.roiPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{displayStats.roiPct >= 0 ? '+' : ''}{displayStats.roiPct.toFixed(1)}%</span></span>
            <span className="text-gray-300">Payout rate: <span className="text-cyan-300">{displayStats.cardWinRatePct.toFixed(1)}%</span> ({displayStats.totalCashed}/{displayStats.totalGradedCards} cards with &gt;0 payout)</span>
            <span className="text-gray-300">Leg Win Rate: <span className="text-cyan-300">{displayStats.legWinRatePct.toFixed(1)}%</span></span>
            {typeof displayStats.kellyNetProfitUsd === 'number' && (
              <span className="text-gray-300">
                Kelly Σ stake: <span className="text-cyan-300">${displayStats.kellyStakeUsdSum?.toFixed(2) ?? '—'}</span>
                {' · '}
                Net P/L: <span className={displayStats.kellyNetProfitUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {displayStats.kellyNetProfitUsd >= 0 ? '+' : ''}{displayStats.kellyNetProfitUsd.toFixed(2)}
                </span>
              </span>
            )}
            {typeof displayStats.ambiguousGradedCards === 'number' && displayStats.ambiguousGradedCards > 0 && (
              <span className="text-amber-400 text-xs">Ambiguous pushes: {displayStats.ambiguousGradedCards} (excluded from payout)</span>
            )}
            <span className="text-gray-500 text-xs">PP: {displayStats.byPlatform.PP.winRatePct.toFixed(0)}% ({displayStats.byPlatform.PP.cashed}/{displayStats.byPlatform.PP.total}) · UD: {displayStats.byPlatform.UD.winRatePct.toFixed(0)}% ({displayStats.byPlatform.UD.cashed}/{displayStats.byPlatform.UD.total})</span>
            <span className="text-gray-500 text-xs">EV &lt;5%: {displayStats.byEvBucket['<5%'].winRatePct.toFixed(0)}% · 5–10%: {displayStats.byEvBucket['5-10%'].winRatePct.toFixed(0)}% · 10%+: {displayStats.byEvBucket['10%+'].winRatePct.toFixed(0)}%</span>
          </div>
          )}
          {stats.topLegs && stats.topLegs.length > 0 && period === 'lifetime' && displayStats.totalGradedCards > 0 && (
            <div className="text-xs text-gray-400 border-t border-gray-800 pt-2 mt-1">
              <span className="text-gray-500 font-medium">Top legs (lifetime, by wins)</span>
              <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto font-mono">
                {stats.topLegs.slice(0, 8).map((r) => (
                  <li key={r.key}>
                    {r.playerName} {r.pick} {r.line} {r.market} — W{r.wins} L{r.losses} P{r.pushes}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-gray-400">
          {timestamp ? `Data: ${new Date(timestamp).toLocaleString()}` : 'No pending cards file yet. Run the optimizer to generate.'}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { fetchCards(); fetchStats(); }}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-sm"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={saveChanges}
            disabled={saving || cards.length === 0}
            className="px-3 py-1.5 bg-green-800 hover:bg-green-700 disabled:opacity-50 disabled:pointer-events-none rounded border border-green-600 text-green-200 text-sm font-medium"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={archiveCompleted}
            disabled={archiving || cards.length === 0}
            className="px-3 py-1.5 bg-cyan-800 hover:bg-cyan-700 disabled:opacity-50 disabled:pointer-events-none rounded border border-cyan-600 text-cyan-200 text-sm font-medium"
          >
            {archiving ? 'Archiving…' : 'Archive Completed'}
          </button>
        </div>
      </div>
      {message && (
        <div className={`px-3 py-2 rounded text-sm ${message.startsWith('Saved') ? 'text-green-400 bg-green-900/30' : 'text-amber-400 bg-amber-900/30'}`}>
          {message}
        </div>
      )}
      {cards.length === 0 ? (
        <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-lg text-gray-500 text-center">
          No pending cards. Run the optimizer to generate <code className="text-gray-400">data/tracking/pending_cards.json</code>.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((card, cardIndex) => (
            <div
              key={card.cardId}
              className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-gray-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{card.platform} {card.flexType}</span>
                  <span className="text-green-400 text-sm">
                    EV: {(card.projectedEv * 100).toFixed(1)}%
                  </span>
                  {card.breakevenGap != null && (
                    <span className="text-cyan-400 text-sm">
                      BE gap: {(card.breakevenGap * 100).toFixed(2)}%
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => copyToEntry(card)}
                  className="px-2 py-1 rounded border border-cyan-600 bg-cyan-900/40 text-cyan-200 text-xs font-medium hover:bg-cyan-800/60"
                >
                  Copy to Entry
                </button>
              </div>
              <ul className="divide-y divide-gray-800">
                {card.legs.map((leg, legIndex) => (
                  <li key={legIndex} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-gray-200 text-sm min-w-0">
                      <span className="font-medium">{leg.playerName}</span>
                      {' '}
                      <span className="text-gray-400">{leg.pick} {leg.line} {statLabel(leg.market)}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {RESULT_OPTIONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setLegResult(cardIndex, legIndex, r)}
                          className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${
                            leg.result === r
                              ? RESULT_STYLE[r]
                              : 'bg-gray-800/50 text-gray-500 border-gray-700 hover:bg-gray-700/50'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
