/**
 * Cards panel: loads PP and UD cards from CSV(s).
 * Tabs: BEST BETS (tier1), STRONG (tier2), ALL CARDS, TOP LEGS PP, TOP LEGS UD.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Papa from 'papaparse'
import { ExternalLink } from 'lucide-react'
import { useRun } from '../context/RunContext'
import { calcStars } from '../utils/starsBadge'

const OUTPUT_DIR = 'data/output_logs'
const PP_CARDS_CSV = 'prizepicks-cards.csv'
const UD_CARDS_CSV = 'underdog-cards.csv'
const PP_LEGS_CSV = 'prizepicks-legs.csv'
const UD_LEGS_CSV = 'underdog-legs.csv'
const TIER1_CSV = 'tier1.csv'
const TIER2_CSV = 'tier2.csv'

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || ''
const DATA_BASE = ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DATA_BASE) ?? 'data/output_logs').replace(/\/+$/, '')

const ESPN_STATUS_CSV = 'espn_status.csv'
const LINE_MOVEMENT_CSV = 'line_movement.csv'

type CardsView = 'best' | 'strong' | 'all' | 'legs-pp' | 'legs-ud'

const STAT_ABBREV: Record<string, string> = {
  points: 'PTS',
  rebounds: 'REB',
  assists: 'AST',
  threes: '3PM',
  blocks: 'BLK',
  steals: 'STL',
  points_rebounds_assists: 'PRA',
  points_rebounds: 'PR',
  points_assists: 'PA',
  rebounds_assists: 'RA',
  fantasy_score: 'FANTASY',
}
function statAbbrev(stat: string): string {
  const k = String(stat).toLowerCase().replace(/\s+/g, '_')
  return STAT_ABBREV[k] ?? stat
}
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])
function lastName(fullName: string): string {
  const parts = String(fullName).trim().split(/\s+/)
  // Strip trailing suffixes (Jr, Sr, II, III, IV, V)
  while (parts.length > 1) {
    const tail = (parts[parts.length - 1] ?? '').toLowerCase().replace(/\.$/, '')
    if (NAME_SUFFIXES.has(tail)) parts.pop()
    else break
  }
  return parts.length > 0 ? parts[parts.length - 1]! : fullName
}

/**
 * cardEV is a raw optimizer score (e.g. 2.022173). Do NOT divide by 100 or treat as percent.
 * Strip any accidental "%" suffix but preserve value as-is.
 */
function normalizeCardEv(val: unknown): number {
  if (val == null || val === '') return 0
  if (typeof val === 'string') {
    const n = Number(val.replace(/%/g, '').trim())
    return Number.isFinite(n) ? n : 0
  }
  const n = Number(val)
  return Number.isFinite(n) ? n : 0
}

/** kellyStake may be "$14.00" or 14. Normalize to number. */
function normalizeKellyStake(val: unknown): number {
  if (val == null || val === '') return 0
  if (typeof val === 'string') {
    const s = val.replace(/\$/g, '').trim()
    return Number.isFinite(Number(s)) ? Number(s) : 0
  }
  const n = Number(val)
  return Number.isFinite(n) ? n : 0
}

/** avgEdgePct may be 15.5 (percent) or 0.155 (decimal). Normalize to percent for display/filter. */
function normalizeAvgEdgePct(val: unknown): number {
  if (val == null || val === '') return 0
  const n = typeof val === 'string' ? Number(val.replace(/%/g, '').trim()) : Number(val)
  if (!Number.isFinite(n)) return 0
  return n <= 1 ? n * 100 : n
}

/** modelEdge from card.metrics (decimal, e.g. 0.05 = 5% edge). Normalize for EDGE column display. */
function normalizeModelEdge(val: unknown): number | undefined {
  if (val == null || val === '') return undefined
  const n = typeof val === 'string' ? Number(val.trim()) : Number(val)
  return Number.isFinite(n) ? n : undefined
}

interface CardRow {
  site: 'PP' | 'UD'
  Sport?: string
  site_raw?: string
  flexType?: string
  'Site-Leg'?: string
  'Player-Prop-Line'?: string
  cardEv?: number
  winProbCash?: number
  avgEdgePct?: number
  /** Card-level model edge (trueProb - impliedProb); used for EDGE column. Separate from EV (cardEv). */
  modelEdge?: number
  kellyStake?: number
  bestBetTier?: string
  ParlayGroup?: string
  DeepLink?: string
  Pick?: string
  leg1Id?: string
  leg2Id?: string
  leg3Id?: string
  leg4Id?: string
  leg5Id?: string
  leg6Id?: string
  leg7Id?: string
  leg8Id?: string
  portfolioRank?: number | string
  [key: string]: unknown
}

interface TierCardRow {
  site?: string
  flexType?: string
  cardEV?: number
  kellyStake?: number
  winProbCash?: number
  avgEdge?: number
  avgLegEV?: number
  leg1Id?: string
  leg2Id?: string
  leg3Id?: string
  leg4Id?: string
  leg5Id?: string
  leg6Id?: string
  leg7Id?: string
  leg8Id?: string
  portfolioRank?: number | string
  [key: string]: unknown
}

interface EspnStatusRow {
  leg_id: string
  player: string
  espnStatus: string
  espnMinutes: string
}

interface LineMovementRow {
  leg_id: string
  category?: string
  direction?: string
  delta?: string
}

interface EspnEnrichmentLeg {
  last5Avg?: number
  last5Games?: number
  vsLineGap?: number
  injuryStatus?: string
}

interface LegRow {
  id?: string
  player?: string
  stat?: string
  line?: number
  edge?: number
  legEv?: number
  adjEv?: number
  fantasyEv?: number
  espnEnrichment?: EspnEnrichmentLeg | null
  lineMovDir?: string
  lineDelta?: number
  gameId?: string
  awayTeam?: string
  homeTeam?: string
  gameTime?: string
  team?: string
  opponent?: string
  leg_key?: string
  scoringWeight?: number
  /** UD per-pick payout factor: <1 = discounted, >1 = boosted (dashboard badge) */
  udPickFactor?: number | null
  [key: string]: unknown
}

type GameOption = { key: string; label: string; count: number; timeLabel: string; matchupLabel: string }

/** Parse gameTime; return null if time-only, invalid, or date before 2020 (treat as future in filters). */
function parseGameTime(gt: string | undefined): Date | null {
  if (gt == null || !String(gt).trim()) return null
  const s = String(gt).trim()
  try {
    const d = new Date(s)
    if (!Number.isFinite(d.getTime())) return null
    if (d.getFullYear() < 2020) return null
    return d
  } catch {
    return null
  }
}

/** True if leg/card should be shown (game in future or gameTime unparseable/time-only). */
function isGameTimeFuture(gt: string | undefined, now: Date): boolean {
  const parsed = parseGameTime(gt)
  if (parsed === null) return true
  return parsed >= now
}

function formatGameTime(gt: string | undefined): string {
  if (!gt || !String(gt).trim()) return ''
  const parsed = parseGameTime(gt)
  if (parsed === null) return String(gt).trim()
  try {
    return parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return String(gt).trim()
  }
}

function legMatchesGame(leg: LegRow, keys: Set<string>): boolean {
  if (keys.size === 0) return true
  const gameId = leg.gameId != null ? String(leg.gameId).trim() : ''
  if (gameId && keys.has(gameId)) return true
  const away = (leg.awayTeam ?? '') as string
  const home = (leg.homeTeam ?? '') as string
  const team = (leg.team ?? '') as string
  const opponent = (leg.opponent ?? '') as string
  const teamsForKey = [away || team, home || opponent].filter(Boolean)
  if (teamsForKey.length === 2) {
    const [t0, t1] = [teamsForKey[0]!, teamsForKey[1]!].sort()
    if (keys.has(`${t0} @ ${t1}`)) return true
  }
  if (away && home && keys.has(`${away}@${home}`)) return true
  const gt = (leg.gameTime ?? '') as string
  if (gt && keys.has(gt)) return true
  if (team && keys.has(team)) return true
  if (!gameId && !away && !home && !gt && !team) return true
  return false
}

function parseCsv<T>(url: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: true,
      complete: (r: { data?: unknown[]; errors?: unknown[] }) => resolve((r.data || []) as T[]),
      error: (err: Error) => reject(err),
    })
  })
}

function normalizeLeg(leg: LegRow): LegRow {
  if (leg.espnEnrichment != null && typeof leg.espnEnrichment === 'string') {
    try {
      leg.espnEnrichment = JSON.parse(leg.espnEnrichment as unknown as string) as EspnEnrichmentLeg
    } catch {
      leg.espnEnrichment = undefined
    }
  }
  return leg
}

function normalizeTier(tier: string | undefined): string {
  if (!tier) return ''
  const t = String(tier).toUpperCase()
  if (t.includes('MUST') || t === 'T1' || t === '1') return 'T1'
  if (t.includes('STRONG') || t === 'T2' || t === '2') return 'T2'
  if (t === 'T3' || t === '3' || t.includes('SMALL')) return 'T3'
  return t
}

