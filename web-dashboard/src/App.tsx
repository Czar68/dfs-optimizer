import { useEffect, useState, useMemo } from 'react'
import Papa from 'papaparse'
import type { Card, LegInfo, LegsLookup } from './types'
import './index.css'

const STAT_ABBREV: Record<string, string> = {
  points: 'PTS', rebounds: 'REB', assists: 'AST', threes: '3PM',
  steals: 'STL', blocks: 'BLK', fantasy_points: 'FP', pra: 'PRA',
  'pts+reb+ast': 'PRA', points_rebounds_assists: 'PRA',
  'pts+ast': 'PA', 'pts+reb': 'PR', 'reb+ast': 'RA',
  rebounds_assists: 'RA', turnovers: 'TO', stocks: 'STK',
}

function statAbbrev(s: string): string {
  return STAT_ABBREV[s?.toLowerCase() ?? ''] ?? s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''
}

function formatLeg(leg: LegInfo): string {
  return `${leg.player} ${statAbbrev(leg.stat)} o${leg.line}`
}

function deepLink(site: string, legId: string): string {
  if (site === 'UD') {
    return `https://app.underdogfantasy.com/pick-em/higher-lower/all/NBA?legs=${legId}`
  }
  return `https://app.prizepicks.com/entry/${legId}`
}

function parseCsv<T>(url: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: true,
      complete: (results: any) => resolve((results.data || []) as T[]),
      error: (err: Error) => reject(err),
    })
  })
}

function buildLegsLookup(rows: any[]): LegsLookup {
  const map: LegsLookup = new Map()
  for (const r of rows) {
    const id = (r.id ?? '').toString().trim()
    if (!id || !r.player) continue
    map.set(id, { id, player: r.player, stat: r.stat ?? '', line: String(r.line ?? ''), team: r.team ?? '' })
  }
  return map
}

function resolvePlayerPropLine(card: Card, legs: LegsLookup): string {
  if (card.playerPropLine) return card.playerPropLine
  const ids = [card.leg1Id, card.leg2Id, card.leg3Id, card.leg4Id, card.leg5Id, card.leg6Id, card.leg7Id, card.leg8Id].filter((x): x is string => !!x)
  const parts = ids.map((id: string) => {
    const leg = legs.get(id)
    return leg ? formatLeg(leg) : id.split('-').slice(-2).join(' ')
  })
  return parts.join(' | ')
}

function cardKey(c: Card): string {
  const ids = [c.leg1Id, c.leg2Id, c.leg3Id, c.leg4Id, c.leg5Id, c.leg6Id, c.leg7Id, c.leg8Id].filter(Boolean).sort()
  return `${String(c.site ?? '').toUpperCase()}-${c.flexType ?? ''}-${ids.join(',')}`
}

function normalizeRow(row: any): Card | null {
  if (!row || (row.sport == null && row.Sport == null)) return null
  const site = (row.site ?? row.Site ?? '').toString().toUpperCase()
  const cardEv = Number(row.cardEv)
  const kellyStake = Number(row.kellyStake)
  const avgEdgePct = Number(row.avgEdgePct)
  return {
    ...row,
    sport: row.sport ?? row.Sport,
    site: site === 'PP' || site === 'UD' ? site : (row.site ?? row.Site ?? ''),
    siteLeg: row['Site-Leg'] ?? (row.site && row.flexType ? `${String(row.site).toLowerCase()}-${String(row.flexType).toLowerCase()}` : undefined),
    playerPropLine: row['Player-Prop-Line'] ?? undefined,
    cardEv: Number.isFinite(cardEv) ? cardEv : 0,
    kellyStake: Number.isFinite(kellyStake) ? kellyStake : 0,
    avgEdgePct: Number.isFinite(avgEdgePct) ? avgEdgePct : 0,
    winProbCash: Number(row.winProbCash) || undefined,
  } as Card
}

interface LoadStats {
  pp: number; ud: number; ppLegs: number; udLegs: number; error?: string
}

