import { useEffect, useState, useMemo, useCallback } from 'react'
import Papa from 'papaparse'
import type { Card, LegInfo, LegsLookup, BestBetTier } from './types'
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

/** Copy-paste format: "Player STAT o1.5, Player2 STAT2 o2.5" */
function formatParlayCopy(legIds: string[], legs: LegsLookup): string {
  return legIds
    .map(id => { const l = legs.get(id); return l ? formatLeg(l) : id })
    .join(', ')
}

/** Slug for player profile URLs */
function playerSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'player'
}

// ── Deeplinks (max effort: full-slip + player profiles + fallbacks) ─────────

const UD_PICKEM_BASE = 'https://app.underdogfantasy.com/pick-em/higher-lower/all/NBA'
const UD_PLAYER_BASE = 'https://app.underdogfantasy.com/player'
const PP_PROJECTIONS = 'https://app.prizepicks.com/projections/nba'
const PP_PLAYER_BASE = 'https://app.prizepicks.com/player'

/** UD full-slip: legs param with comma-separated leg IDs (app may or may not prefill) */
function udFullSlipUrl(legIds: string[]): string {
  if (!legIds.length) return UD_PICKEM_BASE
  const encoded = legIds.map(id => encodeURIComponent(id)).join(',')
  return `${UD_PICKEM_BASE}?legs=${encoded}`
}

/** Per-leg: UD pick-em board (same for all legs); PP projections */
function perLegBoardLink(site: string): string {
  return site === 'UD' ? UD_PICKEM_BASE : PP_PROJECTIONS
}

/** Player profile URL by site */
function playerProfileUrl(site: string, playerName: string): string {
  const slug = playerSlug(playerName)
  return site === 'UD' ? `${UD_PLAYER_BASE}/${slug}` : `${PP_PLAYER_BASE}/${slug}`
}

const LEG_PEN: Record<number, number> = { 2: 1, 3: 1, 4: 1, 5: 0.95, 6: 0.85, 7: 0.55, 8: 0.30 }
function clientScore(c: Card): { score: number; tier: BestBetTier; label: string; reason: string } {
  const edge = Number(c.avgEdgePct) <= 1 ? Number(c.avgEdgePct) : Number(c.avgEdgePct) / 100
  const winProb = Number(c.winProbCash) || 0
  const legCount = getLegIds(c).length
  const legPen = LEG_PEN[legCount] ?? (legCount > 8 ? 0.2 : 1)
  const kellyFrac = 0.25
  const score = edge * winProb * kellyFrac * legPen

  if (score >= 0.0008 && winProb >= 0.10 && legCount <= 5 && edge >= 0.05) {
    return { score, tier: 'must_play', label: 'Must Play', reason: `High score, ${(winProb*100).toFixed(0)}% win, ${legCount} legs` }
  }
  if (score >= 0.0004 && winProb >= 0.05 && legCount <= 6) {
    return { score, tier: 'strong', label: 'Strong Play', reason: `Good score, ${(winProb*100).toFixed(0)}% win, ${legCount} legs` }
  }
  if (score >= 0.0001 && winProb >= 0.03) {
    return { score, tier: 'small', label: 'Small Play', reason: `Moderate score, ${(winProb*100).toFixed(1)}% win` }
  }
  if (Number(c.cardEv) >= 0.10) {
    return { score, tier: 'lottery', label: 'Lottery', reason: `High EV but ${(winProb*100).toFixed(1)}% win prob` }
  }
  return { score, tier: 'skip', label: 'Skip', reason: `Below thresholds` }
}

function getLegIds(c: Card): string[] {
  return [c.leg1Id, c.leg2Id, c.leg3Id, c.leg4Id, c.leg5Id, c.leg6Id, c.leg7Id, c.leg8Id].filter((x): x is string => !!x)
}