type SortKey = 'kellyStake' | 'cardEv' | 'modelEdge' | 'avgEdgePct' | 'site' | 'Player-Prop-Line'
const PARLAY_GROUP_COLORS = ['var(--accent)', 'var(--warn)', 'var(--accent-2)', 'var(--accent-3)']

/** Leg IDs on card: PP leg1Id–leg6Id, UD leg1Id–leg8Id. */
function getCardLegIds(row: CardRow): string[] {
  const ids = [
    row.leg1Id,
    row.leg2Id,
    row.leg3Id,
    row.leg4Id,
    row.leg5Id,
    row.leg6Id,
    ...(row.site === 'UD' ? [row.leg7Id, row.leg8Id] : []),
  ]
  return ids.filter((x): x is string => !!x && typeof x === 'string')
}

/** Unique key for expand state: same card (site + leg set) = same key so only one row expands. */
function getCardRowKey(row: CardRow): string {
  return `${row.site}|${getCardLegIds(row).sort().join('|')}`
}

/** typeCode: F = flex, P = PP power/no-wrong, S = UD standard/no-wrong. */
function getTypeCode(row: CardRow): 'F' | 'P' | 'S' {
  const site = row.site
  const flexType = String(row.flexType ?? '').trim().toLowerCase()
  if (site === 'PP') {
    if (flexType.endsWith('f') || flexType.includes('flex')) return 'F'
    if (flexType.endsWith('p') || flexType.includes('power') || flexType.includes('no-wrong')) return 'P'
    if (flexType) console.warn('[CardsPanel] Unrecognized PP flexType:', row.flexType)
    return 'F'
  }
  if (site === 'UD') {
    if (flexType.endsWith('f') || flexType.includes('flex')) return 'F'
    if (flexType.endsWith('p') || flexType.includes('standard') || flexType.includes('no-wrong')) return 'S'
    if (flexType) console.warn('[CardsPanel] Unrecognized UD flexType:', row.flexType)
    return 'F'
  }
  return 'F'
}

function getTypeLabel(row: CardRow): string {
  const n = getCardLegIds(row).length
  const code = getTypeCode(row)
  return `${n}${code}`
}

/** Card parlay link: from CSV DeepLink column, or static URL by site when column missing. */
function getCardDeepLink(row: CardRow): string {
  const raw = row.DeepLink != null ? String(row.DeepLink).trim() : ''
  if (raw) return raw
  return row.site === 'PP' ? 'https://app.prizepicks.com' : 'https://play.underdogfantasy.com/pick-em'
}

/** Map tier CSV row to CardRow for display; build Player-Prop-Line from legs. */
function tierRowToCardRow(
  row: TierCardRow,
  legByIdAll: Map<string, LegRow>,
  bestBetTier: 'T1' | 'T2',
): CardRow {
  // Fix 7: UD supports up to 8 legs; always include leg7Id/leg8Id
  const legIds = [row.leg1Id, row.leg2Id, row.leg3Id, row.leg4Id, row.leg5Id, row.leg6Id, row.leg7Id, row.leg8Id].filter(Boolean) as string[]
  const parts = legIds.map((id) => {
    const leg = legByIdAll.get(id)
    if (!leg) return null
    const pick = ((leg as { pick?: string }).pick ?? 'over').toLowerCase().startsWith('u') ? 'u' : 'o'
    return `${String(leg.player ?? '').trim()} ${statAbbrev((leg.stat ?? '') as string)} ${pick}${Number(leg.line)}`
  }).filter(Boolean)
  const site = (row.site === 'UD' ? 'UD' : 'PP') as 'PP' | 'UD'
  const avgEdge = row.avgEdge != null ? Number(row.avgEdge) * 100 : undefined
  const modelEdge = normalizeModelEdge((row as { modelEdge?: unknown }).modelEdge ?? row.avgEdge)
  return {
    site,
    flexType: row.flexType,
    leg1Id: row.leg1Id,
    leg2Id: row.leg2Id,
    leg3Id: row.leg3Id,
    leg4Id: row.leg4Id,
    leg5Id: row.leg5Id,
    leg6Id: row.leg6Id,
    leg7Id: row.leg7Id,
    leg8Id: row.leg8Id,
    'Player-Prop-Line': parts.join(' | '),
    cardEv: normalizeCardEv(row.cardEV ?? (row as Record<string, unknown>).cardEv),
    kellyStake: normalizeKellyStake(row.kellyStake),
    winProbCash: row.winProbCash != null ? Number(row.winProbCash) : undefined,
    avgEdgePct: avgEdge,
    modelEdge,
    bestBetTier,
    portfolioRank: row.portfolioRank,
    DeepLink: site === 'PP' ? 'https://app.prizepicks.com' : 'https://play.underdogfantasy.com/pick-em',
    Pick: 'over',
  }
}

function espnBadgeColor(status: string): string {
  if (status === 'Out' || status === 'Suspended' || status === 'Injured Reserve') return 'var(--danger)'
  if (status === 'Doubtful') return 'var(--warn)'
  if (status === 'Questionable' || status === 'Day-To-Day') return '#eab308'
  return 'var(--text-muted)'
}

function InjuryDot({ status }: { status: string | undefined }) {
  if (!status || status === 'ACTIVE' || status === 'Active' || status === 'unknown') return null
  if (status === 'QUESTIONABLE' || status === 'Questionable' || status === 'Day-To-Day')
    return <span className="shrink-0 ml-0.5" style={{ color: '#eab308' }} title={status}>🟡</span>
  if (status === 'OUT' || status === 'Out' || status === 'IR' || status === 'Injured Reserve' || status === 'SUSPENDED' || status === 'Suspended')
    return <span className="shrink-0 ml-0.5" style={{ color: 'var(--danger)' }} title={status}>🔴</span>
  return null
}

function FormArrow({ leg }: { leg: LegRow }) {
  const espn = leg.espnEnrichment
  if (!espn || espn.vsLineGap == null) return null
  const gap = Number(espn.vsLineGap)
  const lineVal = Number(leg.line)
  const last5 = espn.last5Avg != null ? Number(espn.last5Avg) : null
  const games = espn.last5Games != null ? Number(espn.last5Games) : null
  const tooltip = `Last 5 avg: ${last5 != null ? last5.toFixed(1) : '—'}  |  Line: ${Number.isFinite(lineVal) ? lineVal : '—'}  |  Gap: ±${Math.abs(gap).toFixed(1)}`
  if (gap > 0.5) return <span className="ml-1" style={{ color: 'var(--color-text-success)' }} title={tooltip}>▲ +{gap.toFixed(1)}</span>
  if (gap < -0.5) return <span className="ml-1" style={{ color: 'var(--color-text-danger)' }} title={tooltip}>▼ −{Math.abs(gap).toFixed(1)}</span>
  return <span className="ml-1" style={{ color: 'var(--text-muted)' }} title={tooltip}>— {gap.toFixed(1)}</span>
}