function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [legs, setLegs] = useState<LegsLookup>(new Map())
  const [sportFilter, setSportFilter] = useState('All')
  const [loadStats, setLoadStats] = useState<LoadStats>({ pp: 0, ud: 0, ppLegs: 0, udLegs: 0 })
  const [expandedCard, setExpandedCard] = useState<number | null>(null)

  useEffect(() => {
    const fetchAll = async () => {
      let ppCards: Card[] = [], udCards: Card[] = []
      let errorMsg: string | undefined
      const [ppRes, udRes, ppLegsRes, udLegsRes] = await Promise.allSettled([
        parseCsv<any>('/data/prizepicks-cards.csv'),
        parseCsv<any>('/data/underdog-cards.csv'),
        parseCsv<any>('/data/prizepicks-legs.csv'),
        parseCsv<any>('/data/underdog-legs.csv'),
      ])
      if (ppRes.status === 'fulfilled') ppCards = ppRes.value.map(normalizeRow).filter((c): c is Card => c != null)
      else errorMsg = `PP cards: ${ppRes.reason?.message ?? ppRes.reason}`
      if (udRes.status === 'fulfilled') udCards = udRes.value.map(normalizeRow).filter((c): c is Card => c != null)
      else errorMsg = (errorMsg ? errorMsg + '; ' : '') + `UD cards: ${udRes.reason?.message ?? udRes.reason}`

      const legsMap: LegsLookup = new Map()
      let ppLegCount = 0, udLegCount = 0
      if (ppLegsRes.status === 'fulfilled') {
        const ppL = buildLegsLookup(ppLegsRes.value)
        ppLegCount = ppL.size
        ppL.forEach((v, k) => legsMap.set(k, v))
      }
      if (udLegsRes.status === 'fulfilled') {
        const udL = buildLegsLookup(udLegsRes.value)
        udLegCount = udL.size
        udL.forEach((v, k) => legsMap.set(k, v))
      }
      setLegs(legsMap)

      const merged = [...ppCards, ...udCards]
      const seen = new Set<string>()
      const deduped = merged.filter(c => { const k = cardKey(c); if (seen.has(k)) return false; seen.add(k); return true })
      setCards(deduped)
      setLoadStats({ pp: ppCards.length, ud: udCards.length, ppLegs: ppLegCount, udLegs: udLegCount, error: errorMsg })
      console.log('[Dashboard] PP:', ppCards.length, '| UD:', udCards.length, '| Legs:', legsMap.size, '| Deduped:', deduped.length)
    }
    fetchAll()
    const id = window.setInterval(fetchAll, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const filteredCards = useMemo(() =>
    cards
      .filter(c => sportFilter === 'All' || c.sport === sportFilter)
      .sort((a, b) => {
        const evDiff = Number(b.cardEv) - Number(a.cardEv)
        if (evDiff !== 0) return evDiff
        return (Number(b.kellyStake) || 0) - (Number(a.kellyStake) || 0)
      }),
    [cards, sportFilter]
  )

  const countsBySite = useMemo(() => ({
    PP: cards.filter(c => String(c.site).toUpperCase() === 'PP').length,
    UD: cards.filter(c => String(c.site).toUpperCase() === 'UD').length,
  }), [cards])

  const kellyTrace = useMemo(() => {
    const allStakes = filteredCards.map(c => Number(c.kellyStake) || 0)
    const top30 = allStakes.slice(0, 30)
    return {
      total: allStakes.reduce((s, v) => s + v, 0),
      top30sum: top30.reduce((s, v) => s + v, 0),
      max: Math.max(0, ...allStakes),
      min: allStakes.length ? Math.min(...allStakes.filter(v => v > 0)) : 0,
      count: allStakes.filter(v => v > 0).length,
    }
  }, [filteredCards])

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-4">Props Kelly Dashboard</h1>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <select className="p-2 bg-gray-800 rounded text-sm" onChange={e => setSportFilter(e.target.value)} value={sportFilter}>
          <option>All</option><option>NBA</option><option>NCAAB</option><option>NHL</option><option>NFL</option><option>MLB</option><option>NCAAF</option>
        </select>
        <span className="text-xs text-gray-400">
          PP {countsBySite.PP} | UD {countsBySite.UD} | Filter: {sportFilter} | Showing top 50 by Card EV
        </span>
      </div>

      {/* Debug / Kelly trace panel */}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 bg-gray-800/80 rounded text-xs font-mono">
          <div className="text-amber-300 mb-1 font-semibold">Load Status</div>
          <div>Cards: PP={loadStats.pp} UD={loadStats.ud}</div>
          <div>Legs lookup: PP={loadStats.ppLegs} UD={loadStats.udLegs}</div>
          {loadStats.error && <div className="text-red-400 mt-1">{loadStats.error}</div>}
        </div>
        <div className="p-3 bg-gray-800/80 rounded text-xs font-mono">
          <div className="text-cyan-300 mb-1 font-semibold">Kelly Trace ($600 bankroll, 1.5x conservative)</div>
          <div>Cards with stake &gt; $0: {kellyTrace.count} | Range: ${kellyTrace.min.toFixed(2)} – ${kellyTrace.max.toFixed(2)}</div>
          <div>Top 30 total: ${kellyTrace.top30sum.toFixed(2)} | All total: ${kellyTrace.total.toFixed(2)}</div>
          <div>Formula: sportFrac &times; cardEV &times; bankroll / 1.5 → cap($1 min, $25 max, 3.5% bankroll)</div>
        </div>
      </div>

      {/* Cards table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-800 text-left">
              <th className="p-2">Site-Leg</th>
              <th className="p-2">Player-Prop-Line</th>
              <th className="p-2 text-right">Card EV</th>
              <th className="p-2 text-right">Win%</th>
              <th className="p-2 text-right">Edge%</th>
              <th className="p-2 text-right">Kelly $</th>
            </tr>
          </thead>
          <tbody>
            {filteredCards.slice(0, 50).map((card, i) => {
              const isExpanded = expandedCard === i
              const ppl = resolvePlayerPropLine(card, legs)
              const legIds = [card.leg1Id, card.leg2Id, card.leg3Id, card.leg4Id, card.leg5Id, card.leg6Id, card.leg7Id, card.leg8Id].filter((x): x is string => !!x)
              const siteLeg = card.siteLeg ?? `${String(card.site).toLowerCase()}-${card.flexType?.toLowerCase()}`
              const edgePct = Number(card.avgEdgePct) <= 1 ? Number(card.avgEdgePct) * 100 : Number(card.avgEdgePct)
              const winPct = card.winProbCash ? (Number(card.winProbCash) * 100).toFixed(2) : '—'
              return (
                <>
                  <tr
                    key={`row-${i}`}
                    className="border-b border-gray-700/50 hover:bg-gray-800/60 cursor-pointer"
                    onClick={() => setExpandedCard(isExpanded ? null : i)}
                  >
                    <td className="p-2 whitespace-nowrap font-medium">
                      <span className={card.site === 'PP' ? 'text-blue-400' : 'text-orange-400'}>{siteLeg}</span>
                    </td>
                    <td className="p-2 max-w-lg" title={ppl}>
                      <span className="line-clamp-2">{ppl}</span>
                    </td>
                    <td className="p-2 text-right font-bold text-green-400">{(Number(card.cardEv) * 100).toFixed(1)}%</td>
                    <td className="p-2 text-right text-gray-300">{winPct}%</td>
                    <td className="p-2 text-right">{edgePct.toFixed(1)}%</td>
                    <td className="p-2 text-right font-bold">${(Number(card.kellyStake) || 0).toFixed(2)}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`detail-${i}`} className="bg-gray-800/40">
                      <td colSpan={6} className="p-3">
                        <div className="text-xs font-mono space-y-1">
                          <div className="text-cyan-300 font-semibold mb-1">Leg Detail + Deep Links</div>
                          {legIds.map((lid, j) => {
                            const leg = legs.get(lid)
                            const label = leg ? formatLeg(leg) : lid
                            const link = deepLink(card.site, lid)
                            return (
                              <div key={j} className="flex gap-2 items-baseline">
                                <span className="text-gray-400">#{j + 1}</span>
                                <a href={link} target="_blank" rel="noopener" className="text-blue-300 hover:underline truncate">{label}</a>
                                {leg?.team && <span className="text-gray-500">({leg.team})</span>}
                              </div>
                            )
                          })}
                          <div className="mt-2 pt-2 border-t border-gray-700 text-gray-400">
                            Kelly trace: bankroll=$600 &times; frac={card.kellyFrac || '—'} &times; EV={Number(card.cardEv).toFixed(4)} / 1.5 → ${(Number(card.kellyStake) || 0).toFixed(2)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-gray-500">
        Last update: {new Date().toLocaleString()} | Auto-refresh 60s | Sort: Card EV ↓ then Kelly $
      </p>
    </div>
  )
}

export default App
