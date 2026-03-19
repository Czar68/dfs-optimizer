import { Fragment, useEffect, useState, useMemo, useCallback } from 'react'
import Papa from 'papaparse'
import type { Card, LegInfo, LegsLookup, BestBetTier } from './types'
import { filterUD } from './data/odds'
import PickTracker from './components/PickTracker'
import AppHeader from './components/AppHeader'
import PrimarySecondaryTabs from './components/PrimarySecondaryTabs'
import { TABS, getTabMeta, type TabId } from './config/tabs'
import './index.css'

declare const __APP_BASE__: string | undefined

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
const TIER_PRIORITY_LABEL: Record<string, string> = {
  must_play: 'Tier 1',
  strong: 'Tier 2',
  small: 'Tier 3',
  lottery: 'Tier L',
  skip: 'Skip',
  core: 'Tier 2',
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
  side: 'over' | 'under'
  team?: string
  gameTime?: string
  gameTimeMs?: number
  fairProb?: number
  breakevenProb?: number
  isNonStandardOdds?: boolean
  isGoblin?: boolean
  isDemon?: boolean
  eligibility: 'replacement_ready' | 'started_unusable'
}

type TopLegSortKey = 'edge' | 'legEv' | 'gameTime' | 'player' | 'stat'
type SortDir = 'asc' | 'desc'
type CardSortKey = 'edge' | 'ev' | 'gameTime' | 'player' | 'cardType'

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

interface MergeStageAccountingLite {
  propsConsideredForMatchingRows?: number
  matchedRows?: number
  unmatchedPropRows?: number
  unmatchedAttribution?: {
    propsByReason?: Record<string, number>
    oddsByBook?: Record<string, number>
  }
}

interface MatchGapAttributionLite {
  unmatchedAttribution?: {
    propsByReason?: Record<string, number>
    oddsByBook?: Record<string, number>
  }
}

const REASON_LABELS: Record<string, { label: string; help: string }> = {
  no_candidate: { label: 'No market match', help: 'No matching odds row found for the prop identity.' },
  line_diff: { label: 'Line mismatch', help: 'A market exists, but line value is outside allowed merge tolerance.' },
  juice: { label: 'Juice filtered', help: 'Market odds exceeded configured juice safety threshold.' },
  promo_or_special: { label: 'Promo / special filtered', help: 'Promo or special-line rows are intentionally excluded.' },
  fantasy_excluded: { label: 'Fantasy stat excluded', help: 'Fantasy score rows are excluded from this merge path.' },
  no_odds_stat: { label: 'Stat not in odds feed', help: 'Prop stat type is not currently present in fetched odds.' },
  escalator_filtered: { label: 'Escalator filtered', help: 'Escalator-style micro-lines are filtered as non-actionable.' },
}

/** Parse gameTime from CSV (ISO string or Date object from Papa); return ms or NaN if invalid */
function parseGameTimeMs(gt: string | Date | undefined): number {
  if (gt == null) return NaN
  if (typeof gt === 'number') return Number.isFinite(gt) ? gt : NaN
  if (gt instanceof Date) return gt.getTime()
  const n = Date.parse(String(gt))
  return Number.isFinite(n) ? n : NaN
}

interface GameSelectionPill {
  key: string
  label: string
  startMs: number
  isStarted: boolean
  cardCount: number
}

function normalizeTeamToken(team?: string): string | null {
  const t = String(team ?? '').trim().toUpperCase()
  return t.length >= 2 ? t : null
}

function cardGameSelectionInfo(card: Card, legs: LegsLookup): { key: string; label: string; startMs: number; isStarted: boolean } | null {
  const legRows = getLegIds(card).map(id => legs.get(id)).filter((x): x is LegInfo => !!x)
  if (legRows.length === 0) return null

  const teams = Array.from(new Set(legRows.map(l => normalizeTeamToken(l.team)).filter((x): x is string => !!x)))
  if (teams.length < 2) return null

  const startTimes = legRows.map(l => parseGameTimeMs(l.gameTime)).filter(ms => Number.isFinite(ms))
  if (startTimes.length === 0) return null
  const startMs = Math.min(...startTimes)
  const isStarted = startMs <= Date.now()

  const matchup = teams.slice(0, 2).sort().join(' vs ')
  const label = `${new Date(startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${matchup}`
  return {
    key: `${new Date(startMs).toISOString()}|${matchup}`,
    label,
    startMs,
    isStarted,
  }
}

function primaryPlayerName(card: Card, legs: LegsLookup): string {
  const first = getLegIds(card).map(id => legs.get(id)).find((x): x is LegInfo => !!x)
  return String(first?.player ?? '').trim()
}

function cardTypeLabel(card: Card): string {
  const flex = String(card.flexType ?? '').trim().toUpperCase()
  if (flex) return flex
  const n = getLegIds(card).length
  return n > 0 ? `${n}L` : 'N/A'
}

function cardStartMs(card: Card, legs: LegsLookup): number {
  const times = getLegIds(card)
    .map(id => parseGameTimeMs(legs.get(id)?.gameTime))
    .filter(ms => Number.isFinite(ms))
  if (times.length === 0) return Number.NaN
  return Math.min(...times)
}

function cardEligibility(card: Card, legs: LegsLookup): 'replacement_ready' | 'started_unusable' {
  const ms = cardStartMs(card, legs)
  return Number.isFinite(ms) && ms > Date.now() ? 'replacement_ready' : 'started_unusable'
}

function compactLegString(leg: LegInfo): string {
  return `${leg.player} ${statAbbrev(leg.stat)} o${leg.line}`
}

function americanToBreakevenProb(odds: number | undefined): number | undefined {
  if (odds == null || !Number.isFinite(odds) || odds === 0) return undefined
  if (odds > 0) return 100 / (odds + 100)
  return Math.abs(odds) / (Math.abs(odds) + 100)
}

function parseBoolLike(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}