function FantasyChip({ fantasyEv }: { fantasyEv: number }) {
  if (Math.abs(fantasyEv) <= 0.001) return null
  const pct = (fantasyEv * 100).toFixed(1)
  const isPos = fantasyEv > 0
  return (
    <span
      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ml-1"
      style={{ background: isPos ? 'var(--color-background-success)' : 'rgba(239,68,68,0.2)', color: isPos ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}
    >
      F {isPos ? '▲+' : '▼−'}{pct}%
    </span>
  )
}

function TrackerDot({ legKey, result }: { legKey: string | undefined; result: 'hit' | 'miss' | undefined }) {
  if (!legKey || !result) return null
  return (
    <span
      className="shrink-0 w-2 h-2 rounded-full ml-1"
      style={{ background: result === 'hit' ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}
      title={result === 'hit' ? 'Hit' : 'Miss'}
    />
  )
}

function GoblinDemonBadge({ scoringWeight }: { scoringWeight?: number }) {
  if (scoringWeight == null || scoringWeight === 1) return null
  if (Math.abs(scoringWeight - 0.95) < 0.01) {
    return <span className="ml-1 text-[10px] font-semibold" style={{ color: 'rgba(239,68,68,0.85)' }} title="Goblin (0.95)">G</span>
  }
  if (Math.abs(scoringWeight - 1.05) < 0.01) {
    return <span className="ml-1 text-[10px] font-semibold" style={{ color: 'rgba(34,197,94,0.85)' }} title="Demon (1.05)">D</span>
  }
  return null
}

/** UD per-pick payout factor: D = discounted (<1), B = boosted (>1). */
function UdFactorBadge({ udPickFactor }: { udPickFactor?: number | null }) {
  if (udPickFactor == null || !Number.isFinite(udPickFactor) || udPickFactor === 1) return null
  if (udPickFactor < 1) {
    return <span className="ml-1 text-[10px] font-semibold" style={{ color: 'rgba(239,68,68,0.85)' }} title={`UD discounted (${udPickFactor.toFixed(2)}×)`}>D</span>
  }
  return <span className="ml-1 text-[10px] font-semibold" style={{ color: 'rgba(34,197,94,0.85)' }} title={`UD boosted (${udPickFactor.toFixed(2)}×)`}>B</span>
}

function EvWithDelta({ leg }: { leg: LegRow }) {
  const legEv = typeof leg.legEv === 'number' && Number.isFinite(leg.legEv) ? leg.legEv : 0
  const adjEv = leg.adjEv != null && Number.isFinite(Number(leg.adjEv)) ? Number(leg.adjEv) : legEv
  const delta = adjEv - legEv
  if (Math.abs(delta) <= 0.0001) {
    return <span>{(legEv * 100).toFixed(1)}%</span>
  }
  const deltaStr = delta >= 0 ? `(+${delta.toFixed(3)})` : `(−${Math.abs(delta).toFixed(3)})`
  return (
    <span className="inline-flex flex-col items-start">
      <span>{(legEv * 100).toFixed(1)}%</span>
      <span className="font-semibold" style={{ color: 'var(--accent)' }}>{(adjEv * 100).toFixed(1)}%</span>
      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{deltaStr}</span>
    </span>
  )
}

export default function CardsPanel() {
  const { refreshTrigger } = useRun()
  const [cards, setCards] = useState<CardRow[]>([])
  const [tier1Rows, setTier1Rows] = useState<TierCardRow[]>([])
  const [tier2Rows, setTier2Rows] = useState<TierCardRow[]>([])
  const [ppLegs, setPpLegs] = useState<LegRow[]>([])
  const [udLegs, setUdLegs] = useState<LegRow[]>([])
  const [espnByLegId, setEspnByLegId] = useState<Map<string, { espnStatus: string }>>(new Map())
  const [lineMovementByLegId, setLineMovementByLegId] = useState<Map<string, { category: string; direction: string; lineDelta?: number; delta?: number }>>(new Map())
  const [trackerResultsByLegKey, setTrackerResultsByLegKey] = useState<Map<string, 'hit' | 'miss'>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<CardsView>('best')
  const [sortKey, setSortKey] = useState<SortKey>('kellyStake')
  const [sortDesc, setSortDesc] = useState(true)
  const [selectedCard, setSelectedCard] = useState<CardRow | null>(null)
  const [copiedRowKey, setCopiedRowKey] = useState<string | null>(null)
  const [copiedPlayerLegId, setCopiedPlayerLegId] = useState<string | null>(null)

  const fetchCards = useCallback(async () => {
    setError(null)
    try {
      const ppUrl = `${DATA_BASE}/${PP_CARDS_CSV}`
      const udUrl = `${DATA_BASE}/${UD_CARDS_CSV}`
      const ppLegsUrl = `${DATA_BASE}/${PP_LEGS_CSV}`
      const udLegsUrl = `${DATA_BASE}/${UD_LEGS_CSV}`
      const espnUrl = `${DATA_BASE}/${ESPN_STATUS_CSV}`
      const lineMovementUrl = `${DATA_BASE}/${LINE_MOVEMENT_CSV}`
      const tier1Url = `${DATA_BASE}/${TIER1_CSV}`
      const tier2Url = `${DATA_BASE}/${TIER2_CSV}`
      const [ppRows, udRows, ppLegsRows, udLegsRows, espnRows, lineMovementRows, tier1Data, tier2Data] = await Promise.all([
        parseCsv<Record<string, unknown>>(ppUrl).catch(() => []),
        parseCsv<Record<string, unknown>>(udUrl).catch(() => []),
        parseCsv<LegRow>(ppLegsUrl).catch(() => []),
        parseCsv<LegRow>(udLegsUrl).catch(() => []),
        parseCsv<EspnStatusRow>(espnUrl).catch(() => []),
        parseCsv<LineMovementRow>(lineMovementUrl).catch(() => []),
        parseCsv<TierCardRow>(tier1Url).catch(() => []),
        parseCsv<TierCardRow>(tier2Url).catch(() => []),
      ])
      const t1 = Array.isArray(tier1Data) ? tier1Data : []
      const t2 = Array.isArray(tier2Data) ? tier2Data : []
      setTier1Rows(t1)
      setTier2Rows(t2)
      if (t1.length === 0) {
        console.warn('[CardsPanel] tier1.csv empty, falling back to prizepicks-cards.csv for BEST BETS')
      }
      const ppLegsNorm = Array.isArray(ppLegsRows) ? ppLegsRows.map((r) => normalizeLeg(r as LegRow)) : []
      const udLegsNorm = Array.isArray(udLegsRows) ? udLegsRows.map((r) => normalizeLeg(r as LegRow)) : []
      setPpLegs(ppLegsNorm)
      setUdLegs(udLegsNorm)
      console.log('[CardsPanel] Loaded legs: PP=', ppLegsNorm.length, 'UD=', udLegsNorm.length, '| UD path:', `${DATA_BASE}/${UD_LEGS_CSV}`)
      if (udLegsNorm.length === 0 && Array.isArray(udLegsRows) && udLegsRows.length === 0) {
        console.warn('[CardsPanel] UD legs empty — check that underdog-legs.csv is reachable at', `${DATA_BASE}/${UD_LEGS_CSV}`)
      }
      const map = new Map<string, { espnStatus: string }>()
      for (const r of espnRows) {
        if (r?.leg_id && r?.espnStatus) map.set(String(r.leg_id).trim(), { espnStatus: String(r.espnStatus) })
      }
      setEspnByLegId(map)
      const lmMap = new Map<string, { category: string; direction: string; lineDelta?: number; delta?: number }>()
      for (const r of lineMovementRows) {
        if (!r?.leg_id) continue
        const id = String(r.leg_id).trim()
        const cat = String(r.category ?? '')
        const direction = (r as { direction?: string }).direction ?? (cat === 'favorable' ? 'toward' : (cat === 'strong_against' || cat === 'moderate_against' ? 'against' : 'none'))
        const deltaRaw = r.delta != null ? Number(r.delta) : undefined
        const lineDelta = Number.isFinite(deltaRaw as number) ? (deltaRaw as number) : undefined
        lmMap.set(id, { category: cat, direction, lineDelta, delta: lineDelta })
      }
      setLineMovementByLegId(lmMap)
      const pp: CardRow[] = ppRows
        .filter((r) => r != null && (r.sport != null || r.Sport != null || r.site != null))
        .map((r) => ({
          ...r,
          site: 'PP' as const,
          cardEv: normalizeCardEv(r.cardEv ?? r.cardEV),
          kellyStake: normalizeKellyStake(r.kellyStake),
          avgEdgePct: normalizeAvgEdgePct(r.avgEdgePct),
          modelEdge: normalizeModelEdge((r as { modelEdge?: unknown }).modelEdge),
        }))
      const ud: CardRow[] = udRows
        .filter((r) => r != null && (r.sport != null || r.Sport != null || r.site != null))
        .map((r) => ({
          ...r,
          site: 'UD' as const,
          cardEv: normalizeCardEv(r.cardEv ?? r.cardEV),
          kellyStake: normalizeKellyStake(r.kellyStake),
          avgEdgePct: normalizeAvgEdgePct(r.avgEdgePct),
          modelEdge: normalizeModelEdge((r as { modelEdge?: unknown }).modelEdge),
        }))
      setCards([...pp, ...ud])
    } catch (e) {
      setError((e as Error).message)
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCards()
    const id = setInterval(fetchCards, 60_000)
    return () => clearInterval(id)
  }, [fetchCards])

  useEffect(() => {
    if (refreshTrigger > 0) fetchCards()
  }, [refreshTrigger, fetchCards])

  useEffect(() => {
    if (!API_BASE) return
    fetch(`${API_BASE}/api/tracker-results`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { leg_key: string; result: 'hit' | 'miss' | null }[] | null) => {
        if (!Array.isArray(data)) return
        const m = new Map<string, 'hit' | 'miss'>()
        for (const row of data) {
          if (row.leg_key && (row.result === 'hit' || row.result === 'miss')) m.set(row.leg_key, row.result)
        }
        setTrackerResultsByLegKey(m)
      })
      .catch(() => {})
  }, [refreshTrigger])

  const allLegs = useMemo(() => [...ppLegs, ...udLegs], [ppLegs, udLegs])

  const gameOptions = useMemo((): GameOption[] => {
    const byKey = new Map<string, { timeLabel: string; matchupLabel: string; count: number; gameTime?: string }>()
    for (const leg of allLegs) {
      let key: string
      let timeLabel: string
      let matchupLabel: string
      const gameId = (leg.gameId != null ? String(leg.gameId).trim() : '') as string
      const away = (leg.awayTeam ?? '') as string
      const home = (leg.homeTeam ?? '') as string
      const gt = (leg.gameTime ?? '') as string
      const team = (leg.team ?? '') as string
      const opponent = (leg.opponent ?? '') as string
      const timeStr = formatGameTime(gt || undefined)
      // Dedup key: normalize team pair alphabetically so "OKC @ MIN" and "MIN @ OKC" merge
      const teamsForKey = [away || team, home || opponent].filter(Boolean)
      const sortedTeams = teamsForKey.length === 2 ? [teamsForKey[0]!, teamsForKey[1]!].sort() : teamsForKey
      // Matchup label must use same order as dedup key so one bubble per game, no duplicate/reversed labels
      if (sortedTeams.length === 2) {
        matchupLabel = `${sortedTeams[0]} @ ${sortedTeams[1]}`
      } else {
        matchupLabel = team || ''
      }
      const gameKeySuffix = sortedTeams.length === 2 ? `${sortedTeams[0]} @ ${sortedTeams[1]}` : (away || team || '')
      if (gameId) {
        key = gameId
        timeLabel = timeStr || gameId
      } else if (sortedTeams.length === 2) {
        key = gameKeySuffix
        timeLabel = timeStr || ''
      } else if (gt) {
        key = timeStr || gt
        timeLabel = timeStr || key
      } else if (team) {
        key = team
        timeLabel = ''
      } else {
        key = 'unknown'
        timeLabel = 'Unknown'
      }
      const cur = byKey.get(key)
      if (!cur) byKey.set(key, { timeLabel, matchupLabel, count: 1, gameTime: gt || undefined })
      else {
        cur.count += 1
        if (timeStr && !cur.timeLabel) cur.timeLabel = timeStr
      }
    }
    // Merge single-team keys (e.g. "TOR") into full matchup key (e.g. "DET @ TOR") so one bubble per game
    const matchupKeys = Array.from(byKey.keys()).filter((k) => k.includes(' @ '))
    for (const singleKey of Array.from(byKey.keys())) {
      if (singleKey.includes(' @ ') || singleKey === 'unknown') continue
      if (singleKey.length < 2 || singleKey.length > 4) continue
      const su = singleKey.toUpperCase()
      const mergeInto = matchupKeys.find(
        (mk) => mk.toUpperCase().startsWith(su + ' @ ') || mk.toUpperCase().endsWith(' @ ' + su)
      )
      if (!mergeInto) continue
      const cur = byKey.get(mergeInto)!
      const single = byKey.get(singleKey)!
      cur.count += single.count
      if (single.timeLabel && !cur.timeLabel) cur.timeLabel = single.timeLabel
      byKey.delete(singleKey)
    }
    const opts: GameOption[] = Array.from(byKey.entries())
      .filter(([, v]) => {
        // Fix 3: Only show a game bubble when there is a valid time or matchup label.
        // Cards with no gameTime (e.g. mock data with team="T5") are still shown in
        // tables but must not produce clutter bubbles in the GAMES filter row.
        return !!(v.timeLabel || v.matchupLabel)
      })
      .map(([k, v]) => ({
        key: k,
        label: v.matchupLabel ? `${v.timeLabel} ${v.matchupLabel}`.trim() : v.timeLabel,
        count: v.count,
        timeLabel: v.timeLabel,
        matchupLabel: v.matchupLabel,
      }))
    opts.sort((a, b) => {
      const aTime = byKey.get(a.key)?.gameTime
      const bTime = byKey.get(b.key)?.gameTime
      if (aTime && bTime) return new Date(aTime).getTime() - new Date(bTime).getTime()
      if (aTime) return -1
      if (bTime) return 1
      return a.key.localeCompare(b.key)
    })
    return opts
  }, [allLegs])

  const legByIdAll = useMemo(() => {
    const m = new Map<string, LegRow>()
    for (const leg of allLegs) {
      const id = leg.id != null ? String(leg.id) : undefined
      if (id) m.set(id, leg)
    }
    return m
  }, [allLegs])

  const tier1Cards = useMemo(() => {
    if (tier1Rows.length === 0) return []
    return tier1Rows
      .slice(0, 20)
      .map((r) => tierRowToCardRow(r, legByIdAll, 'T1'))
      .filter((c) => c['Player-Prop-Line'])
  }, [tier1Rows, legByIdAll])

  const tier1LegSets = useMemo(() => {
    return new Set(
      tier1Cards.map((c) => [c.leg1Id, c.leg2Id, c.leg3Id, c.leg4Id, c.leg5Id, c.leg6Id].filter(Boolean).sort().join(','))
    )
  }, [tier1Cards])

  const tier2Cards = useMemo(() => {
    if (tier2Rows.length === 0) return []
    const allT2 = tier2Rows.map((r) => tierRowToCardRow(r, legByIdAll, 'T2')).filter((c) => c['Player-Prop-Line'])
    // When tier1 and tier2 are identical, show tier2 rows that are NOT already in BEST BETS
    const deduped = allT2.filter((c) => {
      const legKey = [c.leg1Id, c.leg2Id, c.leg3Id, c.leg4Id, c.leg5Id, c.leg6Id].filter(Boolean).sort().join(',')
      return !tier1LegSets.has(legKey)
    })
    // If dedup removed everything (truly identical), fall back to portfolioRank > 20
    if (deduped.length === 0) {
      return allT2.filter((c) => {
        const rank = c.portfolioRank != null && c.portfolioRank !== '' ? Number(c.portfolioRank) : null
        return rank == null || rank > 20
      })
    }
    return deduped
  }, [tier2Rows, legByIdAll, tier1LegSets])

  const bestFallbackCards = useMemo(() => {
    return cards
      .filter((c) => {
        // cardEv is a raw optimizer score — do NOT filter on it.
        // Filter on avgEdgePct (decimal: 0.05 = 5%) and kellyStake (dollar amount).
        const edge = Number(c.avgEdgePct) ?? 0
        const edgeDecimal = edge > 1 ? edge / 100 : edge // normalize to decimal for threshold
        const kelly = Number(c.kellyStake) ?? 0
        const rank = c.portfolioRank != null && c.portfolioRank !== '' ? Number(c.portfolioRank) : null
        return edgeDecimal >= 0.05 && kelly >= 5 && (rank == null || rank <= 50)
      })
      .slice(0, 20)
      .map((c) => ({ ...c, bestBetTier: 'T1' as const }))
  }, [cards])

  const strongFallbackCards = useMemo(() => {
    return cards
      .filter((c) => {
        // cardEv is a raw optimizer score — do NOT filter on it.
        const edge = Number(c.avgEdgePct) ?? 0
        const edgeDecimal = edge > 1 ? edge / 100 : edge
        const kelly = Number(c.kellyStake) ?? 0
        const legKey = [c.leg1Id, c.leg2Id, c.leg3Id, c.leg4Id, c.leg5Id, c.leg6Id].filter(Boolean).sort().join(',')
        return edgeDecimal >= 0.03 && kelly >= 1 && (legKey === '' || !tier1LegSets.has(legKey))
      })
      .map((c) => ({ ...c, bestBetTier: 'T2' as const }))
  }, [cards, tier1LegSets])

  const gameOptionsInitialized = useRef(false)
  const [selectedGames, setSelectedGames] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (gameOptions.length > 0 && !gameOptionsInitialized.current) {
      gameOptionsInitialized.current = true
      setSelectedGames(new Set(gameOptions.map((g) => g.key)))
    }
  }, [gameOptions])

  const filteredCardsByView = useMemo(() => {
    let list: CardRow[]
    if (view === 'best') {
      list = tier1Cards.length > 0 ? tier1Cards : bestFallbackCards
    } else if (view === 'strong') {
      list = tier2Cards.length > 0 ? tier2Cards : strongFallbackCards
    } else {
      list = [...cards]
    }

    // Primary production sort for cards:
    // 1) Kelly stake (descending)
    // 2) Expected value (cardEv, descending)
    // 3) Win probability (winProbCash, descending when available)
    list = [...list].sort((a, b) => {
      const ak = Number(a.kellyStake) || 0
      const bk = Number(b.kellyStake) || 0
      if (bk !== ak) return bk - ak

      const aEv = Number(a.cardEv) || 0
      const bEv = Number(b.cardEv) || 0
      if (bEv !== aEv) return bEv - aEv

      const aWin = Number((a as { winProbCash?: number }).winProbCash ?? 0)
      const bWin = Number((b as { winProbCash?: number }).winProbCash ?? 0)
      return bWin - aWin
    })

    // Optional secondary sort toggles for manual exploration (by column headers).
    const key = sortKey
    if (key !== 'kellyStake' && key !== 'cardEv') {
      list = [...list].sort((a, b) => {
        const av = a[key] as number | string | undefined
        const bv = b[key] as number | string | undefined
        const an = typeof av === 'number' ? av : typeof bv === 'number' ? 0 : String(av ?? '').localeCompare(String(bv ?? ''))
        const bn = typeof bv === 'number' ? bv : typeof av === 'number' ? 0 : String(bv ?? '').localeCompare(String(av ?? ''))
        if (typeof av === 'number' && typeof bv === 'number') return sortDesc ? bv - av : av - bv
        return sortDesc ? (an > bn ? -1 : 1) : (an < bn ? -1 : 1)
      })
    } else if (!sortDesc && (key === 'kellyStake' || key === 'cardEv')) {
      // Allow user to toggle ascending for Kelly/EV if they explicitly flip sortDesc.
      list = [...list].reverse()
    }

    return list
  }, [cards, view, sortKey, sortDesc, tier1Cards, tier2Cards, bestFallbackCards, strongFallbackCards])

  useEffect(() => {
    if (view !== 'best' && view !== 'strong') return
    const list = view === 'best' ? (tier1Cards.length > 0 ? tier1Cards : bestFallbackCards) : (tier2Cards.length > 0 ? tier2Cards : strongFallbackCards)
    if (list.length === 0 && cards.length > 0) {
      console.warn('[CardsPanel] No cards in', view.toUpperCase(), '— logging parsed cardEV and kellyStake range:')
      cards.forEach((c, i) => {
        console.warn(`  [${i}] cardEv=${c.cardEv} kellyStake=${c.kellyStake} avgEdgePct=${c.avgEdgePct}`)
      })
    }
  }, [view, tier1Cards.length, tier2Cards.length, bestFallbackCards.length, strongFallbackCards.length, cards.length])

  const filteredCards = useMemo(() => {
    if (gameOptions.length === 0) return filteredCardsByView
    if (selectedGames.size === 0) return []
    const keys = selectedGames
    const out = filteredCardsByView.filter((card) => {
      const legIds = [card.leg1Id, card.leg2Id, card.leg3Id, card.leg4Id, card.leg5Id, card.leg6Id].filter(Boolean) as string[]
      return legIds.some((legId) => {
        const leg = legByIdAll.get(legId)
        return leg ? legMatchesGame(leg, keys) : false
      })
    })
    if (out.length === 0 && filteredCardsByView.length > 0) {
      console.warn('[CardsPanel] Game filter matched 0 cards — showing all', filteredCardsByView.length, 'cards unfiltered')
      return filteredCardsByView
    }
    return out
  }, [filteredCardsByView, selectedGames, legByIdAll, gameOptions.length])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60 * 1000)
    return () => clearInterval(id)
  }, [])
  const now = useMemo(() => new Date(), [refreshTrigger, tick])
  const { visibleCards, hiddenCardsCount } = useMemo(() => {
    const minGameTime = (card: CardRow): Date | null => {
      const legIds = [card.leg1Id, card.leg2Id, card.leg3Id, card.leg4Id, card.leg5Id, card.leg6Id].filter(Boolean) as string[]
      const parsed = legIds
        .map((id) => legByIdAll.get(id)?.gameTime)
        .filter((t): t is string => !!t && typeof t === 'string')
        .map(parseGameTime)
        .filter((d): d is Date => d !== null)
      if (parsed.length === 0) return null
      return new Date(Math.min(...parsed.map((d) => d.getTime())))
    }
    const visible = filteredCards.filter((card) => {
      const min = minGameTime(card)
      return min === null || min >= now
    })
    if (visible.length === 0 && filteredCards.length > 0) {
      console.warn('[CardsPanel] gameTime filter hid all cards — showing all', filteredCards.length, 'unfiltered')
      return { visibleCards: filteredCards, hiddenCardsCount: 0 }
    }
    return { visibleCards: visible, hiddenCardsCount: filteredCards.length - visible.length }
  }, [filteredCards, legByIdAll, now])

  const filteredLegsByView = useMemo(() => {
    if (view === 'legs-pp') return [...ppLegs].sort((a, b) => (Number(b.edge) ?? 0) - (Number(a.edge) ?? 0)).slice(0, 50)
    if (view === 'legs-ud') return [...udLegs].sort((a, b) => (Number(b.edge) ?? 0) - (Number(a.edge) ?? 0)).slice(0, 50)
    return []
  }, [view, ppLegs, udLegs])

  const filteredLegs = useMemo(() => {
    if (gameOptions.length === 0) return filteredLegsByView
    const allSelected = selectedGames.size === 0 || selectedGames.size === gameOptions.length
    const withGameFilter = allSelected
      ? filteredLegsByView
      : filteredLegsByView.filter((leg) => legMatchesGame(leg, selectedGames))
    const futureOnly = withGameFilter.filter((leg) => isGameTimeFuture(leg.gameTime as string | undefined, now))
    return futureOnly
  }, [filteredLegsByView, selectedGames, gameOptions.length, now])

  // Diagnostic: log UD legs surviving gameTime filter when TOP LEGS UD is active
  useEffect(() => {
    if (view !== 'legs-ud') return
    const raw = filteredLegsByView.length
    const shown = filteredLegs.length
    console.log('[CardsPanel] TOP LEGS UD: showing', shown, 'of', raw, 'legs (after game + gameTime>=now filter)')
    if (raw > 0 && shown === 0) {
      console.warn('[CardsPanel] All UD legs hidden by filter (e.g. all gameTimes in past). Run optimizer for today\'s slate to see legs.')
    }
  }, [view, filteredLegsByView.length, filteredLegs.length])

  const summary = useMemo(() => {
    const list = visibleCards
    const t1count = list.filter((c) => normalizeTier(c.bestBetTier) === 'T1').length
    const t2count = list.filter((c) => normalizeTier(c.bestBetTier) === 'T2').length
    const totalCards = list.length
    const avgEdge = list.length
      ? (list.reduce((s, c) => s + (Number(c.avgEdgePct) || 0), 0) / list.length) * (list.some((c) => (Number(c.avgEdgePct) ?? 0) <= 1) ? 100 : 1)
      : 0
    const topKelly = list.length ? Math.max(0, ...list.map((c) => Number(c.kellyStake) ?? 0)) : 0
    return { t1count, t2count, totalCards, avgEdge, topKelly }
  }, [visibleCards])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const parlayGroupIndex = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    visibleCards.forEach((c) => {
      const g = (c.ParlayGroup ?? c.parlayGroup ?? '') as string
      if (g && !map.has(g)) map.set(g, idx++ % PARLAY_GROUP_COLORS.length)
    })
    return map
  }, [visibleCards])

  if (loading && cards.length === 0) {
    return (
      <div className="p-4 font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
        &gt; LOADING CARDS...█
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 font-mono text-sm" style={{ color: 'var(--danger)' }}>
        &gt; ERROR: cards.csv not found — check OUTPUT_DIR
      </div>
    )
  }

  const viewTabs: { id: CardsView; label: string }[] = [
    { id: 'best', label: 'BEST BETS' },
    { id: 'strong', label: 'STRONG' },
    { id: 'all', label: 'ALL CARDS' },
    { id: 'legs-pp', label: 'TOP LEGS PP' },
    { id: 'legs-ud', label: 'TOP LEGS UD' },
  ]

  function formatLegsSummary(row: CardRow): string {
    const propLine = (row['Player-Prop-Line'] ?? '') as string
    if (!propLine.trim()) return '—'

    // Parse the underlying legs from card/legs maps when possible for robust formatting.
    const legIds = getCardLegIds(row)
    const partsFromLegs: string[] = []
    const pickDefault = ((row.Pick ?? 'over') as string).toLowerCase().startsWith('u') ? 'u' : 'o'

    for (const legId of legIds) {
      const leg = legByIdAll.get(legId)
      if (!leg) continue
      const playerRaw = (leg.player ?? '').toString().trim()
      if (!playerRaw) {
        // eslint-disable-next-line no-console
        console.warn('[CardsPanel] Missing player for leg id', legId, 'in card', row.SiteLeg ?? row.site)
        continue
      }
      const statRaw = (leg.stat ?? '').toString()
      const statAbbrevLocal = statAbbrev(statRaw)
      const lineNum = Number(leg.line)
      const dirToken = ((leg as { pick?: string }).pick ?? pickDefault) as string
      const dir = dirToken.toLowerCase().startsWith('u') ? 'u' : 'o'
      const lineStr = Number.isFinite(lineNum) ? lineNum.toString() : ''
      partsFromLegs.push(`${playerRaw} ${statAbbrevLocal} ${dir}${lineStr}`)
    }

    if (partsFromLegs.length > 0) {
      return partsFromLegs.join(' + ')
    }

    // Fallback: best-effort parse of Player-Prop-Line when legs map is missing.
    const rawParts = propLine.split('|').map((p) => p.trim()).filter(Boolean)
    if (rawParts.length === 0) return '—'

    const normalized: string[] = rawParts.map((p) => {
      const tokens = p.split(/\s+/)
      if (tokens.length < 2) return p
      const last = tokens[tokens.length - 1] ?? ''
      const secondLast = tokens[tokens.length - 2] ?? ''
      const dir = last.toLowerCase().startsWith('u') ? 'u' : 'o'
      const maybeLine = last.replace(/^[ou]/i, '')
      const linePart = maybeLine || last
      const statAbbrevLocal = statAbbrev(secondLast)
      const name = tokens.slice(0, tokens.length - 2).join(' ') || (tokens[0] ?? '')
      if (!name.trim()) {
        // eslint-disable-next-line no-console
        console.warn('[CardsPanel] Could not parse player from Player-Prop-Line segment:', p)
      }
      return `${name} ${statAbbrevLocal} ${dir}${linePart}`
    })

    return normalized.join(' + ')
  }

  /** One prop per line: "{player} {over|under} {line} {stat}" */
  function buildSlipText(row: CardRow): string {
    const legIds = getCardLegIds(row)
    const cardPick = ((row.Pick ?? 'over') as string).toLowerCase()
    const lines = legIds.map((legId) => {
      const leg = legByIdAll.get(legId)
      if (!leg) return null
      const pick = ((leg as { pick?: string }).pick ?? cardPick) as string
      const player = (leg.player ?? '').toString().trim() || '—'
      const line = Number(leg.line)
      const stat = (leg.stat ?? '').toString()
      return `${player} ${pick} ${Number.isFinite(line) ? line : ''} ${stat}`
    })
    return lines.filter(Boolean).join('\n')
  }

  const handleCopySlip = (row: CardRow, rowKey: string) => {
    const text = buildSlipText(row)
    if (!text) return
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedRowKey(rowKey)
      setTimeout(() => setCopiedRowKey(null), 1500)
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden p-4">
      {/* Stats bar */}
      <div
        className="shrink-0 font-mono text-xs mb-3"
        style={{ color: 'var(--text-secondary)' }}
      >
        Best Bets: {summary.t1count} &nbsp;|&nbsp; Strong: {summary.t2count} &nbsp;|&nbsp; Total:{' '}
        {summary.totalCards} &nbsp;|&nbsp; Avg edge: {summary.avgEdge.toFixed(1)}% &nbsp;|&nbsp; Top
        Kelly: ${Math.round(summary.topKelly)}
        {gameOptions.length > 0 && selectedGames.size > 0 && selectedGames.size < gameOptions.length && (
          <span className="ml-1" style={{ color: 'var(--color-text-warning)' }}>
            · {selectedGames.size} of {gameOptions.length} games
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex flex-wrap gap-1 mb-3 border-b border-[var(--border)] pb-2">
        {viewTabs.map(({ id, label }) => {
          const isActive = view === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => { setView(id); setSelectedCard(null) }}
              className="px-3 py-1.5 uppercase text-[11px] transition-colors"
              style={{
                fontFamily: 'var(--font-ui)',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Game filter bar */}
      {gameOptions.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 py-2 overflow-x-auto mb-2" style={{ letterSpacing: '0.08em' }}>
          <span className="font-mono text-xs uppercase mr-3 shrink-0" style={{ color: 'var(--text-tertiary)' }}>
            GAMES
          </span>
          {gameOptions.map((g) => {
            const selected = selectedGames.has(g.key)
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => {
                  if (selected && selectedGames.size <= 1) return
                  setSelectedGames((prev) => {
                    const next = new Set(prev)
                    if (next.has(g.key)) next.delete(g.key)
                    else next.add(g.key)
                    return next
                  })
                }}
                className="font-mono text-xs px-3 py-1.5 rounded-full cursor-pointer shrink-0 border text-center"
                style={{
                  background: selected ? 'var(--color-background-success)' : 'var(--bg-elevated)',
                  borderColor: selected ? 'var(--color-border-success)' : 'var(--border)',
                  borderWidth: '0.5px',
                  color: selected ? 'var(--color-text-success)' : 'var(--text-secondary)',
                }}
              >
                <div style={{ fontWeight: 500 }}>{g.timeLabel && g.timeLabel !== '—' ? g.timeLabel : g.matchupLabel}</div>
                {g.timeLabel && g.matchupLabel ? (
                  <div className="mt-0.5" style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>{g.matchupLabel}</div>
                ) : null}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setSelectedGames(new Set(gameOptions.map((o) => o.key)))}
            className="font-mono text-xs px-3 py-1 rounded-full cursor-pointer shrink-0 border border-[var(--border)] bg-[var(--bg-elevated)]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            ALL
          </button>
          <button
            type="button"
            onClick={() => setSelectedGames(new Set())}
            className="font-mono text-xs px-3 py-1 rounded-full cursor-pointer shrink-0 border border-[var(--border)] bg-[var(--bg-elevated)]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            NONE
          </button>
        </div>
      )}

      {hiddenCardsCount > 0 && (
        <div className="shrink-0 py-1 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {hiddenCardsCount} cards hidden (games started)
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {(view === 'legs-pp' || view === 'legs-ud') && (
          filteredLegs.length === 0 ? (
            <div className="py-12 font-mono text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
              {filteredLegsByView.length === 0 ? '> No legs data. Run the optimizer.' : 'No legs match selected games'}
            </div>
          ) : (
            <table className="w-full border-collapse font-mono text-xs">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>PLAYER</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>STAT</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>LINE</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>EDGE</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>EV</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>MOVE</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>FORM</th>
                </tr>
              </thead>
              <tbody>
                {filteredLegs.map((leg, i) => {
                  const id = leg.id != null ? String(leg.id) : ''
                  const lm = id ? lineMovementByLegId.get(id) : undefined
                  const moveDirRaw = (leg.lineMovDir ?? '') as string
                  const effectiveDirection = moveDirRaw || (lm?.direction ?? '')
                  const lineDelta =
                    typeof leg.lineDelta === 'number' && Number.isFinite(leg.lineDelta)
                      ? leg.lineDelta
                      : typeof lm?.lineDelta === 'number' && Number.isFinite(lm.lineDelta)
                        ? lm.lineDelta
                        : typeof lm?.delta === 'number' && Number.isFinite(lm.delta)
                          ? lm.delta
                          : undefined
                  const moveDisplay = effectiveDirection === 'toward' ? '↑' : effectiveDirection === 'against' ? '↓' : '—'
                  const moveColor =
                    effectiveDirection === 'toward'
                      ? 'var(--color-text-success)'
                      : effectiveDirection === 'against'
                        ? 'var(--color-text-warning)'
                        : 'var(--color-text-tertiary)'
                  const espn = leg.espnEnrichment
                  const injuryStatus = espn?.injuryStatus
                  const legKey = (leg.leg_key ?? leg.id) as string | undefined
                  const result = legKey ? trackerResultsByLegKey.get(legKey) : undefined
                  return (
                    <tr key={`${leg.id ?? i}-${leg.player}`} className="hover:bg-[var(--bg-elevated)]">
                      <td className="px-2 py-1" style={{ color: 'var(--text-primary)' }}>
                        <span className="inline-flex items-center flex-wrap gap-1">
                          {(leg.player ?? '') as string}
                          {leg.opponent && (
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs {leg.opponent as string}</span>
                          )}
                          <InjuryDot status={injuryStatus} />
                          <TrackerDot legKey={legKey} result={result} />
                          {leg.team && !leg.opponent && (
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({leg.team})</span>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-1" style={{ color: 'var(--text-secondary)' }}>{statAbbrev((leg.stat ?? '') as string)}</td>
                      <td className="px-2 py-1">
                        <span className="inline-flex items-center gap-0.5">
                          {Number(leg.line)}
                          <GoblinDemonBadge scoringWeight={leg.scoringWeight != null ? Number(leg.scoringWeight) : undefined} />
                          <UdFactorBadge udPickFactor={leg.udPickFactor != null && String(leg.udPickFactor).trim() !== '' ? Number(leg.udPickFactor) : undefined} />
                        </span>
                      </td>
                      <td className="px-2 py-1">{((Number(leg.edge) ?? 0) * 100).toFixed(1)}%</td>
                      <td className="px-2 py-1">
                        <span className="inline-flex items-center">
                          <EvWithDelta leg={leg} />
                          <FantasyChip fantasyEv={Number(leg.fantasyEv) || 0} />
                        </span>
                      </td>
                      <td
                        className="px-2 py-1"
                        style={{ color: moveColor }}
                        title={
                          lineDelta != null && Number.isFinite(lineDelta)
                            ? `LineΔ ${lineDelta > 0 ? '+' : ''}${lineDelta.toFixed(2)}`
                            : undefined
                        }
                      >
                        {moveDisplay}
                      </td>
                      <td className="px-2 py-1"><FormArrow leg={leg} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        )}

        {(view === 'best' || view === 'strong' || view === 'all') && (
          visibleCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 font-mono text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
              {cards.length === 0 ? (
                <><div>&gt; NO CARDS GENERATED FOR THIS SLATE.</div><div>&gt; Run the optimizer to generate recommendations.</div></>
              ) : (
                <div>No cards match selected games</div>
              )}
            </div>
          ) : view === 'best' ? (
            /* BEST BETS: STARS | SITE | TYPE | LEGS SUMMARY | EDGE | EV | WIN% | KELLY | ACTIONS */
            <table className="w-full border-collapse font-mono text-xs" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>STARS</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>SITE</th>
                  <th className="px-2 py-1.5 text-left whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>TYPE</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>LEGS SUMMARY</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>EDGE</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>SCORE</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>WIN%</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>KELLY</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: 'var(--text-muted)' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {visibleCards.flatMap((row, i) => {
                  const legIds = getCardLegIds(row)
                  const cardForStars = {
                    legs: legIds.map((id) => ({
                      isBackToBack: false,
                      injuryStatus: espnByLegId.get(id)?.espnStatus,
                      lineMovement: lineMovementByLegId.get(id) ? { direction: lineMovementByLegId.get(id)!.direction } : undefined,
                    })),
                  }
                  const stars = calcStars(cardForStars)
                  const starColor = stars === 3 ? 'var(--color-text-success)' : stars === 2 ? 'var(--color-text-warning)' : 'var(--color-text-danger)'
                  const starDots = stars === 3 ? '●●●' : stars === 2 ? '●●○' : '●○○'
                  const edgeForDisplay = row.modelEdge != null && Number.isFinite(row.modelEdge)
                    ? (row.modelEdge <= 1 ? row.modelEdge * 100 : row.modelEdge)
                    : ((Number(row.avgEdgePct) ?? 0) <= 1 ? (Number(row.avgEdgePct) ?? 0) * 100 : Number(row.avgEdgePct) ?? 0)
                  const winPct = ((Number(row.winProbCash) ?? 0) * 100).toFixed(1)
                  const isExpanded = selectedCard != null && getCardRowKey(selectedCard) === getCardRowKey(row)
                  const cardPick = ((row.Pick ?? 'over') as string).toLowerCase()
                  return [
                    <tr
                      key={`best-${row.site}-${i}`}
                      className="hover:bg-[var(--bg-elevated)] cursor-pointer"
                      onClick={() => setSelectedCard(isExpanded ? null : row)}
                    >
                      <td className="px-2 py-1" style={{ color: starColor, fontSize: 13 }}>{starDots}</td>
                      <td className="px-2 py-1 uppercase" style={{ color: 'var(--text-secondary)' }}>{row.site}</td>
                      <td className="px-2 py-1 font-mono whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{getTypeLabel(row)}</td>
                      <td className="px-2 py-1 max-w-[200px] truncate" style={{ color: 'var(--text-primary)' }} title={(row['Player-Prop-Line'] as string) ?? ''}>{formatLegsSummary(row)}</td>
                      <td className="px-2 py-1">{edgeForDisplay.toFixed(1)}%</td>
                      <td className="px-2 py-1" style={{ color: (Number(row.cardEv) ?? 0) > 0 ? 'var(--accent)' : undefined }}>{(Number(row.cardEv) ?? 0).toFixed(3)}</td>
                      <td className="px-2 py-1">{winPct}%</td>
                      <td className="px-2 py-1 font-bold">${(Number(row.kellyStake) ?? 0).toFixed(2)}</td>
                      <td className="px-2 py-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <a href={getCardDeepLink(row)} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 text-[10px] border rounded text-[var(--accent)] border-[var(--accent)]" onClick={(e) => e.stopPropagation()}>
                          Link
                        </a>
                        <button
                          type="button"
                          className="px-2 py-0.5 text-[10px] border rounded border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                          onClick={(e) => { e.stopPropagation(); handleCopySlip(row, `best-${row.leg1Id}-${i}`) }}
                        >
                          {copiedRowKey === `best-${row.leg1Id}-${i}` ? '✓' : 'Copy'}
                        </button>
                      </td>
                    </tr>,
                    isExpanded ? (
                      <tr key={`best-detail-${row.site}-${i}`} style={{ background: 'var(--bg-elevated)' }}>
                        <td colSpan={9} className="px-2 py-2 align-top" style={{ borderBottom: '1px solid var(--border)' }}>
                          <div className="rounded border font-mono text-[11px]" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ color: 'var(--text-muted)', borderBottom: '0.5px solid var(--border)' }}>
                                  <th className="text-left py-1 px-2">PLAYER</th>
                                  <th className="text-left py-1 px-2">STAT</th>
                                  <th className="text-left py-1 px-2">PICK</th>
                                  <th className="text-left py-1 px-2">LINE</th>
                                  <th className="text-left py-1 px-2">EDGE%</th>
                                  <th className="text-left py-1 px-2">EV%</th>
                                </tr>
                              </thead>
                              <tbody>
                                {legIds.map((legId) => {
                                  const leg = legByIdAll.get(legId)
                                  if (!leg) {
                                    return (
                                      <tr key={legId} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                        <td colSpan={6} className="py-1 px-2" style={{ color: 'var(--text-muted)' }}>—</td>
                                      </tr>
                                    )
                                  }
                                  const pick = ((leg as { pick?: string }).pick ?? cardPick) as string
                                  // Fix 8: edge and legEv are separate CSV columns — read them independently.
                                  const edgeRaw = leg.edge != null && String(leg.edge).trim() !== '' ? Number(leg.edge) : null
                                  const legEvRaw = leg.legEv != null && String(leg.legEv).trim() !== '' ? Number(leg.legEv) : null
                                  const adjEvRaw = leg.adjEv != null && Number.isFinite(Number(leg.adjEv)) ? Number(leg.adjEv) : null
                                  const edgePct = edgeRaw != null && Number.isFinite(edgeRaw) ? (edgeRaw * 100).toFixed(1) : '—'
                                  const evVal = adjEvRaw ?? legEvRaw ?? 0
                                  const evPct = (evVal * 100).toFixed(1)
                                  const showCopied = copiedPlayerLegId === legId
                                  return (
                                    <tr key={legId} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                      <td className="py-1 px-2" style={{ color: 'var(--text-primary)' }}>
                                        <button
                                          type="button"
                                          className="text-left hover:underline cursor-pointer bg-transparent border-0 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const name = (leg.player ?? '').toString().trim()
                                            if (name) {
                                              void navigator.clipboard.writeText(name).then(() => {
                                                setCopiedPlayerLegId(legId)
                                                setTimeout(() => setCopiedPlayerLegId(null), 1500)
                                              })
                                            }
                                          }}
                                        >
                                          {showCopied ? 'Copied!' : (leg.player ?? '—') as string}
                                        </button>
                                      </td>
                                      <td className="py-1 px-2" style={{ color: 'var(--text-secondary)' }}>{statAbbrev((leg.stat ?? '') as string)}</td>
                                      <td className="py-1 px-2">{pick}</td>
                                      <td className="py-1 px-2">
                                        {Number(leg.line)}
                                        <GoblinDemonBadge scoringWeight={leg.scoringWeight != null ? Number(leg.scoringWeight) : undefined} />
                                        <UdFactorBadge udPickFactor={leg.udPickFactor != null && String(leg.udPickFactor).trim() !== '' ? Number(leg.udPickFactor) : undefined} />
                                      </td>
                                      <td className="py-1 px-2">{edgePct}%</td>
                                      <td className="py-1 px-2">{evPct}%</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ].filter(Boolean)
                })}
              </tbody>
            </table>
          ) : (
            /* STRONG / ALL CARDS: T | SITE | TYPE | PLAYER | ... */
            <table className="w-full border-collapse font-mono text-xs">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[['T', 'tier'], ['SITE', 'site'], ['TYPE', 'type'], ['PLAYER', 'player'], ['PROP', 'prop'], ['PICK', 'pick'], ['EDGE', 'modelEdge'], ['EV', 'cardEv'], ['KELLY', 'kellyStake'], ['BOOK', 'slip'], ['🔗', 'link']].map(([label, key]) => (
                    <th key={key} className="px-2 py-1.5 text-left whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {key === 'kellyStake' || key === 'cardEv' || key === 'modelEdge' ? (
                        <button type="button" onClick={() => toggleSort(key as SortKey)} className="hover:underline">
                          {label} {sortKey === key ? (sortDesc ? '▼' : '▲') : ''}
                        </button>
                      ) : label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleCards.flatMap((row, i) => {
                  const propLine = (row['Player-Prop-Line'] ?? '') as string
                  // Fix 4: PLAYER column shows last name of first leg only — no stat text.
                  // propLine format: "Marcus Morris Sr. PTS o22.5 | ..." — take first segment,
                  // strip trailing stat/pick tokens, then use lastName() to get surname only.
                  const firstSeg = propLine.split('|')[0]?.trim() || '—'
                  const firstSegTokens = firstSeg.split(/\s+/)
                  // Drop trailing tokens that look like stat abbrevs or pick values (e.g. "PTS", "o22.5")
                  let nameTokenEnd = firstSegTokens.length
                  while (nameTokenEnd > 1) {
                    const tok = firstSegTokens[nameTokenEnd - 1] ?? ''
                    if (/^[ou]?\d/.test(tok) || Object.values(STAT_ABBREV).includes(tok.toUpperCase())) nameTokenEnd--
                    else break
                  }
                  const playerNameOnly = lastName(firstSegTokens.slice(0, nameTokenEnd).join(' ') || firstSeg)
                  const legIds = getCardLegIds(row)
                  const worstEspn = legIds.reduce<string | null>((acc, id) => {
                    const s = espnByLegId.get(id)?.espnStatus
                    if (!s || s === 'Active' || s === 'unknown') return acc
                    const order = ['Out', 'Suspended', 'Injured Reserve', 'Doubtful', 'Questionable', 'Day-To-Day']
                    const idx = order.indexOf(s)
                    if (idx === -1) return acc
                    if (acc == null) return s
                    return order.indexOf(acc) <= idx ? acc : s
                  }, null)
                  const worstLineMovement = legIds.reduce<string | null>((acc, id) => {
                    const c = lineMovementByLegId.get(id)?.category
                    if (!c) return acc
                    const order = ['strong_against', 'moderate_against', 'favorable']
                    const idx = order.indexOf(c)
                    if (idx === -1) return acc
                    if (acc == null) return c
                    return order.indexOf(acc) <= idx ? acc : c
                  }, null)
                  const tier = normalizeTier(row.bestBetTier)
                  const edgePct = Number(row.avgEdgePct) ?? 0
                  const edgeNorm = row.modelEdge != null && Number.isFinite(row.modelEdge)
                    ? (row.modelEdge <= 1 ? row.modelEdge * 100 : row.modelEdge)
                    : (edgePct <= 1 ? edgePct * 100 : edgePct)
                  const barPct = Math.min(100, (edgeNorm / 15) * 100)
                  const groupKey = (row.ParlayGroup ?? row.parlayGroup ?? '') as string
                  const borderColor = groupKey ? PARLAY_GROUP_COLORS[parlayGroupIndex.get(groupKey) ?? 0] : undefined
                  const isExpanded = selectedCard != null && getCardRowKey(selectedCard) === getCardRowKey(row)
                  const cardPick = ((row.Pick ?? 'over') as string).toLowerCase()
                  return [
                    <tr
                      key={`strong-${row.site}-${i}-${propLine}`}
                      className="hover:bg-[var(--bg-elevated)] cursor-pointer"
                      style={{ borderLeft: borderColor ? `2px solid ${borderColor}` : undefined }}
                      onClick={() => setSelectedCard(isExpanded ? null : row)}
                    >
                      <td className="px-2 py-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={tier === 'T1' ? { background: 'var(--accent)', color: 'var(--bg-base)' } : tier === 'T2' ? { background: 'var(--warn)', color: 'var(--bg-base)' } : { color: 'var(--text-muted)' }}>{tier || '—'}</span>
                      </td>
                      <td className="px-2 py-1 uppercase text-[11px]" style={{ color: 'var(--text-secondary)' }}>{row.site}</td>
                      <td className="px-2 py-1 font-mono whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{getTypeLabel(row)}</td>
                      <td className="px-2 py-1" style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }} title={propLine}>
                        <span className="inline-flex items-center gap-1">
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerNameOnly}</span>
                          {worstEspn && <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-semibold" style={{ background: espnBadgeColor(worstEspn), color: 'var(--bg-base)' }} title={`ESPN: ${worstEspn}`}>{worstEspn === 'Injured Reserve' ? 'IR' : worstEspn}</span>}
                          {worstLineMovement && <span className="shrink-0 px-1 py-0.5 rounded text-[9px]" style={{ background: worstLineMovement === 'favorable' ? '#22c55e' : worstLineMovement === 'moderate_against' ? '#eab308' : '#ef4444', color: 'var(--bg-base)' }} title={`Line: ${worstLineMovement}`}>{worstLineMovement === 'favorable' ? '▲' : worstLineMovement === 'moderate_against' ? '▼' : '▼▼'}</span>}
                        </span>
                      </td>
                      <td className="px-2 py-1" style={{ color: 'var(--text-secondary)' }}>{(row['Player-Prop-Line'] as string)?.split('|').slice(1).join(' ') || '—'}</td>
                      <td className="px-2 py-1 uppercase text-[11px]">{(row.Pick ?? 'over') as string}</td>
                      <td className="px-2 py-1"><span className="inline-block px-1 rounded relative" style={{ background: `linear-gradient(90deg, var(--accent) ${barPct}%, transparent ${barPct}%)`, backgroundColor: 'rgba(0,255,157,0.15)' }}>{edgeNorm.toFixed(1)}%</span></td>
                      <td className="px-2 py-1" style={{ color: (Number(row.cardEv) ?? 0) > 0 ? 'var(--accent)' : undefined }}>{(Number(row.cardEv) ?? 0).toFixed(3)}</td>
                      <td className="px-2 py-1 text-right font-bold">${(Number(row.kellyStake) ?? 0).toFixed(2)}</td>
                      <td className="px-2 py-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{(row.flexType ?? row.Slip ?? '—') as string}</td>
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <a href={getCardDeepLink(row)} target="_blank" rel="noopener noreferrer" className="inline-flex text-[var(--accent)]" onClick={(e) => e.stopPropagation()}><ExternalLink className="w-3.5 h-3.5" /></a>
                      </td>
                    </tr>,
                    isExpanded ? (
                      <tr key={`strong-detail-${row.site}-${i}`} style={{ background: 'var(--bg-elevated)' }}>
                        <td colSpan={11} className="px-2 py-2 align-top" style={{ borderBottom: '1px solid var(--border)' }}>
                          <div className="rounded border font-mono text-[11px]" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ color: 'var(--text-muted)', borderBottom: '0.5px solid var(--border)' }}>
                                  <th className="text-left py-1 px-2">PLAYER</th>
                                  <th className="text-left py-1 px-2">STAT</th>
                                  <th className="text-left py-1 px-2">PICK</th>
                                  <th className="text-left py-1 px-2">LINE</th>
                                  <th className="text-left py-1 px-2">EDGE%</th>
                                  <th className="text-left py-1 px-2">EV%</th>
                                </tr>
                              </thead>
                              <tbody>
                                {legIds.map((legId) => {
                                  const leg = legByIdAll.get(legId)
                                  if (!leg) {
                                    return (
                                      <tr key={legId} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                        <td colSpan={6} className="py-1 px-2" style={{ color: 'var(--text-muted)' }}>—</td>
                                      </tr>
                                    )
                                  }
                                  const pick = ((leg as { pick?: string }).pick ?? cardPick) as string
                                  // Fix 8: edge and legEv are separate CSV columns — read them independently.
                                  const edgeRawL = leg.edge != null && String(leg.edge).trim() !== '' ? Number(leg.edge) : null
                                  const legEvRawL = leg.legEv != null && String(leg.legEv).trim() !== '' ? Number(leg.legEv) : null
                                  const adjEvRawL = leg.adjEv != null && Number.isFinite(Number(leg.adjEv)) ? Number(leg.adjEv) : null
                                  const edgePctLeg = edgeRawL != null && Number.isFinite(edgeRawL) ? (edgeRawL * 100).toFixed(1) : '—'
                                  const evValL = adjEvRawL ?? legEvRawL ?? 0
                                  const evPctLeg = (evValL * 100).toFixed(1)
                                  const showCopied = copiedPlayerLegId === legId
                                  return (
                                    <tr key={legId} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                      <td className="py-1 px-2" style={{ color: 'var(--text-primary)' }}>
                                        <button
                                          type="button"
                                          className="text-left hover:underline cursor-pointer bg-transparent border-0 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const name = (leg.player ?? '').toString().trim()
                                            if (name) {
                                              void navigator.clipboard.writeText(name).then(() => {
                                                setCopiedPlayerLegId(legId)
                                                setTimeout(() => setCopiedPlayerLegId(null), 1500)
                                              })
                                            }
                                          }}
                                        >
                                          {showCopied ? 'Copied!' : (leg.player ?? '—') as string}
                                        </button>
                                      </td>
                                      <td className="py-1 px-2" style={{ color: 'var(--text-secondary)' }}>{statAbbrev((leg.stat ?? '') as string)}</td>
                                      <td className="py-1 px-2">{pick}</td>
                                      <td className="py-1 px-2">
                                        {Number(leg.line)}
                                        <GoblinDemonBadge scoringWeight={leg.scoringWeight != null ? Number(leg.scoringWeight) : undefined} />
                                        <UdFactorBadge udPickFactor={leg.udPickFactor != null && String(leg.udPickFactor).trim() !== '' ? Number(leg.udPickFactor) : undefined} />
                                      </td>
                                      <td className="py-1 px-2">{edgePctLeg}%</td>
                                      <td className="py-1 px-2">{evPctLeg}%</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ].filter(Boolean)
                })}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  )
}
