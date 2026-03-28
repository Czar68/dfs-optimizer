/**
 * Shared browser-side fetch + normalization for optimizer card CSVs
 * (`prizepicks-cards.csv`, `underdog-cards.csv`). Used by legacy DFS PRO and SlipStrength.
 */
import Papa from 'papaparse'
import type { BestBetTier, Card } from '../types'
import { filterUD } from '../data/odds'

declare const __APP_BASE__: string | undefined

/** Same base resolution as legacy `DfsProDashboardApp` (`__APP_BASE__` from Vite → `./data`). */
export function resolveOptimizerDataBase(): string {
  const base = (typeof __APP_BASE__ !== 'undefined' ? __APP_BASE__ : '/').replace(/\/+$/, '')
  return `${base}/data`
}

export function parseCsv<T>(url: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: true,
      complete: (r: { data?: T[] }) => resolve((r.data || []) as T[]),
      error: (err: Error) => reject(err),
    })
  })
}

export function getLegIds(c: Card): string[] {
  return [c.leg1Id, c.leg2Id, c.leg3Id, c.leg4Id, c.leg5Id, c.leg6Id, c.leg7Id, c.leg8Id].filter(
    (x): x is string => !!x
  )
}

export function cardKey(c: Card): string {
  const ids = getLegIds(c).sort()
  return `${String(c.site ?? '').toUpperCase()}-${c.flexType ?? ''}-${ids.join(',')}`
}

