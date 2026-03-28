import { useEffect, useState, useMemo, useCallback } from 'react'
import Papa from 'papaparse'
import type { Card, LegInfo, LegsLookup, BestBetTier } from './types'
import { filterUD } from './data/odds'
import PickTracker from './components/PickTracker'
import AppHeader from './components/AppHeader'
import PrimarySecondaryTabs from './components/PrimarySecondaryTabs'
import TopLegsView from './components/TopLegsView'
import CardsView from './components/CardsView'
import CanonicalSamplesPanel from './components/CanonicalSamplesPanel'
import OptimizerStatePanels from './components/OptimizerStatePanels'
import type { LegsWindowSnapshot, OpportunityTopCardRow } from './components/OptimizerStatePanels'
import DashboardPageNav, { dashboardPageFromSearch, type DashboardPageId } from './components/DashboardPageNav'
import { parseExploreUrl, stripExploreKeys, syncExploreKeys } from './lib/exploreUrlState'
import { resolveCanonicalSamplesFetchBase } from './lib/canonicalSamples'
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

interface LoadStats {
  pp: number
  ud: number
  ppLegs: number
  udLegs: number
  /** Legs with game time strictly in the future (full CSV, not top-100 view). */
  ppLegsNotStarted: number
  udLegsNotStarted: number
  /** Earliest future game time across PP+UD leg CSVs, in ms from now (undefined if none). */
  msUntilEarliestNotStarted?: number
  /** True after first legs CSV fetch attempt completes. */
  csvSnapshotReady: boolean
  error?: string
}

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
  /** Phase P/R — PP merged legs only; from synced legs CSV. */
  ppNConsensusBooks?: number
  ppConsensusDevigSpreadOver?: number
}

type TopLegSortKey = 'edge' | 'legEv' | 'gameTime' | 'player' | 'stat' | 'ppBooks' | 'ppSpread'
/** Phase S — PP-only triage preset (UD rows always pass the filter). */
type TopLegPpConsensusTriage = 'any' | 'tight_spread' | 'wide_spread' | 'many_books'
type SortDir = 'asc' | 'desc'
type CardSortKey = 'edge' | 'ev' | 'gameTime' | 'player' | 'cardType'

/** Phase T — defaults when URL has no explore overrides (or page ≠ explore). */
const DEFAULT_EXPLORE_BOOT = {
  activeTab: 'must_play' as TabId,
  topLegsLimit: 50 as 25 | 50 | 100,
  topLegsSortKey: 'edge' as TopLegSortKey,
  topLegsSortDir: 'desc' as SortDir,
  topLegsPpConsensusTriage: 'any' as TopLegPpConsensusTriage,
  topLegsStatFilter: 'All',
  topLegsGameFilter: 'All',
}
type ExploreBootState = typeof DEFAULT_EXPLORE_BOOT

/** Phase T/V — parse `page` + Explore fields from a search string (SSR-safe when `search` is passed explicitly). */
function readPageAndExploreFromSearch(search: string): {
  page: DashboardPageId
  explore: ExploreBootState
} {
  const page = dashboardPageFromSearch(search)
  if (page !== 'explore') {
    return { page, explore: DEFAULT_EXPLORE_BOOT }
  }
  const p = parseExploreUrl(search)
  return {
    page,
    explore: {
      activeTab: p.tab ?? DEFAULT_EXPLORE_BOOT.activeTab,
      topLegsLimit: p.legsTop ?? DEFAULT_EXPLORE_BOOT.topLegsLimit,
      topLegsSortKey: (p.legsSortKey as TopLegSortKey) ?? DEFAULT_EXPLORE_BOOT.topLegsSortKey,
      topLegsSortDir: (p.legsSortDir as SortDir) ?? DEFAULT_EXPLORE_BOOT.topLegsSortDir,
      topLegsPpConsensusTriage: (p.ppFocus as TopLegPpConsensusTriage) ?? DEFAULT_EXPLORE_BOOT.topLegsPpConsensusTriage,
      topLegsStatFilter: p.legsStat ?? DEFAULT_EXPLORE_BOOT.topLegsStatFilter,
      topLegsGameFilter: p.legsGame ?? DEFAULT_EXPLORE_BOOT.topLegsGameFilter,
    },
  }
}

function readAppBootState(): { page: DashboardPageId; explore: ExploreBootState } {
  if (typeof window === 'undefined') {
    return { page: 'overview', explore: DEFAULT_EXPLORE_BOOT }
  }
  return readPageAndExploreFromSearch(window.location.search)
}

