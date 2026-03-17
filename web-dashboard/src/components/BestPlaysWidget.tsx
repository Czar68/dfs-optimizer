import { useEffect, useState, useMemo } from 'react'
import Papa from 'papaparse'

declare const __APP_BASE__: string | undefined

const UD_PICKEM_BASE = 'https://app.underdogfantasy.com/pick-em/higher-lower/all/NBA'
const PP_PROJECTIONS = 'https://app.prizepicks.com/projections/nba'

export interface TierCardRow {
  portfolioRank: number
  tier: number
  site: string
  flexType: string
  cardEV: number
  kellyStake?: number
  winProbCash?: number
  avgProb?: number
  confidenceDelta?: number
  leg1Id?: string
  leg2Id?: string
  leg3Id?: string
  leg4Id?: string
  leg5Id?: string
  leg6Id?: string
  runTimestamp?: string
  [key: string]: unknown
}

interface ParlayRow {
  runTimestamp?: string
  gameKey?: string
  legCount?: number
  jointTrueProb?: number
  avgEdge?: number
  legIds?: string
  players?: string
  [key: string]: unknown
}

function getLegIds(row: TierCardRow): string[] {
  return [row.leg1Id, row.leg2Id, row.leg3Id, row.leg4Id, row.leg5Id, row.leg6Id]
    .filter((x): x is string => !!x && typeof x === 'string')
}