function parseCsv<T>(url: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true, header: true, dynamicTyping: true,
      complete: (r: any) => resolve((r.data || []) as T[]),
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
  const ids = getLegIds(card)
  return ids.map(id => { const l = legs.get(id); return l ? formatLeg(l) : id.split('-').slice(-2).join(' ') }).join(' | ')
}
function cardKey(c: Card): string {
  const ids = getLegIds(c).sort()
  return `${String(c.site ?? '').toUpperCase()}-${c.flexType ?? ''}-${ids.join(',')}`
}
function normalizeRow(row: any): Card | null {
  if (!row || (row.sport == null && row.Sport == null)) return null
  const site = (row.site ?? row.Site ?? '').toString().toUpperCase()
  const cardEv = Number(row.cardEv)
  const kellyStake = Number(row.kellyStake)
  const avgEdgePct = Number(row.avgEdgePct)
  const bbScore = Number(row.bestBetScore)
  const rawTier = (row.bestBetTier ?? '').toString().toLowerCase()
  const validTiers: BestBetTier[] = ['must_play', 'strong', 'small', 'lottery', 'skip']
  const tier = validTiers.includes(rawTier as BestBetTier) ? rawTier as BestBetTier
    : rawTier === 'core' ? 'strong' as BestBetTier : undefined
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
    bestBetScore: Number.isFinite(bbScore) ? bbScore : undefined,
    bestBetTier: tier,
  } as Card
}

interface Manifest {
  fresh_run_completed_at?: string;
  bankroll?: number;
  csv_stats?: Record<string, { rows: number; modified: string; size: number }>;
  build_assets?: { js: string; css: string };
}

type TabId = 'must_play' | 'strong' | 'all' | 'lottery'
const TABS: { id: TabId; label: string; color: string; desc: string }[] = [
  { id: 'must_play', label: 'Must Play', color: 'text-emerald-400', desc: 'Highest-conviction, short-leg, high-win-prob plays' },
  { id: 'strong', label: 'Strong', color: 'text-green-400', desc: 'Good score + reasonable win probability' },
  { id: 'all', label: 'All Cards', color: 'text-gray-300', desc: 'Everything sorted by EV' },
  { id: 'lottery', label: 'Lottery', color: 'text-amber-400', desc: 'High EV but low win probability' },
]

const TIER_STYLE: Record<string, string> = {
  must_play: 'bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-500/30',
  strong:    'bg-green-900/50 text-green-300',
  small:     'bg-blue-900/40 text-blue-300',
  lottery:   'bg-amber-900/50 text-amber-300',
  skip:      'bg-gray-700/40 text-gray-500',
  core:      'bg-green-900/50 text-green-300',
}
const TIER_LABEL: Record<string, string> = {
  must_play: 'Must Play', strong: 'Strong', small: 'Small', lottery: 'Lottery', skip: 'Skip', core: 'Strong',
}

interface LoadStats { pp: number; ud: number; ppLegs: number; udLegs: number; error?: string }