function parseSideFromLegKey(legKey?: string): 'over' | 'under' {
  if (!legKey) return 'over'
  if (legKey.includes(':under:')) return 'under'
  return 'over'
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
  const [topLegsSortKey, setTopLegsSortKey] = useState<TopLegSortKey>('edge')
  const [topLegsSortDir, setTopLegsSortDir] = useState<SortDir>('desc')
  const [topLegsNotStartedOnly, setTopLegsNotStartedOnly] = useState(true)
  const [topLegsStatFilter, setTopLegsStatFilter] = useState<string>('All')
  const [topLegsGameFilter, setTopLegsGameFilter] = useState<string>('All')
  const [topLegsMinEdge, setTopLegsMinEdge] = useState<number>(0)
  const [showGoblins, setShowGoblins] = useState(true)
  const [showDemons, setShowDemons] = useState(true)
  const [showNonStandard, setShowNonStandard] = useState(true)
  const [cardSortKey, setCardSortKey] = useState<CardSortKey>('ev')
  const [cardSortDir, setCardSortDir] = useState<SortDir>('desc')
  const [cardTypeFilter, setCardTypeFilter] = useState<string>('All')
  const [cardGameFilter, setCardGameFilter] = useState<string>('All')
  const [cardMinEdge, setCardMinEdge] = useState<number>(0)
  const [lastRefreshMs, setLastRefreshMs] = useState<number>(0)
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const [expandedCard, setExpandedCard] = useState<number | null>(null)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [copyStatus, setCopyStatus] = useState<string>('')
  const [copiedPlayerName, setCopiedPlayerName] = useState<string>('')
  const [selectedGameKeys, setSelectedGameKeys] = useState<string[]>([])
  const [resultsSummary, setResultsSummary] = useState<ResultsSummary>(EMPTY_RESULTS)
  const [expandedResultsPast, setExpandedResultsPast] = useState(false)
  const [isAdminMetricsView, setIsAdminMetricsView] = useState(false)
  const [mergeStage, setMergeStage] = useState<MergeStageAccountingLite | null>(null)
  const [matchGap, setMatchGap] = useState<MatchGapAttributionLite | null>(null)

  // Base-aware data path: /dfs/data on production, /data in dev
  const DATA_BASE = `${(typeof __APP_BASE__ !== 'undefined' ? __APP_BASE__ : '/').replace(/\/+$/, '')}/data`;

  useEffect(() => {
    fetch(`${DATA_BASE}/last_fresh_run.json`)
      .then(r => r.ok ? r.json() : null)
      .then(m => { if (m) setManifest(m) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${DATA_BASE}/results_summary.json`)
      .then(r => r.ok ? r.json() : null)
      .then((m: ResultsSummary | null) => { if (m && m.day != null) setResultsSummary(m) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('view') === 'admin') setIsAdminMetricsView(true)
  }, [])

  useEffect(() => {
    fetch('/artifacts/merge_stage_accounting.json')
      .then(r => (r.ok ? r.json() : null))
      .then((m: MergeStageAccountingLite | null) => { if (m) setMergeStage(m) })
      .catch(() => {})
    fetch('/artifacts/merge_match_gap_attribution.json')
      .then(r => (r.ok ? r.json() : null))
      .then((m: MatchGapAttributionLite | null) => { if (m) setMatchGap(m) })
      .catch(() => {})
  }, [])

  useEffect(() => {
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
      if (udRes.status === 'fulfilled') {
        const udParlays = udRes.value.map(normalizeRow).filter((c): c is Card => c != null)
        udCards = udParlays.filter((c) => filterUD(c.cardEv))
      } else errorMsg = (errorMsg ? errorMsg + '; ' : '') + `UD cards: ${udRes.reason?.message ?? udRes.reason}`

      const legsMap: LegsLookup = new Map()
      let ppLegCount = 0, udLegCount = 0
      if (ppLegsRes.status === 'fulfilled') { const m = buildLegsLookup(ppLegsRes.value); ppLegCount = m.size; m.forEach((v, k) => legsMap.set(k, v)) }
      if (udLegsRes.status === 'fulfilled') { const m = buildLegsLookup(udLegsRes.value); udLegCount = m.size; m.forEach((v, k) => legsMap.set(k, v)) }

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
        side: parseSideFromLegKey((r.leg_key ?? r.legKey ?? '').toString()),
        team: (r.team ?? '').toString(),
        gameTime: (r.gameTime ?? r.GameTime ?? '').toString(),
        gameTimeMs: parseGameTimeMs(r.gameTime ?? r.GameTime),
        fairProb: Number.isFinite(Number(r.trueProb)) ? Number(r.trueProb) : undefined,
        breakevenProb: americanToBreakevenProb(Number.isFinite(Number(r.overOdds)) ? Number(r.overOdds) : undefined),
        isNonStandardOdds: parseBoolLike(r.IsNonStandardOdds ?? r.isNonStandardOdds),
        isGoblin: parseBoolLike(r.isGoblin ?? r.IsGoblin),
        isDemon: parseBoolLike(r.isDemon ?? r.IsDemon),
        eligibility: (() => {
          const ms = parseGameTimeMs(r.gameTime ?? r.GameTime)
          return Number.isFinite(ms) && ms > Date.now() ? 'replacement_ready' : 'started_unusable'
        })(),
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

  const gameSelectableCards = useMemo(() => {
    return scoredCards.filter(c => (sportFilter === 'All' || c.sport === sportFilter) && (siteFilter === 'All' || (c.site ?? '').toUpperCase() === siteFilter))
  }, [scoredCards, sportFilter, siteFilter])

  const gamePills = useMemo(() => {
    const byKey = new Map<string, GameSelectionPill>()
    let malformedCount = 0
    for (const card of gameSelectableCards) {
      const info = cardGameSelectionInfo(card, legs)
      if (!info) {
        malformedCount++
        continue
      }
      const existing = byKey.get(info.key)
      if (!existing) {
        byKey.set(info.key, { ...info, cardCount: 1 })
      } else {
        existing.cardCount += 1
      }
    }
    const pills = Array.from(byKey.values()).sort((a, b) => a.startMs - b.startMs)
    return { pills, malformedCount }
  }, [gameSelectableCards, legs])

  const cardFilterOptions = useMemo(() => {
    const base = scoredCards.filter(c => sportFilter === 'All' || c.sport === sportFilter)
    const types = Array.from(new Set(base.map(c => cardTypeLabel(c)))).sort()
    const games = Array.from(new Set(
      base
        .map(c => {
          const ms = cardStartMs(c, legs)
          if (!Number.isFinite(ms)) return ''
          return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })
        .filter(Boolean)
    )).sort()
    return { types, games }
  }, [legs, scoredCards, sportFilter])

  useEffect(() => {
    const valid = new Set(gamePills.pills.map(p => p.key))
    setSelectedGameKeys(prev => prev.filter(k => valid.has(k)))
  }, [gamePills.pills])

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
    if (selectedGameKeys.length > 0) {
      const selected = new Set(selectedGameKeys)
      list = list.filter(c => {
        const info = cardGameSelectionInfo(c, legs)
        return info != null && selected.has(info.key)
      })
    }
    if (cardTypeFilter !== 'All') list = list.filter(c => cardTypeLabel(c) === cardTypeFilter)
    if (cardGameFilter !== 'All') {
      list = list.filter(c => {
        const ms = cardStartMs(c, legs)
        if (!Number.isFinite(ms)) return false
        return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) === cardGameFilter
      })
    }
    list = list.filter(c => {
      const edgePct = Number(c.avgEdgePct) <= 1 ? Number(c.avgEdgePct) * 100 : Number(c.avgEdgePct)
      return edgePct >= cardMinEdge
    })
    const factor = cardSortDir === 'asc' ? 1 : -1
    return list.sort((a, b) => {
      if (cardSortKey === 'ev') return (Number(a.cardEv) - Number(b.cardEv)) * factor
      if (cardSortKey === 'edge') {
        const ea = Number(a.avgEdgePct) <= 1 ? Number(a.avgEdgePct) * 100 : Number(a.avgEdgePct)
        const eb = Number(b.avgEdgePct) <= 1 ? Number(b.avgEdgePct) * 100 : Number(b.avgEdgePct)
        return (ea - eb) * factor
      }
      if (cardSortKey === 'gameTime') return (cardStartMs(a, legs) - cardStartMs(b, legs)) * factor
      if (cardSortKey === 'player') return primaryPlayerName(a, legs).localeCompare(primaryPlayerName(b, legs)) * factor
      return cardTypeLabel(a).localeCompare(cardTypeLabel(b)) * factor
    })
  }, [scoredCards, sportFilter, siteFilter, hideStartedGames, legs, activeTab, selectedGameKeys, cardTypeFilter, cardGameFilter, cardMinEdge, cardSortDir, cardSortKey])

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

  const copyLeg = useCallback((leg: LegInfo, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const text = compactLegString(leg)
    copyToClipboard(text).then(ok => {
      setCopyStatus(ok ? 'Copied leg' : 'Copy failed')
      setTimeout(() => setCopyStatus(''), 2000)
    })
  }, [])

  const copyPlayerName = useCallback((player: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const text = player.trim()
    if (!text) return
    copyToClipboard(text).then(ok => {
      if (ok) {
        setCopiedPlayerName(text)
        setCopyStatus(`Copied player: ${text}`)
        setTimeout(() => setCopiedPlayerName(prev => (prev === text ? '' : prev)), 1200)
        setTimeout(() => setCopyStatus(''), 2000)
      } else {
        setCopyStatus('Copy failed')
        setTimeout(() => setCopyStatus(''), 2000)
      }
    })
  }, [])

  const freshAgo = manifest?.fresh_run_completed_at
    ? (() => {
        const ms = Date.now() - new Date(manifest.fresh_run_completed_at).getTime()
        const mins = Math.floor(ms / 60000)
        if (mins < 1) return 'just now'
        if (mins < 60) return `${mins}m ago`
        return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
      })()
    : null

  const selectedCard = useMemo(() => {
    if (expandedCard != null && filteredCards[expandedCard]) return filteredCards[expandedCard]
    return filteredCards[0] ?? null
  }, [expandedCard, filteredCards])

  const tier1CountInView = useMemo(
    () => filteredCards.filter(c => (c.bestBetTier || 'skip') === 'must_play').length,
    [filteredCards]
  )

  const activeTabMeta = useMemo(() => getTabMeta(activeTab), [activeTab])

  const topLegStats = useMemo(() => {
    const combined = [...topLegsPP, ...topLegsUD]
    const stats = Array.from(new Set(combined.map(r => r.stat).filter(Boolean))).sort()
    const games = Array.from(
      new Set(
        combined
          .map(r => {
            const ms = r.gameTimeMs
            if (!Number.isFinite(ms as number)) return ''
            const t = new Date(ms as number).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            return `${t} ${r.team || 'TBD'}`
          })
          .filter(Boolean)
      )
    ).sort()
    return { stats, games }
  }, [topLegsPP, topLegsUD])

  const sortTopLegRows = useCallback((rows: TopLegRow[]) => {
    const sorted = [...rows]
    const factor = topLegsSortDir === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      if (topLegsSortKey === 'edge') return (a.edge - b.edge) * factor
      if (topLegsSortKey === 'legEv') return (a.legEv - b.legEv) * factor
      if (topLegsSortKey === 'gameTime') return ((a.gameTimeMs ?? Number.MAX_SAFE_INTEGER) - (b.gameTimeMs ?? Number.MAX_SAFE_INTEGER)) * factor
      if (topLegsSortKey === 'player') return a.player.localeCompare(b.player) * factor
      return a.stat.localeCompare(b.stat) * factor
    })
    return sorted
  }, [topLegsSortDir, topLegsSortKey])

  const filterTopLegRows = useCallback((rows: TopLegRow[]) => {
    let out = rows
    if (topLegsNotStartedOnly) out = out.filter(r => r.eligibility === 'replacement_ready')
    if (topLegsStatFilter !== 'All') out = out.filter(r => r.stat === topLegsStatFilter)
    if (topLegsGameFilter !== 'All') {
      out = out.filter(r => {
        const ms = r.gameTimeMs
        if (!Number.isFinite(ms as number)) return false
        const t = new Date(ms as number).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        return `${t} ${r.team || 'TBD'}` === topLegsGameFilter
      })
    }
    out = out.filter(r => r.edge * 100 >= topLegsMinEdge)
    if (!showGoblins) out = out.filter(r => !r.isGoblin)
    if (!showDemons) out = out.filter(r => !r.isDemon)
    if (!showNonStandard) out = out.filter(r => !r.isNonStandardOdds)
    return out
  }, [showDemons, showGoblins, showNonStandard, topLegsGameFilter, topLegsMinEdge, topLegsNotStartedOnly, topLegsStatFilter])

  const topLegsPPFiltered = useMemo(() => sortTopLegRows(filterTopLegRows(topLegsPP)).slice(0, topLegsLimit), [filterTopLegRows, sortTopLegRows, topLegsLimit, topLegsPP])
  const topLegsUDFiltered = useMemo(() => sortTopLegRows(filterTopLegRows(topLegsUD)).slice(0, topLegsLimit), [filterTopLegRows, sortTopLegRows, topLegsLimit, topLegsUD])

  const matchMetrics = useMemo(() => {
    const propsConsidered = Number(mergeStage?.propsConsideredForMatchingRows ?? 0)
    const matched = Number(mergeStage?.matchedRows ?? 0)
    const unmatched = Number(mergeStage?.unmatchedPropRows ?? 0)
    const rate = propsConsidered > 0 ? matched / propsConsidered : 0

    const reasons =
      mergeStage?.unmatchedAttribution?.propsByReason ??
      matchGap?.unmatchedAttribution?.propsByReason ??
      {}
    const books =
      mergeStage?.unmatchedAttribution?.oddsByBook ??
      matchGap?.unmatchedAttribution?.oddsByBook ??
      {}

    const reasonRows = Object.entries(reasons).sort((a, b) => b[1] - a[1])
    const topReason = reasonRows[0]
    const topReasonLabel = topReason ? (REASON_LABELS[topReason[0]]?.label ?? topReason[0]) : 'None'

    const takeaway =
      propsConsidered > 0
        ? `Coverage is ${(rate * 100).toFixed(1)}% (${matched}/${propsConsidered}). Largest gap: ${topReasonLabel}${topReason ? ` (${topReason[1]} rows)` : ''}.`
        : 'Coverage artifact not available yet for this run.'

    return { propsConsidered, matched, unmatched, rate, reasonRows, books: Object.entries(books).sort((a, b) => b[1] - a[1]), takeaway }
  }, [matchGap, mergeStage])

  const exportTableCsv = useCallback(() => {
    const isLegs = activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud'
    const exportLegRows = activeTab === 'top_legs_pp' ? topLegsPPFiltered : topLegsUDFiltered
    const rows = isLegs
      ? exportLegRows.map((leg, i) => ({
          '#': i + 1, Site: leg.site, Player: leg.player, Stat: leg.stat, Side: leg.side, Line: leg.line, 'Leg EV%': (leg.legEv * 100).toFixed(2), 'Edge%': (leg.edge * 100).toFixed(2), 'Fair Prob%': leg.fairProb != null ? (leg.fairProb * 100).toFixed(2) : '', 'Breakeven%': leg.breakevenProb != null ? (leg.breakevenProb * 100).toFixed(2) : '', Team: leg.team ?? '', GameTime: leg.gameTime ?? '', Eligibility: leg.eligibility,
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
  }, [activeTab, filteredCards, legs, topLegsLimit, topLegsPPFiltered, topLegsUDFiltered])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AppHeader
        subtitle={`${activeTabMeta.label}: ${activeTabMeta.desc}`}
        cardsCount={filteredCards.length}
        ppCount={loadStats.pp}
        udCount={loadStats.ud}
        freshAgo={freshAgo}
      />

      <main className="max-w-[1800px] mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_340px] gap-4">
          <aside className="space-y-3">
            <section className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs space-y-2">
              <div className="text-gray-300 font-semibold">Filters</div>
              <select className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm" onChange={e => setSportFilter(e.target.value)} value={sportFilter}>
                <option>All</option><option>NBA</option><option>NCAAB</option><option>NHL</option><option>NFL</option><option>MLB</option>
              </select>
              <select className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm" onChange={e => setSiteFilter(e.target.value as 'All' | 'PP' | 'UD')} value={siteFilter}>
                <option value="All">Provider: All</option><option value="PP">PP</option><option value="UD">UD</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-gray-400">
                <input type="checkbox" checked={hideStartedGames} onChange={e => setHideStartedGames(e.target.checked)} className="rounded" />
                Hide started games
              </label>
              <div className="pt-1 border-t border-gray-800">
                <div className="text-[11px] text-gray-400 mb-1">Game window pills</div>
                <div className="flex flex-wrap gap-1">
                  {gamePills.pills.length === 0 && (
                    <span className="text-[10px] text-gray-500">No valid game groupings found.</span>
                  )}
                  {gamePills.pills.map(pill => {
                    const selected = selectedGameKeys.includes(pill.key)
                    return (
                      <button
                        key={pill.key}
                        type="button"
                        disabled={pill.isStarted}
                        onClick={() => {
                          if (pill.isStarted) return
                          setSelectedGameKeys(prev => prev.includes(pill.key) ? prev.filter(k => k !== pill.key) : [...prev, pill.key])
                        }}
                        className={`px-2 py-1 rounded border text-[10px] ${
                          pill.isStarted
                            ? 'bg-gray-900 text-gray-600 border-gray-800 cursor-not-allowed'
                            : selected
                              ? 'bg-cyan-900/40 text-cyan-300 border-cyan-700/60'
                              : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                        }`}
                        title={pill.isStarted ? 'Started game (unusable)' : `${pill.cardCount} cards`}
                      >
                        {pill.label} {pill.isStarted ? '(started)' : `(${pill.cardCount})`}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
                  <span>{selectedGameKeys.length > 0 ? `Selected games: ${selectedGameKeys.length}` : 'All valid games included'}</span>
                  {selectedGameKeys.length > 0 && (
                    <button type="button" className="text-cyan-400 hover:text-cyan-300" onClick={() => setSelectedGameKeys([])}>
                      Clear
                    </button>
                  )}
                </div>
                {gamePills.malformedCount > 0 && (
                  <div className="text-[10px] text-gray-600 mt-1">
                    Suppressed malformed game bubbles: {gamePills.malformedCount}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => exportTableCsv()} className="w-full px-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-left text-gray-300 text-[11px]">
                Export visible table
              </button>
              {copyStatus && <div className="text-green-400">{copyStatus}</div>}
            </section>

            <section className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs space-y-1">
              <div className="text-amber-400 font-semibold">Run Status</div>
              <div className="text-gray-300">PP: {loadStats.pp} cards / {loadStats.ppLegs} legs</div>
              <div className="text-gray-300">UD: {loadStats.ud} cards / {loadStats.udLegs} legs</div>
              <div className="text-gray-400">Bankroll: ${manifest?.bankroll ?? BANKROLL_DEFAULT}</div>
              {lastRefreshMs > 0 && <div className="text-gray-500">Refresh: {Math.round((Date.now() - lastRefreshMs) / 1000)}s ago</div>}
            </section>

            <section className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs space-y-1">
              <div className="text-cyan-400 font-semibold">Portfolio Range</div>
              <div className="text-gray-300">Top 10: ${portfolio.top10stake.toFixed(0)}</div>
              <div className="text-gray-300">Top 20: ${portfolio.top20stake.toFixed(0)}</div>
              <div className="text-gray-300">Total: ${portfolio.totalStake.toFixed(0)} ({portfolio.count} cards)</div>
              <div className="text-gray-500">Must {tierCounts.must_play} · Strong {tierCounts.strong} · Lot {tierCounts.lottery}</div>
            </section>
          </aside>

          <section className="space-y-3 min-w-0">
            <PrimarySecondaryTabs
              tabs={TABS}
              activeTab={activeTab}
              onTabChange={(tab) => { setActiveTab(tab); setExpandedCard(null) }}
              topLegsLimit={topLegsLimit}
              setTopLegsLimit={setTopLegsLimit}
            />

            {activeTab === 'tracker' ? (
              <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                <PickTracker />
              </div>
            ) : (activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud') ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs bg-gray-900 border border-gray-800 rounded-lg p-2">
                  <label className="flex items-center gap-1 text-gray-300">
                    <input type="checkbox" checked={topLegsNotStartedOnly} onChange={e => setTopLegsNotStartedOnly(e.target.checked)} />
                    Not-started only
                  </label>
                  <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={topLegsStatFilter} onChange={e => setTopLegsStatFilter(e.target.value)}>
                    <option value="All">Stat: All</option>
                    {topLegStats.stats.map(s => <option key={s} value={s}>{statAbbrev(s)}</option>)}
                  </select>
                  <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={topLegsGameFilter} onChange={e => setTopLegsGameFilter(e.target.value)}>
                    <option value="All">Game: All</option>
                    {topLegStats.games.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <label className="text-gray-300">
                    Min Edge %
                    <input type="number" value={topLegsMinEdge} onChange={e => setTopLegsMinEdge(Number(e.target.value) || 0)} className="ml-1 w-16 px-1 py-0.5 bg-gray-800 border border-gray-700 rounded" />
                  </label>
                  <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={showGoblins} onChange={e => setShowGoblins(e.target.checked)} />Goblin</label>
                  <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={showDemons} onChange={e => setShowDemons(e.target.checked)} />Demon</label>
                  <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={showNonStandard} onChange={e => setShowNonStandard(e.target.checked)} />Nonstandard</label>
                  <select className="ml-auto px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={`${topLegsSortKey}:${topLegsSortDir}`} onChange={e => {
                    const [k, d] = e.target.value.split(':') as [TopLegSortKey, SortDir]
                    setTopLegsSortKey(k); setTopLegsSortDir(d)
                  }}>
                    <option value="edge:desc">Sort Edge desc</option>
                    <option value="edge:asc">Sort Edge asc</option>
                    <option value="legEv:desc">Sort EV desc</option>
                    <option value="legEv:asc">Sort EV asc</option>
                    <option value="gameTime:asc">Sort Game asc</option>
                    <option value="gameTime:desc">Sort Game desc</option>
                    <option value="player:asc">Sort Player A-Z</option>
                    <option value="player:desc">Sort Player Z-A</option>
                    <option value="stat:asc">Sort Stat A-Z</option>
                    <option value="stat:desc">Sort Stat Z-A</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {[{ site: 'PP' as const, rows: topLegsPPFiltered }, { site: 'UD' as const, rows: topLegsUDFiltered }].map(({ site, rows }) => (
                    <div key={site} className="dfs-table-wrapper rounded-lg border border-gray-800 overflow-x-auto overflow-y-auto max-h-[70vh] p-0">
                      <div className={`px-3 py-2 text-xs font-semibold border-b border-gray-800 ${site === 'PP' ? 'text-blue-300' : 'text-orange-300'}`}>{site} Top Legs ({rows.length})</div>
                      <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 bg-black text-gray-400 z-10">
                          <tr>
                            <th className="px-2 py-1 text-left">Player</th>
                            <th className="px-2 py-1 text-left">Stat</th>
                            <th className="px-2 py-1 text-left">Side/Line</th>
                            <th className="px-2 py-1 text-right">Edge%</th>
                            <th className="px-2 py-1 text-right">EV%</th>
                            <th className="px-2 py-1 text-right">Fair%</th>
                            <th className="px-2 py-1 text-right">BE%</th>
                            <th className="px-2 py-1 text-left">Game</th>
                            <th className="px-2 py-1 text-left">Status</th>
                            <th className="px-2 py-1 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-300">
                          {rows.map((leg) => {
                            const tags = [leg.isGoblin ? 'G' : '', leg.isDemon ? 'D' : '', leg.isNonStandardOdds ? 'NS' : ''].filter(Boolean).join(' ')
                            const compactLeg = `${leg.player} ${statAbbrev(leg.stat)} ${leg.side === 'under' ? 'u' : 'o'}${leg.line}`
                            return (
                              <tr key={leg.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td className="px-2 py-1">
                                  <button type="button" className={`underline decoration-dotted ${copiedPlayerName === leg.player ? 'text-green-300' : 'text-cyan-300 hover:text-cyan-200'}`} onClick={(e) => copyPlayerName(leg.player, e)}>{leg.player}</button>
                                </td>
                                <td className="px-2 py-1">{statAbbrev(leg.stat)}</td>
                                <td className="px-2 py-1">
                                  <span className="font-medium">{leg.side === 'under' ? 'Under' : 'Over'} {leg.line}</span>
                                  {tags && <span className="ml-1 text-[10px] text-amber-300">[{tags}]</span>}
                                </td>
                                <td className="px-2 py-1 text-right">{(leg.edge * 100).toFixed(2)}</td>
                                <td className="px-2 py-1 text-right">{(leg.legEv * 100).toFixed(2)}</td>
                                <td className="px-2 py-1 text-right">{leg.fairProb != null ? (leg.fairProb * 100).toFixed(2) : '—'}</td>
                                <td className="px-2 py-1 text-right">{leg.breakevenProb != null ? (leg.breakevenProb * 100).toFixed(2) : '—'}</td>
                                <td className="px-2 py-1 text-xs">{leg.team ?? 'TBD'} {leg.gameTime ? `· ${new Date(leg.gameTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</td>
                                <td className="px-2 py-1 text-xs">
                                  {leg.eligibility === 'replacement_ready'
                                    ? <span className="text-emerald-300">replacement-ready</span>
                                    : <span className="text-red-300">started/unusable</span>}
                                </td>
                                <td className="px-2 py-1 text-xs">
                                  <button type="button" className="text-gray-300 hover:text-white underline decoration-dotted" onClick={(e) => { e.stopPropagation(); copyToClipboard(compactLeg).then(ok => setCopyStatus(ok ? 'Copied leg' : 'Copy failed')) }}>
                                    copy leg
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {tier1CountInView === 0 && (
                  <div className="text-xs px-3 py-2 rounded border border-amber-700/40 bg-amber-900/15 text-amber-200">
                    No Tier 1 cards in current view. Consider reducing filters or treating this slate as lower-conviction.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs bg-gray-900 border border-gray-800 rounded-lg p-2">
                  <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={cardTypeFilter} onChange={e => setCardTypeFilter(e.target.value)}>
                    <option value="All">Card type: All</option>
                    {cardFilterOptions.types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={cardGameFilter} onChange={e => setCardGameFilter(e.target.value)}>
                    <option value="All">Game time: All</option>
                    {cardFilterOptions.games.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <label className="text-gray-300">
                    Min Edge %
                    <input type="number" value={cardMinEdge} onChange={e => setCardMinEdge(Number(e.target.value) || 0)} className="ml-1 w-16 px-1 py-0.5 bg-gray-800 border border-gray-700 rounded" />
                  </label>
                  <select className="ml-auto px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={`${cardSortKey}:${cardSortDir}`} onChange={e => {
                    const [k, d] = e.target.value.split(':') as [CardSortKey, SortDir]
                    setCardSortKey(k); setCardSortDir(d)
                  }}>
                    <option value="ev:desc">Sort EV desc</option>
                    <option value="ev:asc">Sort EV asc</option>
                    <option value="edge:desc">Sort Edge desc</option>
                    <option value="edge:asc">Sort Edge asc</option>
                    <option value="gameTime:asc">Sort Game asc</option>
                    <option value="gameTime:desc">Sort Game desc</option>
                    <option value="player:asc">Sort Player A-Z</option>
                    <option value="player:desc">Sort Player Z-A</option>
                    <option value="cardType:asc">Sort Type A-Z</option>
                    <option value="cardType:desc">Sort Type Z-A</option>
                  </select>
                </div>

              <div className="dfs-table-wrapper rounded-lg border border-gray-800">
                <table className="dfs-table">
                  <colgroup>
                    <col className="col-expand" />
                    <col className="col-site" />
                    <col className="col-player" />
                    <col className="col-tier" />
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
                      <th className="col-site">Provider</th>
                      <th className="col-player">Players / Legs</th>
                      <th className="col-tier">Type</th>
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
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No cards in this tab. Try "All Cards" or change filters.</td></tr>
                    )}
                    {filteredCards.slice(0, 50).map((card, i) => {
                      const isExpanded = expandedCard === i
                      const ppl = resolvePlayerPropLine(card, legs)
                      const cardLegs = getLegIds(card).map(id => legs.get(id)).filter((x): x is LegInfo => !!x)
                      const edgePct = Number(card.avgEdgePct) <= 1 ? Number(card.avgEdgePct) * 100 : Number(card.avgEdgePct)
                      const winPct = card.winProbCash ? (Number(card.winProbCash) * 100).toFixed(1) : '—'
                      const score = Number(card.bestBetScore) ?? 0
                      const tier = card.bestBetTier || 'skip'
                      const tierStyle = TIER_STYLE[tier] || TIER_STYLE.skip
                      const tierLbl = card.bestBetTierLabel || TIER_LABEL[tier] || tier
                      const tierPriority = TIER_PRIORITY_LABEL[tier] || 'Tier ?'
                      const displayedStake = portfolio.displayedStake(card, card.kellyStake)
                      const siteLeg = card.siteLeg ?? `${String(card.site).toLowerCase()}-${card.flexType?.toLowerCase()}`
                      const mainPlayer = primaryPlayerName(card, legs)
                      const lineWithoutLeadPlayer = (mainPlayer && ppl.startsWith(mainPlayer))
                        ? ppl.slice(mainPlayer.length).trimStart()
                        : ppl
                      const startMs = cardStartMs(card, legs)
                      const eligibility = cardEligibility(card, legs)
                      const startLabel = Number.isFinite(startMs) ? new Date(startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'
                      return (
                        <Fragment key={`card-${i}`}>
                          <tr
                            className={`transition-colors cursor-pointer ${isExpanded ? 'bg-gray-800/60' : 'hover:bg-gray-800/30'} ${tier === 'must_play' ? 'bg-emerald-950/20' : ''}`}
                            onClick={() => setExpandedCard(isExpanded ? null : i)}
                          >
                            <td className="col-expand text-center align-middle">{isExpanded ? '▲' : '▼'}</td>
                            <td className="col-site whitespace-nowrap">
                              <span className={`font-medium ${card.site === 'PP' ? 'text-blue-400' : 'text-orange-400'}`}>{siteLeg}</span>
                              <div className="text-[10px] text-gray-500">{startLabel}</div>
                            </td>
                            <td className="col-player text-gray-200" title={ppl}>
                              {mainPlayer && (
                                <button
                                  type="button"
                                  className={`mr-1 underline decoration-dotted ${copiedPlayerName === mainPlayer ? 'text-green-300' : 'text-cyan-300 hover:text-cyan-200'}`}
                                  onClick={(e) => copyPlayerName(mainPlayer, e)}
                                >
                                  {mainPlayer}
                                </button>
                              )}
                              <span>{lineWithoutLeadPlayer}</span>
                              <div className="text-[10px] text-gray-500">{eligibility === 'replacement_ready' ? 'replacement-ready' : 'started/unusable'}</div>
                            </td>
                            <td className="col-tier text-center">{cardTypeLabel(card)}</td>
                            <td className="col-tier">
                              <div className={`tier-badge ${tierStyle}`}>{tierLbl}</div>
                              <div className={`text-[10px] ${tier === 'must_play' ? 'text-emerald-300 font-medium' : 'text-gray-500'}`}>{tierPriority}</div>
                            </td>
                            <td className="col-score font-mono text-right">{score.toFixed(0)}</td>
                            <td className="col-ev text-right font-bold text-green-300">{(Number(card.cardEv) * 100).toFixed(1)}%</td>
                            <td className="col-win text-right text-gray-300">{winPct}%</td>
                            <td className="col-edge text-right font-semibold text-gray-200">{edgePct.toFixed(1)}%</td>
                            <td className="col-kelly text-right font-bold text-white">${displayedStake.toFixed(2)}</td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-gray-900/50">
                              <td colSpan={10} className="px-3 py-2">
                                <div className="text-[11px] text-gray-300 space-y-1">
                                  {cardLegs.length === 0 && <div className="text-gray-500">No leg rows available.</div>}
                                  {cardLegs.map((leg, li) => (
                                    <div key={`${cardKey(card)}-${leg.id}-${li}`} className="flex items-center gap-2 border border-gray-800 rounded px-2 py-1">
                                      <span className="text-gray-500 w-5">{li + 1}.</span>
                                      <button type="button" className={`underline decoration-dotted ${copiedPlayerName === leg.player ? 'text-green-300' : 'text-cyan-300 hover:text-cyan-200'}`} onClick={(e) => copyPlayerName(leg.player, e)}>
                                        {leg.player}
                                      </button>
                                      <span className="text-gray-300">{statAbbrev(leg.stat)} o{leg.line}</span>
                                      <span className="text-gray-500 ml-auto">{leg.gameTime ? new Date(leg.gameTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'}</span>
                                      <button type="button" className="text-gray-400 hover:text-white underline decoration-dotted" onClick={(e) => copyLeg(leg, e)}>copy leg</button>
                                    </div>
                                  ))}
                                  <div className="pt-1">
                                    <button type="button" className="text-gray-300 hover:text-white underline decoration-dotted" onClick={(e) => copyParlay(card, e)}>copy card text</button>
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
              </div>
            )}
          </section>

          <aside className="space-y-3">
            <section className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs">
              <div className="text-purple-300 font-semibold mb-2">Card Detail</div>
              {!selectedCard ? (
                <div className="text-gray-500">Select a row to inspect card details.</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-gray-300">{resolvePlayerPropLine(selectedCard, legs)}</div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-gray-800/70 rounded border border-gray-700">Tier: <span className="text-white">{selectedCard.bestBetTierLabel ?? selectedCard.bestBetTier ?? '—'}</span></div>
                    <div className="p-2 bg-gray-800/70 rounded border border-gray-700">Score: <span className="text-white">{(Number(selectedCard.bestBetScore) || 0).toFixed(0)}</span></div>
                    <div className="p-2 bg-gray-800/70 rounded border border-gray-700">EV: <span className="text-green-400">{(Number(selectedCard.cardEv) * 100).toFixed(1)}%</span></div>
                    <div className="p-2 bg-gray-800/70 rounded border border-gray-700">Win: <span className="text-white">{selectedCard.winProbCash != null ? `${(selectedCard.winProbCash * 100).toFixed(1)}%` : '—'}</span></div>
                    <div className="p-2 bg-gray-800/70 rounded border border-gray-700">Edge: <span className="text-white">{(Number(selectedCard.avgEdgePct) <= 1 ? Number(selectedCard.avgEdgePct) * 100 : Number(selectedCard.avgEdgePct)).toFixed(1)}%</span></div>
                    <div className="p-2 bg-gray-800/70 rounded border border-gray-700">Kelly: <span className="text-white">${portfolio.displayedStake(selectedCard, selectedCard.kellyStake).toFixed(2)}</span></div>
                  </div>
                  <div className="pt-1 border-t border-gray-800">
                    <div className="text-cyan-400 font-semibold mb-1">Actions</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={(e) => copyParlay(selectedCard, e)} className="px-2 py-1 bg-green-900/40 text-green-300 rounded border border-green-700/50 hover:bg-green-800/40">
                        Copy Parlay
                      </button>
                      <a href={selectedCard.site === 'UD' ? udFullSlipUrl(getLegIds(selectedCard)) : PP_PROJECTIONS} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-gray-800 text-gray-200 rounded border border-gray-700 hover:bg-gray-700">
                        Open Board
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs space-y-2">
              <button
                type="button"
                onClick={() => setExpandedResultsPast(prev => !prev)}
                className="w-full text-left px-2 py-1.5 bg-gray-800 rounded border border-gray-700 hover:bg-gray-700 text-gray-300"
              >
                Results Snapshot {expandedResultsPast ? '▼' : '▶'}
              </button>
              {expandedResultsPast && (
                <div className="grid grid-cols-5 gap-1 text-[10px]">
                  {[
                    { label: 'Day', box: resultsSummary.day },
                    { label: 'Week', box: resultsSummary.week },
                    { label: 'Month', box: resultsSummary.month },
                    { label: 'LT', box: resultsSummary.lt },
                    { label: 'Past', box: resultsSummary.past },
                  ].map(({ label, box }) => (
                    <div key={label} className="p-1.5 rounded border border-gray-800 bg-black/30 text-center">
                      <div className="text-gray-500">{label}</div>
                      <div className="text-gray-200">{box.hits}/{box.total}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sky-300 font-semibold">Match Coverage Quality</div>
                <button
                  type="button"
                  onClick={() => setIsAdminMetricsView(v => !v)}
                  className="text-[10px] px-2 py-0.5 rounded border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
                  title="Toggle guest/admin diagnostics view"
                >
                  {isAdminMetricsView ? 'Admin' : 'Guest'}
                </button>
              </div>
              <div className="text-[11px] text-gray-300">{matchMetrics.takeaway}</div>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <div className="p-1.5 rounded border border-gray-800 bg-black/30 text-center">
                  <div className="text-gray-500">Coverage</div>
                  <div className="text-gray-200">{(matchMetrics.rate * 100).toFixed(1)}%</div>
                </div>
                <div className="p-1.5 rounded border border-gray-800 bg-black/30 text-center">
                  <div className="text-gray-500">Matched</div>
                  <div className="text-gray-200">{matchMetrics.matched}</div>
                </div>
                <div className="p-1.5 rounded border border-gray-800 bg-black/30 text-center">
                  <div className="text-gray-500">Unmatched</div>
                  <div className="text-gray-200">{matchMetrics.unmatched}</div>
                </div>
              </div>

              {!isAdminMetricsView ? (
                <div className="space-y-1">
                  {matchMetrics.reasonRows.slice(0, 4).map(([code, count]) => {
                    const meta = REASON_LABELS[code] ?? { label: code, help: 'No description available.' }
                    return (
                      <div key={code} className="text-[10px] border border-gray-800 rounded p-1.5 bg-black/20">
                        <div className="text-gray-200">{meta.label}: {count}</div>
                        <div className="text-gray-500">{meta.help}</div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">Reason Diagnostics (code + label)</div>
                    <div className="max-h-24 overflow-auto border border-gray-800 rounded">
                      <table className="w-full text-[10px]">
                        <thead className="bg-black text-gray-500">
                          <tr><th className="px-1 py-1 text-left">Code</th><th className="px-1 py-1 text-left">Label</th><th className="px-1 py-1 text-right">Count</th></tr>
                        </thead>
                        <tbody>
                          {matchMetrics.reasonRows.map(([code, count]) => (
                            <tr key={code} className="border-t border-gray-800">
                              <td className="px-1 py-1 text-gray-300">{code}</td>
                              <td className="px-1 py-1 text-gray-300">{REASON_LABELS[code]?.label ?? code}</td>
                              <td className="px-1 py-1 text-right text-gray-200">{count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">Unmatched Odds by Book</div>
                    <div className="max-h-20 overflow-auto border border-gray-800 rounded p-1 bg-black/20">
                      {matchMetrics.books.length === 0 && <div className="text-[10px] text-gray-500">No book-level diagnostics available.</div>}
                      {matchMetrics.books.map(([book, count]) => (
                        <div key={book} className="text-[10px] text-gray-300 flex justify-between"><span>{book}</span><span>{count}</span></div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>

        <div className="mt-3 text-xs text-gray-600 flex flex-wrap gap-4">
          {activeTab === 'tracker' ? (
            <span>Grade legs (Win/Loss/Push) and save to data/tracking/pending_cards.json</span>
          ) : (activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud') ? (
            <span>Top {topLegsLimit} legs by EV · {activeTab === 'top_legs_pp' ? 'PP' : 'UD'} · 60s refresh</span>
          ) : (
            <span>Showing top {Math.min(50, filteredCards.length)} of {filteredCards.length} · 60s refresh</span>
          )}
          {siteFilter !== 'All' && <span>Provider filter: {siteFilter}</span>}
          <span>NBA-first operator shell; provider-neutral labels where practical.</span>
        </div>
      </main>
    </div>
  )
}

export default App
