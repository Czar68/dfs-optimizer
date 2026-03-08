import { Fragment, useEffect, useState, useMemo, useCallback } from 'react'
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

/** Copy text to clipboard; works in secure context (HTTPS/localhost) and fallback for older or HTTP */
function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return Promise.resolve(false)
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text))
  }
  return Promise.resolve(fallbackCopy(text))
}
function fallbackCopy(text: string): boolean {
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

// ── Deeplinks (max effort: full-slip + player profiles + fallbacks) ─────────

const UD_PICKEM_BASE = 'https://app.underdogfantasy.com/pick-em/higher-lower/all/NBA'
const UD_PLAYER_BASE = 'https://app.underdogfantasy.com/player'
const PP_PROJECTIONS = 'https://app.prizepicks.com/projections/nba'
const PP_PLAYER_BASE = 'https://app.prizepicks.com/player'
// PrizePicks pre-fill: Their URLs use projId=... (their internal IDs). We don't have those; our leg IDs are internal. So we only open the board. UD may accept legs= in query; PP does not pre-fill from our IDs.

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
const BANKROLL_DEFAULT = 600
const DAILY_TARGET_MIN = 50
const DAILY_TARGET_MAX = 80
const KELLY_FLOOR_PER_CARD = 1.5
const HIST_HIT_RATE_DEFAULT = 0.6

/** Display score 0–100 from our data: cardEv, winProb, avgEdgePct, leg count. Meaningful spread so "Must" ~70–100, "Strong" ~50–70, etc. */
function computeDisplayScore(c: Card): number {
  const cardEv = Math.max(0, Number(c.cardEv) || 0)
  const winProb = Math.max(0, Number(c.winProbCash) || 0)
  const edgePct = Math.max(0, Number(c.avgEdgePct) || 0)
  const edgeNorm = edgePct > 1 ? edgePct / 100 : edgePct
  const legCount = getLegIds(c).length
  const legPen = LEG_PEN[legCount] ?? (legCount > 8 ? 0.2 : 1)
  // Components: EV (up to 40 pts), win% (up to 35), edge (up to 25), leg penalty bonus
  const evScore = Math.min(40, cardEv * 250)
  const winScore = Math.min(35, winProb * 70)
  const edgeScore = Math.min(25, edgeNorm * 250)
  const raw = (evScore + winScore + edgeScore) * legPen
  return Math.min(100, Math.round(raw * 10) / 10)
}

function clientScore(c: Card): { score: number; tier: BestBetTier; label: string; reason: string } {
  const winProb = Number(c.winProbCash) || 0
  const legCount = getLegIds(c).length
  const edgePct = Number(c.avgEdgePct) || 0
  const edgeNorm = edgePct > 1 ? edgePct / 100 : edgePct
  const score = computeDisplayScore(c)

  if (score >= 70 && winProb >= 0.05 && legCount <= 6 && edgeNorm >= 0.05) {
    return { score, tier: 'must_play', label: 'Must', reason: `Score ${score} (EV + win% + edge), ${(winProb*100).toFixed(0)}% win, ${legCount} legs` }
  }
  if (score >= 50 && score < 70 && winProb >= 0.03 && legCount <= 6) {
    return { score, tier: 'strong', label: 'Strong', reason: `Score ${score}, ${(winProb*100).toFixed(0)}% win, ${legCount} legs` }
  }
  if (score >= 25 && score < 50 && winProb >= 0.02) {
    return { score, tier: 'small', label: 'Small', reason: `Score ${score}, ${(winProb*100).toFixed(1)}% win` }
  }
  if (Number(c.cardEv) >= 0.10 && winProb < 0.05) {
    return { score, tier: 'lottery', label: 'Lottery', reason: `High EV ${(Number(c.cardEv)*100).toFixed(0)}% but ${(winProb*100).toFixed(1)}% win` }
  }
  return { score, tier: 'skip', label: 'Skip', reason: `Score ${score} below tier thresholds` }
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
    const gameTime = (r.gameTime ?? r.GameTime ?? '').toString().trim() || undefined
    map.set(id, { id, player: r.player, stat: r.stat ?? '', line: String(r.line ?? ''), team: r.team ?? '', gameTime })
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
  const kellyFrac = Number(row.kellyFinalFraction ?? row.kellyFrac ?? row.kellyRawFraction ?? 0)
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
    kellyFrac: Number.isFinite(kellyFrac) && kellyFrac > 0 ? kellyFrac : 0,
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

type TabId = 'must_play' | 'strong' | 'all' | 'lottery' | 'top_legs_pp' | 'top_legs_ud'
const TABS: { id: TabId; label: string; color: string; desc: string }[] = [
  { id: 'must_play', label: 'Must Play', color: 'text-emerald-400', desc: 'Highest-conviction, short-leg, high-win-prob plays' },
  { id: 'strong', label: 'Strong', color: 'text-green-400', desc: 'Good score + reasonable win probability' },
  { id: 'all', label: 'All Cards', color: 'text-gray-300', desc: 'Everything sorted by EV' },
  { id: 'lottery', label: 'Lottery', color: 'text-amber-400', desc: 'High EV but low win probability' },
  { id: 'top_legs_pp', label: 'Top Legs PP', color: 'text-blue-400', desc: 'Top leg plays by EV (PrizePicks)' },
  { id: 'top_legs_ud', label: 'Top Legs UD', color: 'text-orange-400', desc: 'Top leg plays by EV (Underdog)' },
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

export interface TopLegRow {
  id: string
  player: string
  stat: string
  line: string | number
  legEv: number
  edge: number
  site: 'PP' | 'UD'
}

interface ResultsBox { hits: number; total: number }
interface Top100Row { player: string; prop: string; line: number; hits: number; attempts: number; hitPct: number; ev: number | null }
interface LegStatsRow {
  last?: number
  last10?: [number, number]
  last20?: [number, number]
  season?: [number, number]
}
interface ResultsSummary {
  day: ResultsBox; week: ResultsBox; month: ResultsBox; lt: ResultsBox; past: ResultsBox
  top100: Top100Row[]
  legStats?: Record<string, LegStatsRow>
}

const EMPTY_RESULTS: ResultsSummary = {
  day: { hits: 0, total: 0 }, week: { hits: 0, total: 0 }, month: { hits: 0, total: 0 },
  lt: { hits: 0, total: 0 }, past: { hits: 0, total: 0 }, top100: [],
}

/** Parse gameTime from CSV (ISO string or Date object from Papa); return ms or NaN if invalid */
function parseGameTimeMs(gt: string | Date | undefined): number {
  if (gt == null) return NaN
  if (typeof gt === 'number') return Number.isFinite(gt) ? gt : NaN
  if (gt instanceof Date) return gt.getTime()
  const n = Date.parse(String(gt))
  return Number.isFinite(n) ? n : NaN
}

function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [legs, setLegs] = useState<LegsLookup>(new Map())
  const [sportFilter, setSportFilter] = useState('All')
  const [siteFilter, setSiteFilter] = useState<'All' | 'PP' | 'UD'>('All')
  const [hideStartedGames, setHideStartedGames] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('must_play')
  const [loadStats, setLoadStats] = useState<LoadStats>({ pp: 0, ud: 0, ppLegs: 0, udLegs: 0 })
  const [topLegsPP, setTopLegsPP] = useState<TopLegRow[]>([])
  const [topLegsUD, setTopLegsUD] = useState<TopLegRow[]>([])
  const [topLegsLimit, setTopLegsLimit] = useState<25 | 50 | 100>(50)
  const [lastRefreshMs, setLastRefreshMs] = useState<number>(0)
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const [expandedCard, setExpandedCard] = useState<number | null>(null)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [copyStatus, setCopyStatus] = useState<string>('')
  const [resultsSummary, setResultsSummary] = useState<ResultsSummary>(EMPTY_RESULTS)
  const [expandedResultsPast, setExpandedResultsPast] = useState(false)

  useEffect(() => {
    fetch('/data/last_fresh_run.json')
      .then(r => r.ok ? r.json() : null)
      .then(m => { if (m) setManifest(m) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/data/results_summary.json')
      .then(r => r.ok ? r.json() : null)
      .then((m: ResultsSummary | null) => { if (m && m.day != null) setResultsSummary(m) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const DATA_BASE = '/data'
    const bust = `?t=${Date.now()}`
    const ppCardsUrl = `${DATA_BASE}/prizepicks-cards.csv${bust}`
    const udCardsUrl = `${DATA_BASE}/underdog-cards.csv${bust}`
    const ppLegsUrl = `${DATA_BASE}/prizepicks-legs.csv${bust}`
    const udLegsUrl = `${DATA_BASE}/underdog-legs.csv${bust}`

    const fetchAll = async () => {
      setLastRefreshMs(Date.now())
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

      const toTopLeg = (r: any, site: 'PP' | 'UD'): TopLegRow => ({
        id: (r.id ?? '').toString().trim(),
        player: (r.player ?? '').toString(),
        stat: (r.stat ?? '').toString(),
        line: r.line ?? '',
        legEv: Number(r.legEv) || 0,
        edge: Number(r.edge) || 0,
        site,
      })
      if (ppLegsRes.status === 'fulfilled') {
        const rows = ppLegsRes.value.map((r: any) => toTopLeg(r, 'PP')).filter((r: TopLegRow) => r.id && r.player)
        setTopLegsPP(rows.sort((a, b) => b.legEv - a.legEv).slice(0, 100))
      }
      if (udLegsRes.status === 'fulfilled') {
        const rows = udLegsRes.value.map((r: any) => toTopLeg(r, 'UD')).filter((r: TopLegRow) => r.id && r.player)
        setTopLegsUD(rows.sort((a, b) => b.legEv - a.legEv).slice(0, 100))
      }
    }
    fetchAll()
    const id = window.setInterval(fetchAll, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const scoredCards = useMemo((): Card[] => {
    const withTier = cards.map(c => {
      const { score: raw, tier, label, reason } = clientScore(c)
      return { ...c, bestBetTier: tier, bestBetTierLabel: label, bestBetTierReason: reason, _r: raw }
    })
    const byScore = [...withTier].sort((a, b) => (b._r ?? 0) - (a._r ?? 0))
    const N = byScore.length
    return withTier.map(c => {
      const rank = byScore.findIndex(x => cardKey(x) === cardKey(c)) + 1
      const percentileScore = N > 0 ? Math.round(100 * (1 - (rank - 1) / N)) : 0
      const { bestBetTier, bestBetTierLabel, bestBetTierReason } = c
      const { _r, ...rest } = c as typeof c & { _r: number }
      return { ...rest, bestBetScore: percentileScore, bestBetTier, bestBetTierLabel, bestBetTierReason } as Card
    })
  }, [cards])

  const filteredCards = useMemo(() => {
    let list = scoredCards.filter(c => sportFilter === 'All' || c.sport === sportFilter)
    if (siteFilter !== 'All') list = list.filter(c => (c.site ?? '').toUpperCase() === siteFilter)
    if (hideStartedGames && legs.size > 0) {
      const now = Date.now()
      list = list.filter(card => {
        const ids = getLegIds(card)
        for (const id of ids) {
          const leg = legs.get(id)
          const ms = parseGameTimeMs(leg?.gameTime)
          if (Number.isFinite(ms) && ms <= now) return false
        }
        return true
      })
    }
    if (activeTab === 'must_play') list = list.filter(c => c.bestBetTier === 'must_play')
    else if (activeTab === 'strong') list = list.filter(c => c.bestBetTier === 'must_play' || c.bestBetTier === 'strong')
    else if (activeTab === 'lottery') list = list.filter(c => c.bestBetTier === 'lottery')
    else if (activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud') return list
    return list.sort((a, b) => {
      if (activeTab === 'all') {
        return Number(b.cardEv) - Number(a.cardEv)
      }
      const sd = (Number(b.bestBetScore) || 0) - (Number(a.bestBetScore) || 0)
      if (sd !== 0) return sd
      return (Number(b.kellyStake) || 0) - (Number(a.kellyStake) || 0)
    })
  }, [scoredCards, sportFilter, siteFilter, hideStartedGames, legs, activeTab])

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
    const rawStakes = sorted.map(c => Math.max(KELLY_FLOOR_PER_CARD, Number(c.kellyStake) || 0))
    let totalRaw = 0
    let n = 0
    for (let i = 0; i < rawStakes.length; i++) {
      if (totalRaw + rawStakes[i] > DAILY_TARGET_MAX) break
      totalRaw += rawStakes[i]
      n++
    }
    const topN = sorted.slice(0, n)
    if (n === 0) {
      return {
        top10stake: 0, top20stake: 0, top30stake: 0, totalStake: 0, count: 0,
        displayedStake: (_card: Card, kellyStake: number) => Math.max(KELLY_FLOOR_PER_CARD, kellyStake || 0),
        kellyMax: 0, kellyMin: 0,
      }
    }
    let scale = 1
    if (totalRaw > DAILY_TARGET_MAX) scale = DAILY_TARGET_MAX / totalRaw
    else if (totalRaw < DAILY_TARGET_MIN) scale = DAILY_TARGET_MIN / totalRaw
    const stakes = topN.map((c, i) => Math.max(KELLY_FLOOR_PER_CARD, rawStakes[i] * scale))
    const totalStake = stakes.reduce((a, b) => a + b, 0)
    const getStake = (card: Card, kellyStake: number) => {
      const i = sorted.indexOf(card)
      if (i < 0 || i >= n) return Math.max(KELLY_FLOOR_PER_CARD, kellyStake || 0)
      return Math.max(KELLY_FLOOR_PER_CARD, rawStakes[i] * scale)
    }
    return {
      top10stake: stakes.slice(0, 10).reduce((a, b) => a + b, 0),
      top20stake: stakes.slice(0, 20).reduce((a, b) => a + b, 0),
      top30stake: totalStake,
      totalStake,
      count: n,
      displayedStake: getStake,
      kellyMax: stakes.length ? Math.max(...stakes) : 0,
      kellyMin: stakes.length ? Math.min(...stakes) : 0,
    }
  }, [filteredCards])

  const copyParlay = useCallback((card: Card, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const text = formatParlayCopy(getLegIds(card), legs) || getLegIds(card).map(id => { const l = legs.get(id); return l ? formatLeg(l) : id }).join(', ')
    copyToClipboard(text).then(ok => {
      setCopyStatus(ok ? 'Copied parlay!' : 'Copy failed (try allowing clipboard)')
      setTimeout(() => setCopyStatus(''), 2500)
    })
  }, [legs])

  const copyLeg = useCallback((leg: LegInfo | undefined, fallbackId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const text = leg ? formatLeg(leg) : fallbackId
    copyToClipboard(text).then(ok => {
      setCopyStatus(ok ? 'Copied!' : 'Copy failed')
      setTimeout(() => setCopyStatus(''), 2000)
    })
  }, [])

  const exportTableCsv = useCallback(() => {
    const isLegs = activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud'
    const rows = isLegs
      ? (activeTab === 'top_legs_pp' ? topLegsPP : topLegsUD).slice(0, topLegsLimit).map((leg, i) => ({
          '#': i + 1, Site: leg.site, Player: leg.player, Stat: leg.stat, Line: leg.line, 'Leg EV%': (leg.legEv * 100).toFixed(1), 'Edge%': (leg.edge * 100).toFixed(1),
        }))
      : filteredCards.slice(0, 50).map(c => ({
          Site: c.site, 'Player/Prop/Line': resolvePlayerPropLine(c, legs), Tier: c.bestBetTierLabel ?? c.bestBetTier, Score: c.bestBetScore, 'EV%': (Number(c.cardEv) * 100).toFixed(1), 'Win%': c.winProbCash != null ? (c.winProbCash * 100).toFixed(1) : '', 'Edge%': (Number(c.avgEdgePct) <= 1 ? Number(c.avgEdgePct) * 100 : Number(c.avgEdgePct)).toFixed(1), Kelly: c.kellyStake,
        }))
    if (rows.length === 0) { setCopyStatus('No rows to export'); setTimeout(() => setCopyStatus(''), 2000); return }
    const headers = Object.keys(rows[0])
    const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = isLegs ? `top-legs-${activeTab === 'top_legs_pp' ? 'pp' : 'ud'}-${topLegsLimit}.csv` : 'dashboard-cards.csv'
    a.click()
    URL.revokeObjectURL(url)
    setCopyStatus('Exported'); setTimeout(() => setCopyStatus(''), 2000)
  }, [activeTab, filteredCards, legs, topLegsPP, topLegsUD, topLegsLimit])

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
      {/* Header: load status top-right */}
      <header className="border-b border-gray-800 bg-black/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold tracking-tight">DFS Props Dashboard</h1>
          <div className="flex items-center gap-3 text-xs flex-wrap justify-end">
            <span className="text-gray-400 font-mono" title="Load status">
              PP:{loadStats.pp} UD:{loadStats.ud} | {manifest?.fresh_run_completed_at ? new Date(manifest.fresh_run_completed_at).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
            </span>
            <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm" onChange={e => setSportFilter(e.target.value)} value={sportFilter}>
              <option>All</option><option>NBA</option><option>NCAAB</option><option>NHL</option><option>NFL</option><option>MLB</option>
            </select>
            <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm" onChange={e => setSiteFilter(e.target.value as 'All' | 'PP' | 'UD')} value={siteFilter}>
              <option value="All">Site: All</option><option value="PP">PP</option><option value="UD">UD</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-400">
              <input type="checkbox" checked={hideStartedGames} onChange={e => setHideStartedGames(e.target.checked)} className="rounded" />
              Hide started games
            </label>
            {lastRefreshMs > 0 && (
              <span className="text-gray-500 text-[10px]" title="Data refetched every 60s">
                Refreshed {Math.round((Date.now() - lastRefreshMs) / 1000)}s ago
              </span>
            )}
            <button
              type="button"
              onClick={() => copyToClipboard('Upload fresh dist/ to IONOS htdocs').then(ok => { setCopyStatus(ok ? 'Copied' : ''); setTimeout(() => setCopyStatus(''), 2000); })}
              className="px-2 py-1 bg-cyan-900/50 text-cyan-300 rounded border border-cyan-700/50 hover:bg-cyan-800/50 text-[10px]"
            >
              Refresh
            </button>
            {copyStatus && <span className="text-green-400 animate-pulse">{copyStatus}</span>}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
        {/* Row 1: 5 result boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {[
            { key: 'day' as const, label: 'Day', tip: 'Today completed' },
            { key: 'week' as const, label: 'Week', tip: 'Last 7 days' },
            { key: 'month' as const, label: 'Month', tip: 'Last 30 days' },
            { key: 'lt' as const, label: 'LT', tip: 'Lifetime (all-time)' },
            { key: 'past' as const, label: 'Past', tip: 'Trailing 7 days (most recent)' },
          ].map(({ key, label, tip }) => {
            const box = resultsSummary[key]
            const hits = box?.hits ?? 0
            const total = box?.total ?? 0
            const pct = total ? ((hits / total) * 100).toFixed(0) : '0'
            const isPast = key === 'past'
            return (
              <div key={label} className="relative">
                <button
                  type="button"
                  onClick={() => isPast && setExpandedResultsPast(prev => !prev)}
                  className={`w-full p-2.5 bg-gray-900 border border-gray-800 rounded-lg text-center text-left ${isPast ? 'cursor-pointer hover:bg-gray-800/80' : ''}`}
                  title={tip}
                >
                  <div className="text-gray-400 text-[10px] uppercase tracking-wider">{label}</div>
                  <div className="text-white font-bold text-sm">{hits}/{total}</div>
                  <div className="text-gray-500 text-[10px]">{pct}%</div>
                  {isPast && <span className="absolute right-1.5 top-1.5 text-gray-500 text-xs">{expandedResultsPast ? '▼' : '▶'}</span>}
                </button>
                {isPast && expandedResultsPast && (
                  <div className="mt-2 p-3 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                    <div className="text-cyan-400 font-semibold text-xs mb-2">Top Legs — Top 100 by hit rate (lifetime)</div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[280px] border border-gray-800 rounded">
                      <table className="w-full text-[10px] border-collapse">
                        <thead className="sticky top-0 bg-black text-gray-400">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Player</th>
                            <th className="px-2 py-1.5 text-left">Prop</th>
                            <th className="px-2 py-1.5 text-right">Line</th>
                            <th className="px-2 py-1.5 text-right">Hits</th>
                            <th className="px-2 py-1.5 text-right">Att</th>
                            <th className="px-2 py-1.5 text-right">Hit%</th>
                            <th className="px-2 py-1.5 text-right">EV</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-300">
                          {resultsSummary.top100.length === 0 && (
                            <tr><td colSpan={7} className="px-2 py-4 text-center text-gray-500">No leg results yet. Run export_results_summary.py after settling outcomes.</td></tr>
                          )}
                          {resultsSummary.top100.map((row, i) => (
                            <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                              <td className="px-2 py-1 truncate max-w-[100px]" title={row.player}>{row.player}</td>
                              <td className="px-2 py-1">{row.prop}</td>
                              <td className="px-2 py-1 text-right">o{row.line}</td>
                              <td className="px-2 py-1 text-right">{row.hits}</td>
                              <td className="px-2 py-1 text-right">{row.attempts}</td>
                              <td className="px-2 py-1 text-right font-medium text-green-400">{row.hitPct}%</td>
                              <td className="px-2 py-1 text-right">{row.ev != null ? (row.ev >= 0 ? '+' : '') + row.ev.toFixed(2) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-gray-500 text-[10px] mt-1.5">LT = all-time. Past = last 7 days. Data from results.db.</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Row 2: 4 panels (no dead space) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="text-amber-400 font-semibold mb-1.5">Data & Tiers</div>
            <div className="space-y-0.5 text-gray-300">
              <div>PP: {loadStats.pp} cards / {loadStats.ppLegs} legs · UD: {loadStats.ud} cards / {loadStats.udLegs} legs</div>
              <div>Bankroll: ${manifest?.bankroll ?? BANKROLL_DEFAULT}</div>
              <div className="pt-1 border-t border-gray-800 mt-1">Must: {tierCounts.must_play} · Strong: {tierCounts.strong} · Small: {tierCounts.small} · Lot: {tierCounts.lottery}</div>
            </div>
            {loadStats.error && <div className="text-red-400 mt-1 text-[10px]">{loadStats.error}</div>}
          </div>
          <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="text-cyan-400 font-semibold mb-1.5">Portfolio (1.0x Kelly)</div>
            <div className="space-y-0.5 text-gray-300">
              <div>Top 10: ${portfolio.top10stake.toFixed(0)} · Top 20: ${portfolio.top20stake.toFixed(0)}</div>
              <div>Total: ${portfolio.totalStake.toFixed(0)} ({portfolio.count} cards) · Range: ${portfolio.kellyMin.toFixed(2)}–${portfolio.kellyMax.toFixed(2)}</div>
            </div>
          </div>
          <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="text-purple-400 font-semibold mb-1.5">Score & Results</div>
            <div className="text-gray-400 text-[10px] space-y-0.5">
              <div>Score 1–100 = best card. Run <span className="text-cyan-300">export_results_summary.py</span> after settling for Day/Week/Month/Past.</div>
            </div>
          </div>
          <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="text-emerald-400 font-semibold mb-1.5">Quick</div>
            <div className="space-y-1">
              <button type="button" onClick={() => exportTableCsv()} className="w-full px-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-left text-gray-300 text-[11px]">
                Export table CSV
              </button>
              {freshAgo && <div className="text-gray-500 text-[10px]">Data: {freshAgo}</div>}
            </div>
          </div>
        </div>

        {/* Tabs + Top Legs limit when on PP/UD legs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-800">
          <div className="flex gap-1 overflow-x-auto">
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
                    : tab.id === 'top_legs_pp' ? topLegsPP.length
                    : tab.id === 'top_legs_ud' ? topLegsUD.length
                    : scoredCards.length})
                </span>
              </button>
            ))}
          </div>
          {(activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud') && (
            <select className="ml-2 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs" value={topLegsLimit} onChange={e => setTopLegsLimit(Number(e.target.value) as 25 | 50 | 100)}>
              <option value={25}>Top 25</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
            </select>
          )}
        </div>

        {/* Table: cards or top legs by tab */}
        {(activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud') ? (
          <div className="dfs-table-wrapper rounded-lg border border-gray-800 overflow-x-auto overflow-y-auto max-h-[60vh]">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-black text-gray-400 z-10">
                <tr>
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left">Site</th>
                  <th className="px-3 py-2 text-left">Player / Prop / Line</th>
                  <th className="px-3 py-2 text-right">Leg EV%</th>
                  <th className="px-3 py-2 text-right">Edge%</th>
                  <th className="px-3 py-2 text-center" title="Last outcome">Last</th>
                  <th className="px-3 py-2 text-right" title="Last 10">L10</th>
                  <th className="px-3 py-2 text-right" title="Last 20">L20</th>
                  <th className="px-3 py-2 text-right" title="Season">Season</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                {(activeTab === 'top_legs_pp' ? topLegsPP : topLegsUD)
                  .slice(0, topLegsLimit)
                  .map((leg, i) => {
                    const stats = resultsSummary.legStats?.[leg.id]
                    const lastStr = stats?.last != null ? (stats.last === 1 ? 'H' : 'M') : '—'
                    const last10Str = stats?.last10 ? `${stats.last10[0]}/${stats.last10[1]}` : '—'
                    const last20Str = stats?.last20 ? `${stats.last20[0]}/${stats.last20[1]}` : '—'
                    const seasonStr = stats?.season ? `${stats.season[0]}/${stats.season[1]}` : '—'
                    return (
                      <tr key={leg.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                        <td className="px-3 py-1.5"><span className={leg.site === 'PP' ? 'text-blue-400' : 'text-orange-400'}>{leg.site}</span></td>
                        <td className="px-3 py-1.5">{leg.player} {statAbbrev(leg.stat)} o{leg.line}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-green-400">{(leg.legEv * 100).toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right">{(leg.edge * 100).toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-center">{lastStr}</td>
                        <td className="px-3 py-1.5 text-right text-[11px]">{last10Str}</td>
                        <td className="px-3 py-1.5 text-right text-[11px]">{last20Str}</td>
                        <td className="px-3 py-1.5 text-right text-[11px]">{seasonStr}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-500 px-3 py-2 border-t border-gray-800">Top {topLegsLimit} legs by EV · {activeTab === 'top_legs_pp' ? 'PrizePicks' : 'Underdog'}</p>
          </div>
        ) : (
        <div className="dfs-table-wrapper rounded-lg border border-gray-800">
          <table className="dfs-table">
            <colgroup>
              <col className="col-expand" />
              <col className="col-site" />
              <col className="col-player" />
              <col className="col-tier" />
              <col className="col-score" />
              <col className="col-ev" />
              <col className="col-win" />
              <col className="col-edge" />
              <col className="col-kelly" />
            </colgroup>
            <thead>
              <tr>
                <th className="col-expand text-center">▼</th>
                <th className="col-site">Site</th>
                <th className="col-player">Player / Prop / Line</th>
                <th className="col-tier">Tier</th>
                <th className="col-score">Score</th>
                <th className="col-ev">EV</th>
                <th className="col-win">Win%</th>
                <th className="col-edge">Edge</th>
                <th className="col-kelly">Kelly</th>
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
                const score = Number(card.bestBetScore) ?? 0
                const tier = card.bestBetTier || 'skip'
                const tierStyle = TIER_STYLE[tier] || TIER_STYLE.skip
                const tierLbl = card.bestBetTierLabel || TIER_LABEL[tier] || tier
                const displayedStake = portfolio.displayedStake(card, card.kellyStake)
                return (
                  <Fragment key={`card-${i}`}>
                    <tr
                      className={`transition-colors ${
                        isExpanded ? 'bg-gray-800/60' : 'hover:bg-gray-800/30'
                      } ${tier === 'must_play' ? 'bg-emerald-950/20' : ''}`}
                    >
                      <td className="col-expand text-center align-middle" onClick={e => { e.stopPropagation(); setExpandedCard(isExpanded ? null : i) }}>
                        <button type="button" className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700/50" title={isExpanded ? 'Collapse' : 'Expand (slip / player links / copy)'} aria-expanded={isExpanded}>
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </td>
                      <td className="col-site whitespace-nowrap cursor-pointer" onClick={() => setExpandedCard(isExpanded ? null : i)}>
                        <span className={`font-medium ${card.site === 'PP' ? 'text-blue-400' : 'text-orange-400'}`}>{siteLeg}</span>
                      </td>
                      <td className="col-player text-gray-200 cursor-pointer" title={ppl} onClick={() => setExpandedCard(isExpanded ? null : i)}>{ppl}</td>
                      <td className="col-tier"><span className={`tier-badge ${tierStyle}`}>{tierLbl}</span></td>
                      <td className="col-score font-mono text-right">{score.toFixed(0)}</td>
                      <td className="col-ev text-right font-semibold text-green-400">{(Number(card.cardEv) * 100).toFixed(1)}%</td>
                      <td className="col-win text-right text-gray-300">{winPct}%</td>
                      <td className="col-edge text-right">{edgePct.toFixed(1)}%</td>
                      <td className="col-kelly text-right font-bold text-white">${displayedStake.toFixed(2)}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-900/60">
                        <td colSpan={9} className="px-4 py-3 align-top" onClick={e => e.stopPropagation()}>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            {/* 1) Full parlay link | 2) Player profile links | 3) Copy parlay */}
                            <div className="space-y-3">
                              <div>
                                <div className="text-cyan-400 font-semibold mb-1.5">1. Open board / slip</div>
                                {card.site === 'UD' ? (
                                  <a href={udFullSlipUrl(legIds)} target="_blank" rel="noopener noreferrer" className="inline-block px-3 py-1.5 bg-orange-900/50 text-orange-300 rounded border border-orange-700/50 hover:bg-orange-800/50">
                                    Underdog — Pick’em (legs={legIds.length})
                                  </a>
                                ) : (
                                  <a href={PP_PROJECTIONS} target="_blank" rel="noopener noreferrer" className="inline-block px-3 py-1.5 bg-blue-900/50 text-blue-300 rounded border border-blue-700/50 hover:bg-blue-800/50">
                                    PrizePicks — Projections board
                                  </a>
                                )}
                                <p className="text-gray-500 mt-1 text-[10px]">PP opens board only (pre-fill needs their projId; we don’t have it). Use copy below to paste into site.</p>
                              </div>
                              <div>
                                <div className="text-cyan-400 font-semibold mb-1.5">2. Player — click to copy; Open = profile page</div>
                                <div className="flex flex-wrap gap-1">
                                  {legIds.map((lid, j) => {
                                    const leg = legs.get(lid)
                                    const label = leg ? leg.player : lid
                                    const copyText = leg ? formatLeg(leg) : lid
                                    const site = (card.site ?? 'PP').toString().toUpperCase()
                                    const profileHref = leg ? playerProfileUrl(site, leg.player) : ''
                                    return (
                                      <span key={j} className="inline-flex items-center gap-0.5">
                                        <button type="button" onClick={e => copyLeg(leg, lid, e)} className="px-2 py-0.5 bg-gray-700/50 text-blue-300 rounded text-[10px] hover:bg-gray-600/50 text-left" title={`Copy "${copyText}"`}>
                                          {label}
                                        </button>
                                        {profileHref && (
                                          <a href={profileHref} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-gray-500 hover:text-cyan-400" title="Open player page">Open</a>
                                        )}
                                      </span>
                                    )
                                  })}
                                </div>
                                <p className="text-gray-500 mt-1 text-[10px]">Click name → copies &quot;Player STAT oX.X&quot;; Open may 404.</p>
                              </div>
                              <div>
                                <div className="text-cyan-400 font-semibold mb-1.5">3. Copy full parlay</div>
                                <button
                                  type="button"
                                  onClick={e => copyParlay(card, e)}
                                  className="px-3 py-1.5 bg-green-900/50 text-green-300 rounded border border-green-700/50 hover:bg-green-800/50"
                                >
                                  Copy Parlay
                                </button>
                                <p className="text-gray-500 mt-1 text-[10px]">Paste into PP/UD: &quot;Player STAT o1.5, Player2 STAT2 o2.5&quot;</p>
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
                                  Score: <span className="text-white">{score}</span>/100 (best card = 100, percentile rank). Must ≥70, Strong 50–70, Small 25–50
                                </div>
                                <div>Kelly 1.0x $50–80 daily, $1.50 floor: <span className="text-white font-bold">${displayedStake.toFixed(2)}</span></div>
                                <div>Card EV: {(Number(card.cardEv) * 100).toFixed(2)}% | Sport: {card.sport}</div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        )}

        <div className="text-xs text-gray-600 flex flex-wrap gap-4">
          {(activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud') ? (
            <span>Top {topLegsLimit} legs by EV · {activeTab === 'top_legs_pp' ? 'PP' : 'UD'} | Data refreshes every 60s</span>
          ) : (
            <span>Showing top {Math.min(50, filteredCards.length)} of {filteredCards.length} | Data refreshes every 60s</span>
          )}
          {activeTab !== 'top_legs_pp' && activeTab !== 'top_legs_ud' && <span>{activeTab === 'all' ? 'Sort: Card EV' : 'Sort: Score (best=100)'}</span>}
          {siteFilter !== 'All' && <span>Site: {siteFilter}</span>}
          <span>Bankroll: ${manifest?.bankroll ?? BANKROLL_DEFAULT} | Kelly 1.0x $50–80 daily, $1.50/card floor</span>
        </div>
      </main>
    </div>
  )
}

export default App