function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [legs, setLegs] = useState<LegsLookup>(new Map())
  const [sportFilter, setSportFilter] = useState('All')
  const [activeTab, setActiveTab] = useState<TabId>('must_play')
  const [loadStats, setLoadStats] = useState<LoadStats>({ pp: 0, ud: 0, ppLegs: 0, udLegs: 0 })
  const [expandedCard, setExpandedCard] = useState<number | null>(null)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [copyStatus, setCopyStatus] = useState<string>('')

  useEffect(() => {
    fetch('/data/last_fresh_run.json')
      .then(r => r.ok ? r.json() : null)
      .then(m => { if (m) setManifest(m) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const DATA_BASE = '/data'
    const ppCardsUrl = `${DATA_BASE}/prizepicks-cards.csv`
    const udCardsUrl = `${DATA_BASE}/underdog-cards.csv`
    const ppLegsUrl = `${DATA_BASE}/prizepicks-legs.csv`
    const udLegsUrl = `${DATA_BASE}/underdog-legs.csv`

    const fetchAll = async () => {
      let ppCards: Card[] = [], udCards: Card[] = []
      let errorMsg: string | undefined
      const [ppRes, udRes, ppLegsRes, udLegsRes] = await Promise.allSettled([
        parseCsv<any>(ppCardsUrl),
        parseCsv<any>(udCardsUrl),
        parseCsv<any>(ppLegsUrl),
        parseCsv<any>(udLegsUrl),
      ])
      if (ppRes.status === 'fulfilled') ppCards = ppRes.value.map(normalizeRow).filter((c): c is Card => c != null)
      else errorMsg = `PP cards: ${ppRes.reason?.message ?? ppRes.reason}`
      if (udRes.status === 'fulfilled') udCards = udRes.value.map(normalizeRow).filter((c): c is Card => c != null)
      else errorMsg = (errorMsg ? errorMsg + '; ' : '') + `UD cards: ${udRes.reason?.message ?? udRes.reason}`

      const legsMap: LegsLookup = new Map()
      let ppLegCount = 0, udLegCount = 0
      if (ppLegsRes.status === 'fulfilled') { const m = buildLegsLookup(ppLegsRes.value); ppLegCount = m.size; m.forEach((v, k) => legsMap.set(k, v)) }
      if (udLegsRes.status === 'fulfilled') { const m = buildLegsLookup(udLegsRes.value); udLegCount = m.size; m.forEach((v, k) => legsMap.set(k, v)) }

      console.log('[Dashboard] Live data validation:', {
        PP: { source: ppCardsUrl, cards: ppCards.length, legsSource: ppLegsUrl, legs: ppLegCount },
        UD: { source: udCardsUrl, cards: udCards.length, legsSource: udLegsUrl, legs: udLegCount },
      })

      setLegs(legsMap)
      const merged = [...ppCards, ...udCards]
      const seen = new Set<string>()
      const deduped = merged.filter(c => { const k = cardKey(c); if (seen.has(k)) return false; seen.add(k); return true })
      setCards(deduped)
      setLoadStats({ pp: ppCards.length, ud: udCards.length, ppLegs: ppLegCount, udLegs: udLegCount, error: errorMsg })
    }
    fetchAll()
    const id = window.setInterval(fetchAll, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const scoredCards = useMemo(() =>
    cards.map(c => {
      if (c.bestBetTier && c.bestBetScore != null) return c
      const { score, tier, label, reason } = clientScore(c)
      return { ...c, bestBetScore: score, bestBetTier: tier, bestBetTierLabel: label, bestBetTierReason: reason }
    }),
    [cards]
  )

  const filteredCards = useMemo(() => {
    let list = scoredCards.filter(c => sportFilter === 'All' || c.sport === sportFilter)
    if (activeTab === 'must_play') list = list.filter(c => c.bestBetTier === 'must_play')
    else if (activeTab === 'strong') list = list.filter(c => c.bestBetTier === 'must_play' || c.bestBetTier === 'strong')
    else if (activeTab === 'lottery') list = list.filter(c => c.bestBetTier === 'lottery')
    return list.sort((a, b) => {
      if (activeTab === 'all') {
        return Number(b.cardEv) - Number(a.cardEv)
      }
      const sd = (Number(b.bestBetScore) || 0) - (Number(a.bestBetScore) || 0)
      if (sd !== 0) return sd
      return (Number(b.kellyStake) || 0) - (Number(a.kellyStake) || 0)
    })
  }, [scoredCards, sportFilter, activeTab])

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = { must_play: 0, strong: 0, small: 0, lottery: 0, skip: 0 }
    for (const c of scoredCards) {
      const t = c.bestBetTier || 'skip'
      counts[t] = (counts[t] || 0) + 1
    }
    return counts
  }, [scoredCards])

  const portfolio = useMemo(() => {
    const sorted = [...filteredCards].sort((a, b) => (Number(b.bestBetScore) || 0) - (Number(a.bestBetScore) || 0))
    const stakeOf = (cards: Card[]) => cards.reduce((s, c) => s + (Number(c.kellyStake) || 0), 0)
    const avgLegs = (cards: Card[]) => {
      if (!cards.length) return 0
      return cards.reduce((s, c) => s + getLegIds(c).length, 0) / cards.length
    }
    const siteMix = (cards: Card[]) => {
      const pp = cards.filter(c => c.site === 'PP').length
      return { pp, ud: cards.length - pp }
    }
    const top10 = sorted.slice(0, 10)
    const top20 = sorted.slice(0, 20)
    const top30 = sorted.slice(0, 30)
    return {
      top10stake: stakeOf(top10), top20stake: stakeOf(top20), top30stake: stakeOf(top30),
      totalStake: stakeOf(sorted), avgLegs: avgLegs(sorted),
      siteMix: siteMix(sorted), count: sorted.length,
      kellyMax: Math.max(0, ...sorted.map(c => Number(c.kellyStake) || 0)),
      kellyMin: sorted.length ? Math.min(...sorted.filter(c => Number(c.kellyStake) > 0).map(c => Number(c.kellyStake))) : 0,
    }
  }, [filteredCards])

  const copyParlay = useCallback((card: Card) => {
    const text = formatParlayCopy(getLegIds(card), legs)
    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus('Copied parlay!')
      setTimeout(() => setCopyStatus(''), 2500)
    }).catch(() => setCopyStatus('Copy failed'))
  }, [legs])

  const freshAgo = manifest?.fresh_run_completed_at
    ? (() => {
        const ms = Date.now() - new Date(manifest.fresh_run_completed_at).getTime()
        const mins = Math.floor(ms / 60000)
        if (mins < 1) return 'just now'
        if (mins < 60) return `${mins}m ago`
        return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
      })()
    : null

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold tracking-tight">DFS Props Dashboard</h1>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm" onChange={e => setSportFilter(e.target.value)} value={sportFilter}>
              <option>All</option><option>NBA</option><option>NCAAB</option><option>NHL</option><option>NFL</option><option>MLB</option>
            </select>
            <span className="text-gray-400 font-mono" title="Live data validation">
              Last fresh: {manifest?.fresh_run_completed_at ? new Date(manifest.fresh_run_completed_at).toLocaleString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} | PP:{loadStats.pp} UD:{loadStats.ud}
            </span>
            <button
              type="button"
              onClick={() => { const cmd = 'On IONOS: run cron-generate.py or upload fresh dist/'; navigator.clipboard.writeText(cmd).then(() => setCopyStatus('Refresh instructions copied!')).catch(() => setCopyStatus('')); setTimeout(() => setCopyStatus(''), 2000); }}
              className="px-2 py-1 bg-cyan-900/50 text-cyan-300 rounded border border-cyan-700/50 hover:bg-cyan-800/50 text-[10px]"
            >
              Refresh Data
            </button>
            {copyStatus && <span className="text-green-400 animate-pulse">{copyStatus}</span>}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
        {/* Info panels */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          {/* Freshness */}
          <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="text-amber-400 font-semibold mb-1.5">Data Freshness</div>
            <div className="space-y-0.5 text-gray-300">
              <div>Last fresh: {manifest?.fresh_run_completed_at ? new Date(manifest.fresh_run_completed_at).toLocaleString() : '—'}</div>
              <div>PP: {loadStats.pp} cards / {loadStats.ppLegs} legs</div>
              <div>UD: {loadStats.ud} cards / {loadStats.udLegs} legs</div>
              <div>Bankroll: ${manifest?.bankroll ?? 600}</div>
              {manifest?.build_assets?.js && <div className="text-gray-500 truncate">Build: {manifest.build_assets.js.slice(0, 20)}</div>}
            </div>
            {loadStats.error && <div className="text-red-400 mt-1 text-[10px]">{loadStats.error}</div>}
          </div>

          {/* Portfolio */}
          <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="text-cyan-400 font-semibold mb-1.5">Portfolio ({activeTab})</div>
            <div className="space-y-0.5 text-gray-300">
              <div>Top 10: <span className="text-white font-medium">${portfolio.top10stake.toFixed(0)}</span></div>
              <div>Top 20: <span className="text-white font-medium">${portfolio.top20stake.toFixed(0)}</span></div>
              <div>Top 30: <span className="text-white font-medium">${portfolio.top30stake.toFixed(0)}</span></div>
              <div>Kelly range: ${portfolio.kellyMin.toFixed(0)}–${portfolio.kellyMax.toFixed(0)}</div>
              <div>Avg legs: {portfolio.avgLegs.toFixed(1)} | PP {portfolio.siteMix.pp} / UD {portfolio.siteMix.ud}</div>
            </div>
          </div>

          {/* Tier counts */}
          <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="text-green-400 font-semibold mb-1.5">Tier Breakdown</div>
            <div className="space-y-0.5 text-gray-300">
              <div><span className="text-emerald-400">Must Play:</span> {tierCounts.must_play}</div>
              <div><span className="text-green-400">Strong:</span> {tierCounts.strong}</div>
              <div><span className="text-blue-400">Small:</span> {tierCounts.small}</div>
              <div><span className="text-amber-400">Lottery:</span> {tierCounts.lottery}</div>
              <div><span className="text-gray-500">Skip:</span> {tierCounts.skip}</div>
            </div>
          </div>

          {/* Score formula */}
          <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="text-purple-400 font-semibold mb-1.5">Score Formula</div>
            <div className="space-y-0.5 text-gray-400 text-[10px] leading-relaxed">
              <div className="text-gray-300 text-xs">score = edge% x winProb x kellyFrac x legPenalty</div>
              <div>Leg penalty: 3-4=1.0, 5=0.95, 6=0.85, 7=0.55, 8=0.30</div>
              <div className="text-emerald-300">Must Play: score ≥ 8, win ≥ 10%, legs ≤ 5, edge ≥ 5%</div>
              <div className="text-green-300">Strong: score ≥ 4, win ≥ 5%, legs ≤ 6</div>
              <div className="text-blue-300">Small: score ≥ 1, win ≥ 3%</div>
              <div className="text-amber-300">Lottery: EV ≥ 10%, low win prob</div>
              <div className="text-gray-400 mt-1">Daily target: ~30 cards, ~$36 total (6% of $600)</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setExpandedCard(null) }}
              className={`px-4 py-2 text-sm font-medium rounded-t whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? `bg-gray-800 ${tab.color} border-b-2 border-current`
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              title={tab.desc}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-60">
                ({tab.id === 'must_play' ? tierCounts.must_play
                  : tab.id === 'strong' ? (tierCounts.must_play + tierCounts.strong)
                  : tab.id === 'lottery' ? tierCounts.lottery
                  : scoredCards.length})
              </span>
            </button>
          ))}
        </div>

        {/* Table: fixed layout + sticky header for perfect alignment */}
        <div className="overflow-x-auto overflow-y-auto rounded-lg border border-gray-800 max-h-[calc(100vh-22rem)]">
          <table className="dfs-table">
            <thead>
              <tr>
                <th className="col-expand w-9 text-center">▼</th>
                <th className="col-site">Site</th>
                <th className="col-player">Player / Prop / Line</th>
                <th className="col-tier">Tier</th>
                <th className="col-score">Score</th>
                <th className="col-ev">EV</th>
                <th className="col-win">Win%</th>
                <th className="col-edge">Edge</th>
                <th className="col-kelly">Kelly $</th>
              </tr>
            </thead>
            <tbody>
              {filteredCards.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No cards in this tab. Try "All Cards" or change sport filter.</td></tr>
              )}
              {filteredCards.slice(0, 50).map((card, i) => {
                const isExpanded = expandedCard === i
                const ppl = resolvePlayerPropLine(card, legs)
                const legIds = getLegIds(card)
                const siteLeg = card.siteLeg ?? `${String(card.site).toLowerCase()}-${card.flexType?.toLowerCase()}`
                const edgePct = Number(card.avgEdgePct) <= 1 ? Number(card.avgEdgePct) * 100 : Number(card.avgEdgePct)
                const winPct = card.winProbCash ? (Number(card.winProbCash) * 100).toFixed(1) : '—'
                const score = Number(card.bestBetScore) || 0
                const tier = card.bestBetTier || 'skip'
                const tierStyle = TIER_STYLE[tier] || TIER_STYLE.skip
                const tierLbl = card.bestBetTierLabel || TIER_LABEL[tier] || tier
                return (
                  <tbody key={`card-${i}`}>
                    <tr
                      className={`transition-colors ${
                        isExpanded ? 'bg-gray-800/60' : 'hover:bg-gray-800/30'
                      } ${tier === 'must_play' ? 'bg-emerald-950/20' : ''}`}
                    >
                      <td className="col-expand w-9 text-center align-middle" onClick={e => { e.stopPropagation(); setExpandedCard(isExpanded ? null : i) }}>
                        <button type="button" className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700/50" title={isExpanded ? 'Collapse' : 'Expand (slip / player links / copy)'} aria-expanded={isExpanded}>
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </td>
                      <td className="col-site whitespace-nowrap cursor-pointer" onClick={() => setExpandedCard(isExpanded ? null : i)}>
                        <span className={`font-medium ${card.site === 'PP' ? 'text-blue-400' : 'text-orange-400'}`}>{siteLeg}</span>
                      </td>
                      <td className="col-player text-gray-200 cursor-pointer" title={ppl} onClick={() => setExpandedCard(isExpanded ? null : i)}>{ppl}</td>
                      <td className="col-tier">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${tierStyle}`}>{tierLbl}</span>
                      </td>
                      <td className="col-score font-mono text-xs text-right">{(score * 10000).toFixed(1)}</td>
                      <td className="col-ev text-right font-bold text-green-400">{(Number(card.cardEv) * 100).toFixed(1)}%</td>
                      <td className="col-win text-right text-gray-300">{winPct}%</td>
                      <td className="col-edge text-right">{edgePct.toFixed(1)}%</td>
                      <td className="col-kelly text-right font-bold text-white">${(Number(card.kellyStake) || 0).toFixed(2)}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-900/60">
                        <td colSpan={9} className="px-4 py-3 align-top" onClick={e => e.stopPropagation()}>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            {/* 1) Full parlay link | 2) Player profile links | 3) Copy parlay */}
                            <div className="space-y-3">
                              <div>
                                <div className="text-cyan-400 font-semibold mb-1.5">1. Open full slip</div>
                                {card.site === 'UD' ? (
                                  <a href={udFullSlipUrl(legIds)} target="_blank" rel="noopener" className="inline-block px-3 py-1.5 bg-orange-900/50 text-orange-300 rounded border border-orange-700/50 hover:bg-orange-800/50">
                                    Underdog — Pick’em (legs={legIds.length})
                                  </a>
                                ) : (
                                  <a href={PP_PROJECTIONS} target="_blank" rel="noopener" className="inline-block px-3 py-1.5 bg-blue-900/50 text-blue-300 rounded border border-blue-700/50 hover:bg-blue-800/50">
                                    PrizePicks — Projections board
                                  </a>
                                )}
                                <p className="text-gray-500 mt-1 text-[10px]">UD may prefill with legs param; PP has no slip ID in data.</p>
                              </div>
                              <div>
                                <div className="text-cyan-400 font-semibold mb-1.5">2. Player profile links</div>
                                <div className="flex flex-wrap gap-1">
                                  {legIds.map((lid, j) => {
                                    const leg = legs.get(lid)
                                    const label = leg ? leg.player : lid
                                    const profileUrl = leg ? playerProfileUrl(card.site, leg.player) : perLegBoardLink(card.site)
                                    return (
                                      <a key={j} href={profileUrl} target="_blank" rel="noopener" className="px-2 py-0.5 bg-gray-700/50 text-blue-300 rounded text-[10px] hover:bg-gray-600/50">
                                        {label}
                                      </a>
                                    )
                                  })}
                                </div>
                              </div>
                              <div>
                                <div className="text-cyan-400 font-semibold mb-1.5">3. Copy parlay (fallback)</div>
                                <button
                                  type="button"
                                  onClick={() => copyParlay(card)}
                                  className="px-3 py-1.5 bg-green-900/50 text-green-300 rounded border border-green-700/50 hover:bg-green-800/50"
                                >
                                  Copy Parlay
                                </button>
                                <p className="text-gray-500 mt-1 text-[10px]">Paste into app search: &quot;Player STAT o1.5, Player2 STAT2 o2.5&quot;</p>
                              </div>
                              <div className="pt-1 border-t border-gray-700">
                                <span className="text-gray-500">Legs:</span>
                                {legIds.map((lid, j) => {
                                  const leg = legs.get(lid)
                                  const label = leg ? formatLeg(leg) : lid
                                  return <span key={j} className="ml-1 text-gray-400">#{j + 1} {label}{j < legIds.length - 1 ? ' | ' : ''}</span>
                                })}
                              </div>
                            </div>
                            <div>
                              <div className="text-purple-400 font-semibold mb-2">Why &quot;{tierLbl}&quot;?</div>
                              <div className="space-y-1 text-gray-400">
                                {card.bestBetTierReason && <div className="text-gray-300">{card.bestBetTierReason}</div>}
                                <div className="border-t border-gray-800 pt-1 mt-1">
                                  Score: <span className="text-white">{(score * 10000).toFixed(2)}</span> = edge({edgePct.toFixed(1)}%) × win({winPct}%) × kelly × legPen
                                </div>
                                <div>Kelly: ${manifest?.bankroll ?? 600} × {Number(card.kellyFrac || 0.25).toFixed(2)} × EV({(Number(card.cardEv)*100).toFixed(1)}%) / 1.5 = <span className="text-white font-bold">${(Number(card.kellyStake) || 0).toFixed(2)}</span></div>
                                <div>Card EV: {(Number(card.cardEv) * 100).toFixed(2)}% | Sport: {card.sport}</div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-gray-600 flex flex-wrap gap-4">
          <span>Showing top {Math.min(50, filteredCards.length)} of {filteredCards.length} | Auto-refresh 60s</span>
          <span>{activeTab === 'all' ? 'Sort: Card EV' : 'Sort: Best Bet Score'}</span>
          <span>Bankroll: ${manifest?.bankroll ?? 600} | Kelly: 1.5x conservative</span>
        </div>
      </main>
    </div>
  )
}

export default App