const APP_BOOT = readAppBootState()

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

interface Tier1ScarcityLite {
  summary?: {
    tier1Count?: number
    totalCards?: number
    tier1Rate?: number
    isTier1Scarce?: boolean
    primaryReasonCode?: string
  }
  bySite?: {
    PP?: { totalCards?: number; tier1Cards?: number }
    UD?: { totalCards?: number; tier1Cards?: number }
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

/** Phase R — optional numeric leg CSV fields (PP consensus); empty/non-finite → undefined. */
function parseOptionalCsvNumber(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'string' && v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
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
  const [activeTab, setActiveTab] = useState<TabId>(APP_BOOT.explore.activeTab)
  const [loadStats, setLoadStats] = useState<LoadStats>({
    pp: 0,
    ud: 0,
    ppLegs: 0,
    udLegs: 0,
    ppLegsNotStarted: 0,
    udLegsNotStarted: 0,
    csvSnapshotReady: false,
  })
  const [topLegsPP, setTopLegsPP] = useState<TopLegRow[]>([])
  const [topLegsUD, setTopLegsUD] = useState<TopLegRow[]>([])
  const [topLegsLimit, setTopLegsLimit] = useState<25 | 50 | 100>(APP_BOOT.explore.topLegsLimit)
  const [topLegsSortKey, setTopLegsSortKey] = useState<TopLegSortKey>(APP_BOOT.explore.topLegsSortKey)
  const [topLegsSortDir, setTopLegsSortDir] = useState<SortDir>(APP_BOOT.explore.topLegsSortDir)
  const [topLegsNotStartedOnly, setTopLegsNotStartedOnly] = useState(true)
  const [topLegsStatFilter, setTopLegsStatFilter] = useState<string>(APP_BOOT.explore.topLegsStatFilter)
  const [topLegsGameFilter, setTopLegsGameFilter] = useState<string>(APP_BOOT.explore.topLegsGameFilter)
  const [topLegsMinEdge, setTopLegsMinEdge] = useState<number>(0)
  const [topLegsPpConsensusTriage, setTopLegsPpConsensusTriage] = useState<TopLegPpConsensusTriage>(
    APP_BOOT.explore.topLegsPpConsensusTriage
  )
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
  const [canonicalSamplesView, setCanonicalSamplesView] = useState(false)
  const [dashboardPage, setDashboardPage] = useState<DashboardPageId>(APP_BOOT.page)
  const [mergeStage, setMergeStage] = useState<MergeStageAccountingLite | null>(null)
  const [matchGap, setMatchGap] = useState<MatchGapAttributionLite | null>(null)
  const [tier1Scarcity, setTier1Scarcity] = useState<Tier1ScarcityLite | null>(null)

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
    if (params.get('view') === 'canonical-samples') setCanonicalSamplesView(true)
  }, [])