/** Deep link URL for a card: UD uses ?legs=id1,id2,...; PP opens projections board. */
function cardDeepLinkUrl(row: TierCardRow): string {
  const legIds = getLegIds(row)
  const site = (row.site ?? '').toString().toUpperCase()
  if (site === 'UD' && legIds.length > 0) {
    const encoded = legIds.map(id => encodeURIComponent(id)).join(',')
    return `${UD_PICKEM_BASE}?legs=${encoded}`
  }
  return PP_PROJECTIONS
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

interface BestPlaysWidgetProps {
  /** Base path for data files (e.g. /data or ./data) */
  dataBase?: string
}

export default function BestPlaysWidget({ dataBase }: BestPlaysWidgetProps) {
  const base = dataBase ?? `${(typeof __APP_BASE__ !== 'undefined' ? __APP_BASE__ : '/').replace(/\/+$/, '')}/data`
  const [tier1, setTier1] = useState<TierCardRow[]>([])
  const [tier2, setTier2] = useState<TierCardRow[]>([])
  const [parlays, setParlays] = useState<ParlayRow[]>([])
  const [tab, setTab] = useState<'cards' | 'parlays'>('cards')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const bust = `?t=${Date.now()}`
    Promise.allSettled([
      parseCsv<TierCardRow>(`${base}/tier1.csv${bust}`),
      parseCsv<TierCardRow>(`${base}/tier2.csv${bust}`),
      parseCsv<ParlayRow>(`${base}/parlays.csv${bust}`),
    ]).then(([r1, r2, r3]) => {
      setLoading(false)
      if (r1.status === 'fulfilled') setTier1(r1.value.filter(r => r && (r.tier != null || r.cardEV != null)))
      else setError(r1.reason?.message ?? 'tier1.csv failed')
      if (r2.status === 'fulfilled') setTier2(r2.value.filter(r => r && (r.tier != null || r.cardEV != null)))
      else if (!error) setError(r2.reason?.message ?? 'tier2.csv failed')
      if (r3.status === 'fulfilled') setParlays(r3.value.filter(r => r && (r.gameKey != null || r.players != null)))
      else if (!error) setError(r3.reason?.message ?? 'parlays.csv failed')
    })
  }, [base])

  const sortedCards = useMemo(() => {
    const combined: (TierCardRow & { _tier?: number })[] = [
      ...tier1.map(r => ({ ...r, _tier: 1 })),
      ...tier2.map(r => ({ ...r, _tier: 2 })),
    ]
    return combined.sort((a, b) => (Number(b.cardEV) || 0) - (Number(a.cardEV) || 0))
  }, [tier1, tier2])

  const sortedParlays = useMemo(() => {
    return [...parlays].sort((a, b) => (Number(b.jointTrueProb) || 0) - (Number(a.jointTrueProb) || 0))
  }, [parlays])

  if (loading) {
    return (
      <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
        <div className="text-amber-400 font-semibold mb-2">Best Plays</div>
        <p className="text-gray-500 text-sm">Loading tier1/tier2…</p>
      </div>
    )
  }

  if (error && sortedCards.length === 0) {
    return (
      <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
        <div className="text-amber-400 font-semibold mb-2">Best Plays</div>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="text-amber-400 font-semibold">Best Plays</div>
        <div className="inline-flex rounded border border-gray-700 overflow-hidden text-xs">
          <button
            className={`px-2 py-1 ${tab === 'cards' ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-800 text-gray-300'}`}
            onClick={() => setTab('cards')}
          >
            Cards
          </button>
          <button
            className={`px-2 py-1 ${tab === 'parlays' ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-800 text-gray-300'}`}
            onClick={() => setTab('parlays')}
          >
            Parlays
          </button>
        </div>
      </div>

      {tab === 'cards' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[320px] overflow-y-auto">
            {sortedCards.slice(0, 24).map((row, i) => {
              const isTier1 = row._tier === 1 || Number(row.tier) === 1
              const evPct = (Number(row.cardEV) || 0) * 100
              const siteLeg = `${String(row.site || '').toLowerCase()}-${String(row.flexType || '').toLowerCase()}`
              const href = cardDeepLinkUrl(row)
              const conf = Number(row.confidenceDelta)
              return (
                <a
                  key={`${row.site}-${row.flexType}-${i}`}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block p-2.5 rounded border text-left transition-colors hover:bg-gray-800/60 ${
                    isTier1
                      ? 'border-amber-500/70 bg-amber-950/20 hover:border-amber-500'
                      : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-medium text-xs ${row.site === 'UD' ? 'text-orange-400' : 'text-blue-400'}`}>
                      {siteLeg}
                    </span>
                    <span className="font-bold text-green-400 text-sm">+{evPct.toFixed(1)}%</span>
                  </div>
                  <div className="text-gray-400 text-[10px] mt-0.5">
                    {row.kellyStake != null ? `$${Number(row.kellyStake).toFixed(2)}` : ''}
                    {row.winProbCash != null ? ` · ${(Number(row.winProbCash) * 100).toFixed(0)}% win` : ''}
                    {row.avgProb != null ? ` · ${(Number(row.avgProb) * 100).toFixed(0)}% avgP` : ''}
                    {Number.isFinite(conf) ? ` · Δ${conf >= 0 ? '+' : ''}${conf.toFixed(2)}` : ''}
                  </div>
                </a>
              )
            })}
          </div>
          {sortedCards.length === 0 && (
            <p className="text-gray-500 text-sm">No tier1/tier2 cards. Run optimizer with --innovative.</p>
          )}
        </>
      ) : (
        <>
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {sortedParlays.slice(0, 20).map((p, idx) => {
              const joint = (Number(p.jointTrueProb) || 0) * 100
              const avgEdge = (Number(p.avgEdge) || 0) * 100
              return (
                <div key={`${p.gameKey}-${idx}`} className="p-2.5 rounded border border-purple-700/40 bg-purple-900/10">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-purple-300 font-medium">{String(p.gameKey || 'Unknown game')}</span>
                    <span className="text-green-400 font-semibold">{joint.toFixed(1)}% joint P</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {Number(p.legCount) || 0} legs · avg edge {avgEdge.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 truncate">{String(p.players || '')}</div>
                </div>
              )
            })}
          </div>
          {sortedParlays.length === 0 && (
            <p className="text-gray-500 text-sm">No parlays exported. Tier-1 legs per game are required.</p>
          )}
        </>
      )}
    </div>
  )
}