export function normalizeCardRow(row: any): Card | null {
  if (!row || (row.sport == null && row.Sport == null)) return null
  const site = (row.site ?? row.Site ?? '').toString().toUpperCase()
  const cardEv = Number(row.cardEv)
  const kellyStake = Number(row.kellyStake)
  const avgEdgePct = Number(row.avgEdgePct)
  const bbScore = Number(row.bestBetScore)
  const kellyFrac = Number(row.kellyFinalFraction ?? row.kellyFrac ?? row.kellyRawFraction ?? 0)
  const rawTier = (row.bestBetTier ?? '').toString().toLowerCase()
  const validTiers: BestBetTier[] = ['must_play', 'strong', 'small', 'lottery', 'skip']
  const tier = validTiers.includes(rawTier as BestBetTier)
    ? (rawTier as BestBetTier)
    : rawTier === 'core'
      ? ('strong' as BestBetTier)
      : undefined
  return {
    ...row,
    sport: row.sport ?? row.Sport,
    site: site === 'PP' || site === 'UD' ? site : (row.site ?? row.Site ?? ''),
    siteLeg:
      row['Site-Leg'] ??
      (row.site && row.flexType ? `${String(row.site).toLowerCase()}-${String(row.flexType).toLowerCase()}` : undefined),
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

export function mergeAndDedupePpUdCards(ppCards: Card[], udCards: Card[]): Card[] {
  const merged = [...ppCards, ...udCards]
  const seen = new Set<string>()
  return merged.filter((c) => {
    const k = cardKey(c)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export interface LoadOptimizerCardsResult {
  cards: Card[]
  error?: string
}

/** Shape of `data/last_fresh_run.json` (legacy manifest / run freshness). */
export interface LastFreshRunManifest {
  fresh_run_completed_at?: string
  bankroll?: number
  csv_stats?: Record<string, { rows: number; modified: string; size: number }>
  build_assets?: { js: string; css: string }
}

export async function fetchLastFreshRunManifest(): Promise<{ manifest: LastFreshRunManifest | null; error?: string }> {
  const url = `${resolveOptimizerDataBase()}/last_fresh_run.json?t=${Date.now()}`
  try {
    const r = await fetch(url)
    if (!r.ok) return { manifest: null, error: `HTTP ${r.status}` }
    const j = (await r.json()) as LastFreshRunManifest
    return { manifest: j }
  } catch (e: unknown) {
    return { manifest: null, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Loads PP + UD card CSVs, applies UD EV filter and cross-site dedupe — mirrors legacy dashboard fetch. */
export async function loadOptimizerCardsFromData(): Promise<LoadOptimizerCardsResult> {
  const base = resolveOptimizerDataBase()
  const bust = `?t=${Date.now()}`
  const ppCardsUrl = `${base}/prizepicks-cards.csv${bust}`
  const udCardsUrl = `${base}/underdog-cards.csv${bust}`

  let errorMsg: string | undefined
  let ppCards: Card[] = []
  let udCards: Card[] = []

  const [ppRes, udRes] = await Promise.allSettled([parseCsv<any>(ppCardsUrl), parseCsv<any>(udCardsUrl)])

  if (ppRes.status === 'fulfilled') {
    ppCards = ppRes.value.map(normalizeCardRow).filter((c): c is Card => c != null)
  } else {
    errorMsg = `PP cards: ${ppRes.reason instanceof Error ? ppRes.reason.message : String(ppRes.reason)}`
  }

  if (udRes.status === 'fulfilled') {
    const udParlays = udRes.value.map(normalizeCardRow).filter((c): c is Card => c != null)
    udCards = udParlays.filter((c) => filterUD(c.cardEv))
  } else {
    const bit = `UD cards: ${udRes.reason instanceof Error ? udRes.reason.message : String(udRes.reason)}`
    errorMsg = errorMsg ? `${errorMsg}; ${bit}` : bit
  }

  const cards = mergeAndDedupePpUdCards(ppCards, udCards)
  return { cards, error: errorMsg }
}

/** One merged leg row from PP/UD leg CSVs (browser display). */
export interface OptimizerLegRow {
  id: string
  sport: string
  player: string
  team: string
  stat: string
  line: string
  book: string
  site: 'PP' | 'UD' | ''
  edge?: number
  legEv?: number
  trueProb?: number
  gameTime?: string
  legLabel: string
}

export function normalizeLegRow(row: any): OptimizerLegRow | null {
  if (!row || (row.player == null && row.Player == null)) return null
  const id = String(row.id ?? '').trim()
  if (!id) return null
  const site: 'PP' | 'UD' | '' = id.includes('prizepicks-') ? 'PP' : id.includes('underdog-') ? 'UD' : ''
  const edge = Number(row.edge)
  const legEv = Number(row.legEv)
  const trueProb = Number(row.trueProb)
  const legLabel = String(row.leg_label ?? row.legLabel ?? '').trim()
  return {
    id,
    sport: String(row.sport ?? row.Sport ?? ''),
    player: String(row.player ?? ''),
    team: String(row.team ?? ''),
    stat: String(row.stat ?? ''),
    line: String(row.line ?? ''),
    book: String(row.book ?? ''),
    site,
    edge: Number.isFinite(edge) ? edge : undefined,
    legEv: Number.isFinite(legEv) ? legEv : undefined,
    trueProb: Number.isFinite(trueProb) ? trueProb : undefined,
    gameTime: row.gameTime != null ? String(row.gameTime) : undefined,
    legLabel: legLabel || `${row.player} ${row.stat} ${row.line}`.trim(),
  }
}

export interface LoadOptimizerLegsResult {
  legs: OptimizerLegRow[]
  error?: string
}

/** Parse `gameTime` from leg exports (ISO string or Date from Papa); returns ms or NaN. */
export function parseGameTimeMs(gt: string | Date | undefined): number {
  if (gt == null) return Number.NaN
  if (typeof gt === 'number') return Number.isFinite(gt) ? gt : Number.NaN
  if (gt instanceof Date) return gt.getTime()
  const n = Date.parse(String(gt))
  return Number.isFinite(n) ? n : Number.NaN
}

function normalizeTeamToken(team?: string): string | null {
  const t = String(team ?? '').trim().toUpperCase()
  return t.length >= 2 ? t : null
}

/** One scheduled “game” bucket derived only from exported leg rows (same sport + parsed start instant). */
export interface BoardGameRow {
  key: string
  startMs: number
  sport: string
  teams: string[]
  legCount: number
  ppLegs: number
  udLegs: number
}

export interface BoardGamesFromLegsResult {
  rows: BoardGameRow[]
  /** Leg rows with missing or unparseable `gameTime` (excluded from the board). */
  skippedLegsWithoutGameTime: number
}

/**
 * Minimal slate-style board: group legs by `sport` + parsed `gameTime` ms.
 * Team codes are unique abbreviations appearing on props in that bucket — not a league schedule feed.
 */
export function buildBoardGamesFromLegs(legs: OptimizerLegRow[]): BoardGamesFromLegsResult {
  let skippedLegsWithoutGameTime = 0
  const withTime: OptimizerLegRow[] = []
  for (const row of legs) {
    const ms = parseGameTimeMs(row.gameTime)
    if (!Number.isFinite(ms)) {
      skippedLegsWithoutGameTime += 1
      continue
    }
    withTime.push(row)
  }

  const groups = new Map<string, OptimizerLegRow[]>()
  for (const row of withTime) {
    const ms = parseGameTimeMs(row.gameTime)!
    const sport = row.sport.trim()
    const key = `${sport}|${ms}`
    const g = groups.get(key)
    if (g) g.push(row)
    else groups.set(key, [row])
  }

  const rows: BoardGameRow[] = []
  for (const [, g] of groups) {
    const startMs = parseGameTimeMs(g[0].gameTime)!
    const sport = g[0].sport.trim() || '—'
    const teamSet = new Set<string>()
    for (const r of g) {
      const t = normalizeTeamToken(r.team)
      if (t) teamSet.add(t)
    }
    const teams = Array.from(teamSet).sort((a, b) => a.localeCompare(b))
    let ppLegs = 0
    let udLegs = 0
    for (const r of g) {
      if (r.site === 'PP') ppLegs += 1
      else if (r.site === 'UD') udLegs += 1
    }
    rows.push({
      key: `${sport}|${startMs}`,
      startMs,
      sport,
      teams,
      legCount: g.length,
      ppLegs,
      udLegs,
    })
  }

  rows.sort((a, b) => a.startMs - b.startMs)
  return { rows, skippedLegsWithoutGameTime }
}

/**
 * Maps each exported leg `id` to the same board key used by `buildBoardGamesFromLegs` (`sport|startMs`).
 * Legs without parseable `gameTime` are omitted (no inferred bucket).
 */
export function buildLegIdToBoardGameKey(legs: OptimizerLegRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of legs) {
    const ms = parseGameTimeMs(row.gameTime)
    if (!Number.isFinite(ms)) continue
    const sport = row.sport.trim()
    map.set(row.id, `${sport}|${ms}`)
  }
  return map
}

/** Readable single-line label for a board row (export-grounded fields only). */
export function formatBoardGameOptionLabel(g: BoardGameRow): string {
  let timeStr = '—'
  try {
    timeStr = new Date(g.startMs).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    /* noop */
  }
  const sport = g.sport && g.sport !== '—' ? g.sport : 'Unknown sport'
  const teams = g.teams.length ? ` — ${g.teams.join(' · ')}` : ''
  return `${sport} · ${timeStr}${teams}`
}

/** Loads PP + UD leg CSVs and concatenates (no cross-file dedupe; ids are distinct). */
export async function loadOptimizerLegsFromData(): Promise<LoadOptimizerLegsResult> {
  const base = resolveOptimizerDataBase()
  const bust = `?t=${Date.now()}`
  const ppUrl = `${base}/prizepicks-legs.csv${bust}`
  const udUrl = `${base}/underdog-legs.csv${bust}`

  let errorMsg: string | undefined
  const pp: OptimizerLegRow[] = []
  const ud: OptimizerLegRow[] = []

  const [ppRes, udRes] = await Promise.allSettled([parseCsv<any>(ppUrl), parseCsv<any>(udUrl)])

  if (ppRes.status === 'fulfilled') {
    for (const r of ppRes.value) {
      const row = normalizeLegRow(r)
      if (row) pp.push(row)
    }
  } else {
    errorMsg = `PP legs: ${ppRes.reason instanceof Error ? ppRes.reason.message : String(ppRes.reason)}`
  }

  if (udRes.status === 'fulfilled') {
    for (const r of udRes.value) {
      const row = normalizeLegRow(r)
      if (row) ud.push(row)
    }
  } else {
    const bit = `UD legs: ${udRes.reason instanceof Error ? udRes.reason.message : String(udRes.reason)}`
    errorMsg = errorMsg ? `${errorMsg}; ${bit}` : bit
  }

  return { legs: [...pp, ...ud], error: errorMsg }
}