  /** Phase V — Back/Forward restores URL-driven dashboard + Explore state (same parser as initial load). */
  useEffect(() => {
    const onPopState = () => {
      const search = window.location.search
      const params = new URLSearchParams(search)
      setIsAdminMetricsView(params.get('view') === 'admin')
      setCanonicalSamplesView(params.get('view') === 'canonical-samples')

      const { page, explore } = readPageAndExploreFromSearch(search)
      setDashboardPage(page)
      setActiveTab(explore.activeTab)
      setTopLegsLimit(explore.topLegsLimit)
      setTopLegsSortKey(explore.topLegsSortKey)
      setTopLegsSortDir(explore.topLegsSortDir)
      setTopLegsPpConsensusTriage(explore.topLegsPpConsensusTriage)
      setTopLegsStatFilter(explore.topLegsStatFilter)
      setTopLegsGameFilter(explore.topLegsGameFilter)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigateDashboardPage = useCallback((id: DashboardPageId) => {
    setDashboardPage(id)
    const u = new URL(window.location.href)
    if (id === 'overview') u.searchParams.delete('page')
    else u.searchParams.set('page', id)
    if (id !== 'explore') stripExploreKeys(u.searchParams)
    window.history.replaceState(null, '', u.toString())
  }, [])

  /** Phase T — keep explore triage/tab/limit in the URL for shareable links (non-destructive to other query keys). */
  useEffect(() => {
    if (canonicalSamplesView) return
    const u = new URL(window.location.href)
    if (dashboardPage !== 'explore') {
      stripExploreKeys(u.searchParams)
      window.history.replaceState(null, '', u.toString())
      return
    }
    syncExploreKeys(u.searchParams, {
      tab: activeTab,
      topLegsLimit,
      topLegsSortKey,
      topLegsSortDir,
      topLegsPpConsensusTriage,
      topLegsStatFilter,
      topLegsGameFilter,
    })
    window.history.replaceState(null, '', u.toString())
  }, [
    activeTab,
    canonicalSamplesView,
    dashboardPage,
    topLegsGameFilter,
    topLegsLimit,
    topLegsPpConsensusTriage,
    topLegsSortDir,
    topLegsSortKey,
    topLegsStatFilter,
  ])

  useEffect(() => {
    fetch('/artifacts/merge_stage_accounting.json')
      .then(r => (r.ok ? r.json() : null))
      .then((m: MergeStageAccountingLite | null) => { if (m) setMergeStage(m) })
      .catch(() => {})
    fetch('/artifacts/merge_match_gap_attribution.json')
      .then(r => (r.ok ? r.json() : null))
      .then((m: MatchGapAttributionLite | null) => { if (m) setMatchGap(m) })
      .catch(() => {})
    fetch('/artifacts/tier1_scarcity_attribution.json')
      .then(r => (r.ok ? r.json() : null))
      .then((m: Tier1ScarcityLite | null) => { if (m) setTier1Scarcity(m) })
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
      let ppLegsNotStarted = 0, udLegsNotStarted = 0
      const countCsvLegsNotStarted = (rows: any[]): number => {
        let n = 0
        for (const r of rows) {
          const ms = parseGameTimeMs(r.gameTime ?? r.GameTime)
          if (Number.isFinite(ms) && ms > Date.now()) n++
        }
        return n
      }
      if (ppLegsRes.status === 'fulfilled') {
        const m = buildLegsLookup(ppLegsRes.value)
        ppLegCount = m.size
        ppLegsNotStarted = countCsvLegsNotStarted(ppLegsRes.value)
        m.forEach((v, k) => legsMap.set(k, v))
      }
      if (udLegsRes.status === 'fulfilled') {
        const m = buildLegsLookup(udLegsRes.value)
        udLegCount = m.size
        udLegsNotStarted = countCsvLegsNotStarted(udLegsRes.value)
        m.forEach((v, k) => legsMap.set(k, v))
      }

      const earliestFutureDeltaMs = (ppRows: any[] | null, udRows: any[] | null): number | undefined => {
        const now = Date.now()
        let min: number | null = null
        for (const rows of [ppRows, udRows]) {
          if (!rows) continue
          for (const r of rows) {
            const ms = parseGameTimeMs(r.gameTime ?? r.GameTime)
            if (Number.isFinite(ms) && ms > now) {
              if (min === null || ms < min) min = ms
            }
          }
        }
        if (min === null) return undefined
        return Math.max(0, min - now)
      }
      const msUntilEarliestNotStarted = earliestFutureDeltaMs(
        ppLegsRes.status === 'fulfilled' ? ppLegsRes.value : null,
        udLegsRes.status === 'fulfilled' ? udLegsRes.value : null
      )

      setLegs(legsMap)
      const merged = [...ppCards, ...udCards]
      const seen = new Set<string>()
      const deduped = merged.filter(c => { const k = cardKey(c); if (seen.has(k)) return false; seen.add(k); return true })
      setCards(deduped)
      setLoadStats({
        pp: ppCards.length,
        ud: udCards.length,
        ppLegs: ppLegCount,
        udLegs: udLegCount,
        ppLegsNotStarted,
        udLegsNotStarted,
        msUntilEarliestNotStarted,
        csvSnapshotReady: true,
        error: errorMsg,
      })

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
        ppNConsensusBooks: site === 'PP' ? parseOptionalCsvNumber(r.ppNConsensusBooks) : undefined,
        ppConsensusDevigSpreadOver: site === 'PP' ? parseOptionalCsvNumber(r.ppConsensusDevigSpreadOver) : undefined,
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

  const opportunitySliceCards = useMemo((): Card[] => {
    return [...scoredCards].sort((a, b) => Number(b.cardEv) - Number(a.cardEv)).slice(0, 5)
  }, [scoredCards])

  const opportunityTopCards = useMemo((): OpportunityTopCardRow[] => {
    return opportunitySliceCards.map((c) => {
      const full = resolvePlayerPropLine(c, legs)
      const summaryLine = full.length > 100 ? `${full.slice(0, 100)}…` : full
      const ft = String(c.flexType ?? '').trim()
      return {
        flexType: ft || `${getLegIds(c).length}-leg`,
        cardEv: Number(c.cardEv) || 0,
        site: (c.site ?? '').toUpperCase() === 'UD' ? 'UD' : 'PP',
        summaryLine,
      }
    })
  }, [opportunitySliceCards, legs])

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

  const legsWindowSnapshot = useMemo((): LegsWindowSnapshot => ({
    loaded: loadStats.csvSnapshotReady,
    ppNotStarted: loadStats.ppLegsNotStarted,
    udNotStarted: loadStats.udLegsNotStarted,
    totalLegRows: loadStats.ppLegs + loadStats.udLegs,
    msUntilEarliestNotStarted: loadStats.msUntilEarliestNotStarted,
  }), [loadStats])

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

  const headerSubtitle = useMemo(() => {
    if (dashboardPage === 'overview') return 'Overview — run health, export verdict, operator cue'
    if (dashboardPage === 'diagnostics')
      return 'Diagnostics — live inputs, validation, merge and pipeline audit'
    return `${activeTabMeta.label}: ${activeTabMeta.desc}`
  }, [dashboardPage, activeTabMeta])

  const headerCardCount = dashboardPage === 'explore' ? filteredCards.length : loadStats.pp + loadStats.ud

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
      if (topLegsSortKey === 'stat') return a.stat.localeCompare(b.stat) * factor
      if (topLegsSortKey === 'ppBooks') {
        const am = a.ppNConsensusBooks == null ? 1 : 0
        const bm = b.ppNConsensusBooks == null ? 1 : 0
        if (am !== bm) return am - bm
        return ((a.ppNConsensusBooks ?? 0) - (b.ppNConsensusBooks ?? 0)) * factor
      }
      const am = a.ppConsensusDevigSpreadOver == null ? 1 : 0
      const bm = b.ppConsensusDevigSpreadOver == null ? 1 : 0
      if (am !== bm) return am - bm
      return ((a.ppConsensusDevigSpreadOver ?? 0) - (b.ppConsensusDevigSpreadOver ?? 0)) * factor
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
    /** Phase S — preset triage on PP legs only (fixed cutoffs; documented in UI). */
    const TIGHT_SPREAD_MAX = 0.015
    const WIDE_SPREAD_MIN = 0.022
    const MANY_BOOKS_MIN = 3
    if (topLegsPpConsensusTriage !== 'any') {
      out = out.filter((r) => {
        if (r.site !== 'PP') return true
        if (topLegsPpConsensusTriage === 'tight_spread') {
          const s = r.ppConsensusDevigSpreadOver
          return s != null && s <= TIGHT_SPREAD_MAX
        }
        if (topLegsPpConsensusTriage === 'wide_spread') {
          const s = r.ppConsensusDevigSpreadOver
          return s != null && s >= WIDE_SPREAD_MIN
        }
        const b = r.ppNConsensusBooks
        return b != null && b >= MANY_BOOKS_MIN
      })
    }
    return out
  }, [
    showDemons,
    showGoblins,
    showNonStandard,
    topLegsGameFilter,
    topLegsMinEdge,
    topLegsNotStartedOnly,
    topLegsStatFilter,
    topLegsPpConsensusTriage,
  ])

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
          '#': i + 1,
          Site: leg.site,
          Player: leg.player,
          Stat: leg.stat,
          Side: leg.side,
          Line: leg.line,
          'Leg EV%': (leg.legEv * 100).toFixed(2),
          'Edge%': (leg.edge * 100).toFixed(2),
          'Fair Prob%': leg.fairProb != null ? (leg.fairProb * 100).toFixed(2) : '',
          'Breakeven%': leg.breakevenProb != null ? (leg.breakevenProb * 100).toFixed(2) : '',
          'PP consensus books': leg.ppNConsensusBooks != null ? String(leg.ppNConsensusBooks) : '',
          'PP DV spread (over)': leg.ppConsensusDevigSpreadOver != null ? leg.ppConsensusDevigSpreadOver.toFixed(4) : '',
          Team: leg.team ?? '',
          GameTime: leg.gameTime ?? '',
          Eligibility: leg.eligibility,
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

  if (canonicalSamplesView) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <AppHeader
          subtitle="Canonical samples (read-only regression surface)"
          cardsCount={0}
          ppCount={0}
          udCount={0}
          freshAgo={null}
        />
        <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">
          <p className="text-sm text-gray-400">
            Query: <code className="text-gray-300">?view=canonical-samples</code> — loads JSON from{" "}
            <code className="text-gray-300">public/data/canonical_samples/</code> via the Phase 22 consumer path.
          </p>
          <CanonicalSamplesPanel fetchBaseUrl={resolveCanonicalSamplesFetchBase(window.location.search)} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <AppHeader
        subtitle={headerSubtitle}
        cardsCount={headerCardCount}
        ppCount={loadStats.pp}
        udCount={loadStats.ud}
        freshAgo={freshAgo}
        pageNav={<DashboardPageNav active={dashboardPage} onChange={navigateDashboardPage} />}
      />

      <main className="max-w-[1800px] mx-auto px-4 py-4">

        <div className={dashboardPage === 'explore' ? 'hidden' : ''} aria-hidden={dashboardPage === 'explore'}>
          <OptimizerStatePanels
            dataBase={DATA_BASE}
            legsWindow={legsWindowSnapshot}
            opportunityTopCards={opportunityTopCards}
            concentrationCards={opportunitySliceCards}
            legsForConcentration={legs}
            variant={dashboardPage === 'diagnostics' ? 'diagnostics' : 'overview'}
            dataFreshnessLabel={freshAgo}
            csvSnapshotCounts={{ pp: loadStats.pp, ud: loadStats.ud }}
          />
        </div>

        {dashboardPage === 'diagnostics' && (
          <section
            className="mt-4 p-3 rounded-lg border border-zinc-800/50 bg-zinc-900/25 text-xs space-y-2"
            data-testid="match-coverage-diagnostics"
          >
            <div className="flex items-center justify-between">
              <div className="text-zinc-200 font-medium">Match coverage quality</div>
              <button
                type="button"
                onClick={() => setIsAdminMetricsView(v => !v)}
                className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-300 hover:bg-zinc-800"
                title="Toggle guest/admin diagnostics view"
              >
                {isAdminMetricsView ? 'Admin' : 'Guest'}
              </button>
            </div>
            <div className="text-[11px] text-zinc-400">{matchMetrics.takeaway}</div>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <div className="p-1.5 rounded-md bg-zinc-950/50 text-center">
                <div className="text-zinc-500">Coverage</div>
                <div className="text-zinc-200 tabular-nums">{(matchMetrics.rate * 100).toFixed(1)}%</div>
              </div>
              <div className="p-1.5 rounded-md bg-zinc-950/50 text-center">
                <div className="text-zinc-500">Matched</div>
                <div className="text-zinc-200 tabular-nums">{matchMetrics.matched}</div>
              </div>
              <div className="p-1.5 rounded-md bg-zinc-950/50 text-center">
                <div className="text-zinc-500">Unmatched</div>
                <div className="text-zinc-200 tabular-nums">{matchMetrics.unmatched}</div>
              </div>
            </div>

            {!isAdminMetricsView ? (
              <div className="space-y-1">
                {matchMetrics.reasonRows.slice(0, 4).map(([code, count]) => {
                  const meta = REASON_LABELS[code] ?? { label: code, help: 'No description available.' }
                  return (
                    <div key={code} className="text-[10px] rounded-md p-1.5 bg-zinc-950/30">
                      <div className="text-zinc-200">{meta.label}: {count}</div>
                      <div className="text-zinc-500">{meta.help}</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">Reason diagnostics (code + label)</div>
                  <div className="max-h-24 overflow-auto rounded-md border border-zinc-800/60">
                    <table className="w-full text-[10px]">
                      <thead className="bg-zinc-950 text-zinc-500">
                        <tr><th className="px-1 py-1 text-left">Code</th><th className="px-1 py-1 text-left">Label</th><th className="px-1 py-1 text-right">Count</th></tr>
                      </thead>
                      <tbody>
                        {matchMetrics.reasonRows.map(([code, count]) => (
                          <tr key={code} className="border-t border-zinc-800/60">
                            <td className="px-1 py-1 text-zinc-300">{code}</td>
                            <td className="px-1 py-1 text-zinc-300">{REASON_LABELS[code]?.label ?? code}</td>
                            <td className="px-1 py-1 text-right text-zinc-200">{count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">Unmatched odds by book</div>
                  <div className="max-h-20 overflow-auto rounded-md border border-zinc-800/60 p-1 bg-zinc-950/30">
                    {matchMetrics.books.length === 0 && <div className="text-[10px] text-zinc-500">No book-level diagnostics available.</div>}
                    {matchMetrics.books.map(([book, count]) => (
                      <div key={book} className="text-[10px] text-zinc-300 flex justify-between"><span>{book}</span><span>{count}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {dashboardPage === 'explore' && (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_340px] gap-4">
          <aside className="space-y-3">
            <section className="p-3 bg-zinc-900/40 border border-zinc-800/50 rounded-lg text-xs space-y-2">
              <div className="text-zinc-200 font-medium">Filters</div>
              <select className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700/80 rounded-md text-sm text-zinc-200" onChange={e => setSportFilter(e.target.value)} value={sportFilter}>
                <option>All</option><option>NBA</option><option>NCAAB</option><option>NHL</option><option>NFL</option><option>MLB</option>
              </select>
              <select className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700/80 rounded-md text-sm text-zinc-200" onChange={e => setSiteFilter(e.target.value as 'All' | 'PP' | 'UD')} value={siteFilter}>
                <option value="All">Provider: All</option><option value="PP">PP</option><option value="UD">UD</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-zinc-500">
                <input type="checkbox" checked={hideStartedGames} onChange={e => setHideStartedGames(e.target.checked)} className="rounded" />
                Hide started games
              </label>
              <div className="pt-1 border-t border-zinc-800/60">
                <div className="text-[11px] text-zinc-500 mb-1">Game window pills</div>
                <div className="flex flex-wrap gap-1">
                  {gamePills.pills.length === 0 && (
                    <span className="text-[10px] text-zinc-500">No valid game groupings found.</span>
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
                        className={`px-2 py-1 rounded-md text-[10px] border ${
                          pill.isStarted
                            ? 'bg-zinc-950 text-zinc-600 border-zinc-800 cursor-not-allowed'
                            : selected
                              ? 'bg-zinc-100 text-zinc-900 border-zinc-200'
                              : 'bg-zinc-800/60 text-zinc-300 border-zinc-700/50 hover:bg-zinc-800'
                        }`}
                        title={pill.isStarted ? 'Started game (unusable)' : `${pill.cardCount} cards`}
                      >
                        {pill.label} {pill.isStarted ? '(started)' : `(${pill.cardCount})`}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
                  <span>{selectedGameKeys.length > 0 ? `Selected games: ${selectedGameKeys.length}` : 'All valid games included'}</span>
                  {selectedGameKeys.length > 0 && (
                    <button type="button" className="text-zinc-300 hover:text-zinc-100 underline-offset-2 hover:underline" onClick={() => setSelectedGameKeys([])}>
                      Clear
                    </button>
                  )}
                </div>
                {gamePills.malformedCount > 0 && (
                  <div className="text-[10px] text-zinc-600 mt-1">
                    Suppressed malformed game bubbles: {gamePills.malformedCount}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => exportTableCsv()} className="w-full px-2 py-1.5 bg-zinc-800/80 hover:bg-zinc-800 rounded-md text-left text-zinc-300 text-[11px]">
                Export visible table
              </button>
              {copyStatus && <div className="text-emerald-400/90">{copyStatus}</div>}
            </section>

            <section className="p-3 bg-zinc-900/40 border border-zinc-800/50 rounded-lg text-xs space-y-1">
              <div className="text-zinc-200 font-medium">Local CSV snapshot</div>
              <div className="text-zinc-400">PP: {loadStats.pp} cards / {loadStats.ppLegs} legs</div>
              <div className="text-zinc-400">UD: {loadStats.ud} cards / {loadStats.udLegs} legs</div>
              <div className="text-zinc-500">Bankroll: ${manifest?.bankroll ?? BANKROLL_DEFAULT}</div>
              {lastRefreshMs > 0 && <div className="text-zinc-600">Refresh: {Math.round((Date.now() - lastRefreshMs) / 1000)}s ago</div>}
            </section>

            <section className="p-3 bg-zinc-900/40 border border-zinc-800/50 rounded-lg text-xs space-y-1">
              <div className="text-zinc-200 font-medium">Portfolio range</div>
              <div className="text-zinc-400">Top 10: ${portfolio.top10stake.toFixed(0)}</div>
              <div className="text-zinc-400">Top 20: ${portfolio.top20stake.toFixed(0)}</div>
              <div className="text-zinc-400">Total: ${portfolio.totalStake.toFixed(0)} ({portfolio.count} cards)</div>
              <div className="text-zinc-600">Must {tierCounts.must_play} · Strong {tierCounts.strong} · Lot {tierCounts.lottery}</div>
            </section>

            </aside>

          <section className="space-y-3 min-w-0">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  copyToClipboard(window.location.href).then((ok) => {
                    setCopyStatus(ok ? 'Explore link copied' : 'Copy failed (clipboard)')
                    setTimeout(() => setCopyStatus(''), 2500)
                  })
                }}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-zinc-700/70 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100"
                title="Copy current URL (tab, top-N, filters — same as address bar)"
              >
                Copy link
              </button>
            </div>
            <PrimarySecondaryTabs
              tabs={TABS}
              activeTab={activeTab}
              onTabChange={(tab) => { setActiveTab(tab); setExpandedCard(null) }}
              topLegsLimit={topLegsLimit}
              setTopLegsLimit={setTopLegsLimit}
            />

            {activeTab === 'tracker' ? (
              <div className="p-4 bg-zinc-900/40 border border-zinc-800/50 rounded-lg">
                <PickTracker />
              </div>
            ) : (activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud') ? (
              <TopLegsView
                topLegsNotStartedOnly={topLegsNotStartedOnly}
                setTopLegsNotStartedOnly={setTopLegsNotStartedOnly}
                topLegsStatFilter={topLegsStatFilter}
                setTopLegsStatFilter={setTopLegsStatFilter}
                topLegsGameFilter={topLegsGameFilter}
                setTopLegsGameFilter={setTopLegsGameFilter}
                topLegsMinEdge={topLegsMinEdge}
                setTopLegsMinEdge={setTopLegsMinEdge}
                topLegsPpConsensusTriage={topLegsPpConsensusTriage}
                setTopLegsPpConsensusTriage={setTopLegsPpConsensusTriage}
                showGoblins={showGoblins}
                setShowGoblins={setShowGoblins}
                showDemons={showDemons}
                setShowDemons={setShowDemons}
                showNonStandard={showNonStandard}
                setShowNonStandard={setShowNonStandard}
                topLegsSortKey={topLegsSortKey}
                topLegsSortDir={topLegsSortDir}
                setTopLegsSortKey={setTopLegsSortKey}
                setTopLegsSortDir={setTopLegsSortDir}
                topLegStats={topLegStats}
                topLegsPPFiltered={topLegsPPFiltered}
                topLegsUDFiltered={topLegsUDFiltered}
                copiedPlayerName={copiedPlayerName}
                copyPlayerName={copyPlayerName}
                statAbbrev={statAbbrev}
                onCopyLegText={(compactLeg, e) => {
                  e?.stopPropagation()
                  copyToClipboard(compactLeg).then(ok => setCopyStatus(ok ? 'Copied leg' : 'Copy failed'))
                }}
              />
            ) : (
              <CardsView
                tier1CountInView={tier1CountInView}
                tier1Scarcity={tier1Scarcity}
                cardTypeFilter={cardTypeFilter}
                setCardTypeFilter={setCardTypeFilter}
                cardGameFilter={cardGameFilter}
                setCardGameFilter={setCardGameFilter}
                cardMinEdge={cardMinEdge}
                setCardMinEdge={setCardMinEdge}
                cardSortKey={cardSortKey}
                cardSortDir={cardSortDir}
                setCardSortKey={setCardSortKey}
                setCardSortDir={setCardSortDir}
                cardFilterOptions={cardFilterOptions}
                filteredCards={filteredCards}
                expandedCard={expandedCard}
                setExpandedCard={setExpandedCard}
                copiedPlayerName={copiedPlayerName}
                copyPlayerName={copyPlayerName}
                copyLeg={copyLeg}
                copyParlay={copyParlay}
                portfolio={portfolio}
                resolvePlayerPropLine={resolvePlayerPropLine}
                getLegIds={getLegIds}
                primaryPlayerName={primaryPlayerName}
                cardStartMs={cardStartMs}
                cardEligibility={cardEligibility}
                cardTypeLabel={cardTypeLabel}
                cardKey={cardKey}
                statAbbrev={statAbbrev}
                TIER_STYLE={TIER_STYLE}
                TIER_LABEL={TIER_LABEL}
                TIER_PRIORITY_LABEL={TIER_PRIORITY_LABEL}
                legs={legs}
              />
            )}
          </section>

          <aside className="space-y-3">
            <section className="p-3 bg-zinc-900/40 border border-zinc-800/50 rounded-lg text-xs">
              <div className="text-zinc-200 font-medium mb-2">Card detail</div>
              {!selectedCard ? (
                <div className="text-zinc-500">Select a row to inspect card details.</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-zinc-300">{resolvePlayerPropLine(selectedCard, legs)}</div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-zinc-950/50 rounded-md">Tier: <span className="text-zinc-100">{selectedCard.bestBetTierLabel ?? selectedCard.bestBetTier ?? '—'}</span></div>
                    <div className="p-2 bg-zinc-950/50 rounded-md">Score: <span className="text-zinc-100">{(Number(selectedCard.bestBetScore) || 0).toFixed(0)}</span></div>
                    <div className="p-2 bg-zinc-950/50 rounded-md">EV: <span className="text-emerald-400/90">{(Number(selectedCard.cardEv) * 100).toFixed(1)}%</span></div>
                    <div className="p-2 bg-zinc-950/50 rounded-md">Win: <span className="text-zinc-100">{selectedCard.winProbCash != null ? `${(selectedCard.winProbCash * 100).toFixed(1)}%` : '—'}</span></div>
                    <div className="p-2 bg-zinc-950/50 rounded-md">Edge: <span className="text-zinc-100">{(Number(selectedCard.avgEdgePct) <= 1 ? Number(selectedCard.avgEdgePct) * 100 : Number(selectedCard.avgEdgePct)).toFixed(1)}%</span></div>
                    <div className="p-2 bg-zinc-950/50 rounded-md">Kelly: <span className="text-zinc-100">${portfolio.displayedStake(selectedCard, selectedCard.kellyStake).toFixed(2)}</span></div>
                  </div>
                  <div className="pt-1 border-t border-zinc-800/60">
                    <div className="text-zinc-400 font-medium mb-1">Actions</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={(e) => copyParlay(selectedCard, e)} className="px-2 py-1 bg-zinc-100 text-zinc-900 rounded-md text-[11px] font-medium hover:bg-white">
                        Copy parlay
                      </button>
                      <a href={selectedCard.site === 'UD' ? udFullSlipUrl(getLegIds(selectedCard)) : PP_PROJECTIONS} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-zinc-800/80 text-zinc-200 rounded-md hover:bg-zinc-800 text-[11px]">
                        Open board
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="p-3 bg-zinc-900/40 border border-zinc-800/50 rounded-lg text-xs space-y-2">
              <button
                type="button"
                onClick={() => setExpandedResultsPast(prev => !prev)}
                className="w-full text-left px-2 py-1.5 bg-zinc-800/60 rounded-md hover:bg-zinc-800 text-zinc-300"
              >
                Results snapshot {expandedResultsPast ? '▼' : '▶'}
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
                    <div key={label} className="p-1.5 rounded-md bg-zinc-950/50 text-center">
                      <div className="text-zinc-500">{label}</div>
                      <div className="text-zinc-200">{box.hits}/{box.total}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
        )}

        {dashboardPage === 'explore' && (
        <div className="mt-3 text-xs text-zinc-600 flex flex-wrap gap-4">
          {activeTab === 'tracker' ? (
            <span>Grade legs (Win/Loss/Push) and save to data/tracking/pending_cards.json</span>
          ) : (activeTab === 'top_legs_pp' || activeTab === 'top_legs_ud') ? (
            <span>
              Top {topLegsLimit} legs by EV · {activeTab === 'top_legs_pp' ? 'PP' : 'UD'} · 60s refresh
              {activeTab === 'top_legs_pp'
                ? ' · PP: consensus columns + optional triage preset / sort (Phase S).'
                : ''}
            </span>
          ) : (
            <span>Showing top {Math.min(50, filteredCards.length)} of {filteredCards.length} · 60s refresh</span>
          )}
          {siteFilter !== 'All' && <span>Provider filter: {siteFilter}</span>}
          <span>NBA-first operator shell; provider-neutral labels where practical.</span>
        </div>
        )}
      </main>
    </div>
  )
}

export default App
