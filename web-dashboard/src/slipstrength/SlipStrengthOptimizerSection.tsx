import { useEffect, useMemo, useRef, useState } from 'react'
import LiveDataAdapterPlaceholder from './LiveDataAdapterPlaceholder'
import { useSlipStrengthOptimizerData } from './SlipStrengthOptimizerDataContext'
import {
  STALE_RUN_MS,
  bestLegPreview,
  deepLinkFor,
  formatWinRateVsBe,
  parlayStrengthCell,
  runFreshnessLine,
  siteLabel,
  slipSummary,
} from './optimizerDisplayUtils'
import type { Card } from '../types'
import {
  buildBoardGamesFromLegs,
  buildLegIdToBoardGameKey,
  formatBoardGameOptionLabel,
  getLegIds,
  type OptimizerLegRow,
} from '../lib/optimizerCsvCards'

function fmtProb01(x: number | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—'
  return `${(x * 100).toFixed(1)}%`
}

function fmtEdge01(x: number | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—'
  return `${(x * 100).toFixed(2)}%`
}

/** Shared with Slips + Legs views: PP/UD only — matches loaded `site` field. */
type LegsSiteFilter = 'all' | 'PP' | 'UD'
type LegsSort = 'export' | 'edge' | 'legEv' | 'trueProb'

/** Slips: export order vs `runTimestamp` from loaded card rows only. */
type SlipsSort = 'export' | 'runNewest' | 'runOldest'

function parseRunTimestampMs(c: Card): number {
  const raw = String(c.runTimestamp ?? '').trim()
  if (!raw) return Number.NaN
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : Number.NaN
}

/**
 * Case-insensitive substring match on text that appears in the Slips table columns (no leg ids / internal ids).
 * Uses the same display formatters as the row where applicable, plus full `playerPropLine` (Best leg column source).
 */
function cardMatchesSlipsSearch(c: Card, queryLower: string): boolean {
  if (!queryLower) return true
  const haystacks = [
    slipSummary(c),
    parlayStrengthCell(c),
    formatWinRateVsBe(c),
    String(c.playerPropLine ?? '').trim(),
  ]
  return haystacks.some((s) => s && s !== '—' && s.toLowerCase().includes(queryLower))
}

function sortSlipsRows(rows: Card[], sort: SlipsSort): Card[] {
  if (sort === 'export') return rows
  const out = [...rows]
  out.sort((a, b) => {
    const ta = parseRunTimestampMs(a)
    const tb = parseRunTimestampMs(b)
    const aBad = !Number.isFinite(ta)
    const bBad = !Number.isFinite(tb)
    if (aBad && bBad) return 0
    if (aBad) return 1
    if (bBad) return -1
    if (sort === 'runNewest') return tb - ta
    return ta - tb
  })
  return out
}

function sortLegsRows(rows: OptimizerLegRow[], sort: LegsSort): OptimizerLegRow[] {
  if (sort === 'export') return rows
  const out = [...rows]
  out.sort((a, b) => {
    const va = a[sort]
    const vb = b[sort]
    const na = va != null && Number.isFinite(va) ? va : -Infinity
    const nb = vb != null && Number.isFinite(vb) ? vb : -Infinity
    if (nb !== na) return nb - na
    return 0
  })
  return out
}

/** Case-insensitive substring match across exported string fields only. */
function legRowMatchesSearch(row: OptimizerLegRow, queryLower: string): boolean {
  if (!queryLower) return true
  const fields = [row.player, row.legLabel, row.stat, row.sport]
  return fields.some((f) => f.toLowerCase().includes(queryLower))
}

/** Same normalization as the Sport column: trim `row.sport` for exact filter match. */
function normalizedSport(row: OptimizerLegRow): string {
  return row.sport.trim()
}

function formatBoardStartLocal(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

/** Compact display for search chip only; trim/search semantics unchanged elsewhere. */
function compactSlipsSearchChipText(raw: string, maxLen = 56): string {
  const t = raw.trim()
  if (!t) return ''
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1)}…`
}

/** Session-only persistence for SlipStrength toolbar filters (not sort, not primary tab). */
const SLIPSTRENGTH_SESSION_TOOLBAR_KEY = 'dfs-optimizer:slipstrength:session-toolbar-v1'

type SessionToolbarPersisted = {
  slipsSiteFilter: LegsSiteFilter
  slipsLegCountFilter: number | 'all'
  slipsBoardGameFilter: 'all' | string
  slipsSearch: string
  legsSiteFilter: LegsSiteFilter
  legsSportFilter: string
  legsSearch: string
}

function parseSiteFilter(v: unknown, fallback: LegsSiteFilter): LegsSiteFilter {
  if (v === 'all' || v === 'PP' || v === 'UD') return v
  return fallback
}

function parseLegCountFilter(v: unknown): number | 'all' {
  if (v === 'all') return 'all'
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 32) return v
  return 'all'
}

/** Board keys are `sport|startMs` from leg exports; reject obvious garbage. */
function parseBoardGameKeyFilter(v: unknown): 'all' | string {
  if (v === 'all' || v == null) return 'all'
  if (typeof v === 'string' && v.includes('|')) return v
  return 'all'
}

function readSessionToolbarInitial(): SessionToolbarPersisted {
  const defaults: SessionToolbarPersisted = {
    slipsSiteFilter: 'all',
    slipsLegCountFilter: 'all',
    slipsBoardGameFilter: 'all',
    slipsSearch: '',
    legsSiteFilter: 'all',
    legsSportFilter: 'all',
    legsSearch: '',
  }
  if (typeof sessionStorage === 'undefined') return defaults
  try {
    const raw = sessionStorage.getItem(SLIPSTRENGTH_SESSION_TOOLBAR_KEY)
    if (!raw) return defaults
    const p = JSON.parse(raw) as Record<string, unknown>
    return {
      slipsSiteFilter: parseSiteFilter(p.slipsSiteFilter, defaults.slipsSiteFilter),
      slipsLegCountFilter: parseLegCountFilter(p.slipsLegCountFilter),
      slipsBoardGameFilter: parseBoardGameKeyFilter(p.slipsBoardGameFilter),
      slipsSearch: typeof p.slipsSearch === 'string' ? p.slipsSearch : '',
      legsSiteFilter: parseSiteFilter(p.legsSiteFilter, defaults.legsSiteFilter),
      legsSportFilter: typeof p.legsSportFilter === 'string' ? p.legsSportFilter : 'all',
      legsSearch: typeof p.legsSearch === 'string' ? p.legsSearch : '',
    }
  } catch {
    return defaults
  }
}

function persistSessionToolbar(state: SessionToolbarPersisted): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(SLIPSTRENGTH_SESSION_TOOLBAR_KEY, JSON.stringify(state))
  } catch {
    /* quota / private mode */
  }
}

/** Toolbar-only query keys (shareable); other params on the URL are preserved. */
const TQ = {
  slipSite: 'slipSite',
  slipLegs: 'slipLegs',
  slipGame: 'slipGame',
  slipQ: 'slipQ',
  legSite: 'legSite',
  legSport: 'legSport',
  legQ: 'legQ',
} as const

const TRACKED_SLIPSTRENGTH_Q = Object.values(TQ)

const NEUTRAL_TOOLBAR: SessionToolbarPersisted = {
  slipsSiteFilter: 'all',
  slipsLegCountFilter: 'all',
  slipsBoardGameFilter: 'all',
  slipsSearch: '',
  legsSiteFilter: 'all',
  legsSportFilter: 'all',
  legsSearch: '',
}

function parseSlipSiteFromParam(p: URLSearchParams): LegsSiteFilter {
  const v = (p.get(TQ.slipSite) ?? '').trim()
  if (v === '' || v.toLowerCase() === 'all') return 'all'
  if (v === 'PP' || v === 'UD') return v
  return 'all'
}

function parseLegSiteFromParam(p: URLSearchParams): LegsSiteFilter {
  const v = (p.get(TQ.legSite) ?? '').trim()
  if (v === '' || v.toLowerCase() === 'all') return 'all'
  if (v === 'PP' || v === 'UD') return v
  return 'all'
}

function parseSlipLegsFromParam(p: URLSearchParams): number | 'all' {
  if (!p.has(TQ.slipLegs)) return 'all'
  const raw = p.get(TQ.slipLegs)
  const n = raw != null ? Number.parseInt(String(raw), 10) : Number.NaN
  if (Number.isInteger(n) && n >= 1 && n <= 32) return n
  return 'all'
}

function parseSlipGameFromParam(p: URLSearchParams): 'all' | string {
  if (!p.has(TQ.slipGame)) return 'all'
  const v = p.get(TQ.slipGame) ?? ''
  if (v === '' || v === 'all') return 'all'
  return parseBoardGameKeyFilter(v) === 'all' ? 'all' : v
}

function parseLegSportFromParam(p: URLSearchParams): string {
  if (!p.has(TQ.legSport)) return 'all'
  const v = p.get(TQ.legSport)
  if (v == null || v === '') return 'all'
  return v
}

/** URL overrides session per param when that key is present in the query string. */
function mergeUrlOverSession(session: SessionToolbarPersisted): SessionToolbarPersisted {
  if (typeof window === 'undefined') return session
  let p: URLSearchParams
  try {
    p = new URLSearchParams(window.location.search)
  } catch {
    return session
  }
  const out = { ...session }
  if (p.has(TQ.slipSite)) out.slipsSiteFilter = parseSlipSiteFromParam(p)
  if (p.has(TQ.slipLegs)) out.slipsLegCountFilter = parseSlipLegsFromParam(p)
  if (p.has(TQ.slipGame)) out.slipsBoardGameFilter = parseSlipGameFromParam(p)
  if (p.has(TQ.slipQ)) out.slipsSearch = p.get(TQ.slipQ) ?? ''
  if (p.has(TQ.legSite)) out.legsSiteFilter = parseLegSiteFromParam(p)
  if (p.has(TQ.legSport)) out.legsSportFilter = parseLegSportFromParam(p)
  if (p.has(TQ.legQ)) out.legsSearch = p.get(TQ.legQ) ?? ''
  return out
}

function readToolbarInitialState(): SessionToolbarPersisted {
  return mergeUrlOverSession(readSessionToolbarInitial())
}

/** Full toolbar state implied by URL (missing keys → neutral). Used for browser back/forward. */
function parseToolbarFromUrlSearchOnly(search: string): SessionToolbarPersisted {
  let p: URLSearchParams
  try {
    p = new URLSearchParams(search)
  } catch {
    return { ...NEUTRAL_TOOLBAR }
  }
  const out = { ...NEUTRAL_TOOLBAR }
  if (p.has(TQ.slipSite)) out.slipsSiteFilter = parseSlipSiteFromParam(p)
  if (p.has(TQ.slipLegs)) out.slipsLegCountFilter = parseSlipLegsFromParam(p)
  if (p.has(TQ.slipGame)) out.slipsBoardGameFilter = parseSlipGameFromParam(p)
  if (p.has(TQ.slipQ)) out.slipsSearch = p.get(TQ.slipQ) ?? ''
  if (p.has(TQ.legSite)) out.legsSiteFilter = parseLegSiteFromParam(p)
  if (p.has(TQ.legSport)) out.legsSportFilter = parseLegSportFromParam(p)
  if (p.has(TQ.legQ)) out.legsSearch = p.get(TQ.legQ) ?? ''
  return out
}

function replaceUrlWithToolbarState(state: SessionToolbarPersisted): void {
  if (typeof window === 'undefined') return
  try {
    const p = new URLSearchParams(window.location.search)
    for (const k of TRACKED_SLIPSTRENGTH_Q) p.delete(k)
    if (state.slipsSiteFilter !== 'all') p.set(TQ.slipSite, state.slipsSiteFilter)
    if (state.slipsLegCountFilter !== 'all') p.set(TQ.slipLegs, String(state.slipsLegCountFilter))
    if (state.slipsBoardGameFilter !== 'all') p.set(TQ.slipGame, state.slipsBoardGameFilter)
    if (state.slipsSearch.trim()) p.set(TQ.slipQ, state.slipsSearch)
    if (state.legsSiteFilter !== 'all') p.set(TQ.legSite, state.legsSiteFilter)
    if (state.legsSportFilter !== 'all') p.set(TQ.legSport, state.legsSportFilter)
    if (state.legsSearch.trim()) p.set(TQ.legQ, state.legsSearch)
    const qs = p.toString()
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next !== cur) window.history.replaceState(window.history.state, '', next)
  } catch {
    /* noop */
  }
}

export default function SlipStrengthOptimizerSection() {
  const sessionToolbarInitRef = useRef<SessionToolbarPersisted | null>(null)
  if (sessionToolbarInitRef.current === null) {
    sessionToolbarInitRef.current = readToolbarInitialState()
  }
  const st0 = sessionToolbarInitRef.current

  const [optimizerView, setOptimizerView] = useState<'slips' | 'legs' | 'board'>('slips')
  const [slipsSiteFilter, setSlipsSiteFilter] = useState<LegsSiteFilter>(st0.slipsSiteFilter)
  /** `'all'` or a leg count that appears on at least one loaded card. */
  const [slipsLegCountFilter, setSlipsLegCountFilter] = useState<number | 'all'>(st0.slipsLegCountFilter)
  const [slipsSort, setSlipsSort] = useState<SlipsSort>('export')
  /** `'all'` or a `BoardGameRow.key` from loaded leg exports (`sport|startMs`). */
  const [slipsBoardGameFilter, setSlipsBoardGameFilter] = useState<'all' | string>(st0.slipsBoardGameFilter)
  const [slipsSearch, setSlipsSearch] = useState(st0.slipsSearch)
  const [legsSiteFilter, setLegsSiteFilter] = useState<LegsSiteFilter>(st0.legsSiteFilter)
  /** `'all'` = all sports; otherwise exact `row.sport.trim()` from loaded data. */
  const [legsSportFilter, setLegsSportFilter] = useState<string>(st0.legsSportFilter)
  const [legsSort, setLegsSort] = useState<LegsSort>('export')
  const [legsSearch, setLegsSearch] = useState(st0.legsSearch)
  const {
    cards,
    legs,
    loading,
    loadError,
    legsError,
    manifest,
    manifestError,
    ppCount,
    udCount,
    ppLegCount,
    udLegCount,
    staleRun,
  } = useSlipStrengthOptimizerData()

  useEffect(() => {
    persistSessionToolbar({
      slipsSiteFilter,
      slipsLegCountFilter,
      slipsBoardGameFilter,
      slipsSearch,
      legsSiteFilter,
      legsSportFilter,
      legsSearch,
    })
  }, [
    slipsSiteFilter,
    slipsLegCountFilter,
    slipsBoardGameFilter,
    slipsSearch,
    legsSiteFilter,
    legsSportFilter,
    legsSearch,
  ])

  useEffect(() => {
    replaceUrlWithToolbarState({
      slipsSiteFilter,
      slipsLegCountFilter,
      slipsBoardGameFilter,
      slipsSearch,
      legsSiteFilter,
      legsSportFilter,
      legsSearch,
    })
  }, [
    slipsSiteFilter,
    slipsLegCountFilter,
    slipsBoardGameFilter,
    slipsSearch,
    legsSiteFilter,
    legsSportFilter,
    legsSearch,
  ])

  useEffect(() => {
    function onPopState() {
      const search = window.location.search
      const s = parseToolbarFromUrlSearchOnly(search)
      setSlipsSiteFilter(s.slipsSiteFilter)
      setSlipsLegCountFilter(s.slipsLegCountFilter)
      setSlipsBoardGameFilter(s.slipsBoardGameFilter)
      setSlipsSearch(s.slipsSearch)
      setLegsSiteFilter(s.legsSiteFilter)
      setLegsSportFilter(s.legsSportFilter)
      setLegsSearch(s.legsSearch)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const slipsLegCountOptions = useMemo(() => {
    const seen = new Set<number>()
    for (const c of cards) {
      seen.add(getLegIds(c).length)
    }
    return Array.from(seen).sort((a, b) => a - b)
  }, [cards])

  useEffect(() => {
    if (slipsLegCountFilter === 'all') return
    if (loading) return
    if (!slipsLegCountOptions.includes(slipsLegCountFilter)) setSlipsLegCountFilter('all')
  }, [slipsLegCountOptions, slipsLegCountFilter, loading])

  const boardGames = useMemo(() => buildBoardGamesFromLegs(legs), [legs])

  const slipsBoardGameKeys = useMemo(
    () => new Set(boardGames.rows.map((g) => g.key)),
    [boardGames.rows]
  )

  useEffect(() => {
    if (slipsBoardGameFilter === 'all') return
    if (loading) return
    if (!slipsBoardGameKeys.has(slipsBoardGameFilter)) setSlipsBoardGameFilter('all')
  }, [slipsBoardGameFilter, slipsBoardGameKeys, loading])

  const legIdToBoardGameKey = useMemo(() => buildLegIdToBoardGameKey(legs), [legs])

  const sportOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const r of legs) {
      seen.add(normalizedSport(r))
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [legs])

  useEffect(() => {
    if (legsSportFilter === 'all') return
    if (loading) return
    if (!sportOptions.includes(legsSportFilter)) setLegsSportFilter('all')
  }, [sportOptions, legsSportFilter, loading])

  const siteFilteredLegs = useMemo(() => {
    if (legsSiteFilter === 'all') return legs
    return legs.filter((r) => r.site === legsSiteFilter)
  }, [legs, legsSiteFilter])

  const sportFilteredLegs = useMemo(() => {
    if (legsSportFilter === 'all') return siteFilteredLegs
    return siteFilteredLegs.filter((r) => normalizedSport(r) === legsSportFilter)
  }, [siteFilteredLegs, legsSportFilter])

  const searchQueryLower = legsSearch.trim().toLowerCase()

  const searchFilteredLegs = useMemo(() => {
    if (!searchQueryLower) return sportFilteredLegs
    return sportFilteredLegs.filter((r) => legRowMatchesSearch(r, searchQueryLower))
  }, [sportFilteredLegs, searchQueryLower])

  const displayLegs = useMemo(
    () => sortLegsRows(searchFilteredLegs, legsSort),
    [searchFilteredLegs, legsSort]
  )

  const slipsSiteFiltered = useMemo(() => {
    if (slipsSiteFilter === 'all') return cards
    return cards.filter((c) => c.site === slipsSiteFilter)
  }, [cards, slipsSiteFilter])

  const slipsFiltered = useMemo(() => {
    if (slipsLegCountFilter === 'all') return slipsSiteFiltered
    return slipsSiteFiltered.filter((c) => getLegIds(c).length === slipsLegCountFilter)
  }, [slipsSiteFiltered, slipsLegCountFilter])

  const slipsBoardFiltered = useMemo(() => {
    if (slipsBoardGameFilter === 'all') return slipsFiltered
    return slipsFiltered.filter((c) =>
      getLegIds(c).some((legId) => legIdToBoardGameKey.get(legId) === slipsBoardGameFilter)
    )
  }, [slipsFiltered, slipsBoardGameFilter, legIdToBoardGameKey])

  const slipsSearchLower = slipsSearch.trim().toLowerCase()

  const slipsSearchFiltered = useMemo(() => {
    if (!slipsSearchLower) return slipsBoardFiltered
    return slipsBoardFiltered.filter((c) => cardMatchesSlipsSearch(c, slipsSearchLower))
  }, [slipsBoardFiltered, slipsSearchLower])

  const displaySlips = useMemo(
    () => sortSlipsRows(slipsSearchFiltered, slipsSort),
    [slipsSearchFiltered, slipsSort]
  )

  const slipsFiltersActive =
    slipsSiteFilter !== 'all' || slipsLegCountFilter !== 'all' || slipsBoardGameFilter !== 'all'
  const slipsSearchActive = Boolean(slipsSearchLower)
  const slipsToolbarNarrowingActive = slipsFiltersActive || slipsSearchActive

  const slipsBoardGameChipLabel = useMemo(() => {
    if (slipsBoardGameFilter === 'all') return null
    const row = boardGames.rows.find((g) => g.key === slipsBoardGameFilter)
    return row ? formatBoardGameOptionLabel(row) : slipsBoardGameFilter
  }, [slipsBoardGameFilter, boardGames.rows])

  const legsFiltersActive =
    legsSiteFilter !== 'all' || legsSportFilter !== 'all' || Boolean(searchQueryLower)

  return (
    <section id="optimizer" className="section">
      <div className="container">
        <header className="section-header">
          <h2>Pick&apos;em optimizer</h2>
          <p>
            The card table is live from published <code>./data/</code> exports. The <strong>Board / game</strong>{' '}
            control in the left column filters the Slips view using leg export fields only; other left-column controls
            remain preview-only.
          </p>
        </header>

        <div className="optimizer-shell" aria-label="Optimizer layout shell">
          <aside className="optimizer-panel" aria-label="Slip configuration and board filter">
            <h3>Slip configuration</h3>
            <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
              <strong>Board / game</strong> below is wired to the Slips table. Remaining controls are disabled
              placeholders. Refresh data by running the optimizer pipeline and publishing CSVs to this host.
            </p>

            <div className="field" style={{ marginBottom: 'var(--space-4)' }}>
              <label htmlFor="slipstrength-left-board-game">Board / game (from leg exports)</label>
              <select
                id="slipstrength-left-board-game"
                value={slipsBoardGameFilter}
                onChange={(e) => setSlipsBoardGameFilter(e.target.value === 'all' ? 'all' : e.target.value)}
                disabled={loading || legs.length === 0}
                aria-describedby="slipstrength-left-board-game-hint"
              >
                <option value="all">All games</option>
                {boardGames.rows.map((g) => (
                  <option key={g.key} value={g.key}>
                    {formatBoardGameOptionLabel(g)}
                  </option>
                ))}
              </select>
              <p id="slipstrength-left-board-game-hint" className="hint" style={{ marginTop: 'var(--space-2)' }}>
                Inferred from loaded leg CSVs (sport + <code>gameTime</code>); not official schedule data. Narrows{' '}
                <strong>Slips</strong> when a card has at least one leg in the selected bucket. If no games list here,
                leg rows lack a parseable <code>gameTime</code>.
              </p>
            </div>

            <fieldset
              disabled
              style={{
                border: 'none',
                padding: 0,
                margin: 0,
                minWidth: 0,
                opacity: 0.85,
              }}
            >
              <legend
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-faint)',
                  padding: 0,
                  marginBottom: 'var(--space-2)',
                }}
              >
                Inert controls (do not affect the table)
              </legend>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="site">Site</label>
                  <select id="site" name="site" defaultValue="PrizePicks">
                    <option>PrizePicks</option>
                    <option>Underdog</option>
                    <option>Betr</option>
                    <option>Pick6</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="slipType">Slip type</label>
                  <select id="slipType" name="slipType" defaultValue="Power play">
                    <option>Power play</option>
                    <option>Flex / insurance</option>
                  </select>
                  <p className="hint">Illustrative — not connected to payout math in this UI.</p>
                </div>
                <div className="field">
                  <label htmlFor="legs">Number of legs</label>
                  <select id="legs" name="legs" defaultValue="3-leg">
                    <option>2-leg</option>
                    <option>3-leg</option>
                    <option>4-leg</option>
                    <option>5-leg</option>
                    <option>6-leg (where supported)</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="slips">Slips to generate</label>
                  <input id="slips" type="number" min={1} max={50} defaultValue={10} />
                </div>
              </div>

              <div className="field">
                <span>Filter ideas (not active)</span>
                <div className="chips" aria-hidden="true">
                  <span className="chip">Only +EV legs vs books</span>
                  <span className="chip">Ban correlated unders</span>
                  <span className="chip">Exclude bumped lines</span>
                  <span className="chip">Leg strength ≥ 80</span>
                </div>
                <p className="hint">Examples only — no filtering is applied in the browser.</p>
              </div>

              <div className="field" style={{ marginTop: 'var(--space-4)' }}>
                <label htmlFor="projectionSource">Projection / model source</label>
                <select id="projectionSource" name="projectionSource" defaultValue="Your model">
                  <option>Your model</option>
                  <option>Imported CSV</option>
                  <option>Blended</option>
                </select>
              </div>
            </fieldset>

            <div
              role="status"
              className="hint"
              style={{
                marginTop: 'var(--space-4)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid color-mix(in oklab, var(--color-border) 80%, transparent)',
                background: 'color-mix(in oklab, var(--color-surface-2, #1a1a1a) 40%, transparent)',
              }}
            >
              <strong>Generate / re-roll:</strong> not implemented in SlipStrength. Use the repo optimizer CLI and publish
              flows to refresh <code>./data/</code>.
            </div>

            <div className="optimizer-kpis" role="status" aria-live="polite">
              <div>
                <strong>Data freshness</strong>
                {runFreshnessLine(manifest, manifestError, loading)}
                {staleRun ? (
                  <span>
                    {' '}
                    Warning: last recorded run is older than {STALE_RUN_MS / 3600000} hours — treat cards as potentially
                    stale until you refresh data.
                  </span>
                ) : null}
              </div>
              <div>
                <strong>Cards loaded (this table)</strong>
                {loading
                  ? 'Loading…'
                  : `PrizePicks ${ppCount}, Underdog ${udCount} — ${cards.length} total after merge & dedupe.`}
                {loadError ? (
                  <span> Partial or failed CSV load: {loadError}</span>
                ) : null}
              </div>
              <div>
                <strong>Legs loaded (CSV)</strong>
                {loading
                  ? 'Loading…'
                  : `PrizePicks ${ppLegCount}, Underdog ${udLegCount} — ${legs.length} total rows (concatenated exports).`}
                {legsError ? <span> Partial or failed CSV load: {legsError}</span> : null}
              </div>
            </div>
          </aside>

          <section className="optimizer-panel" aria-label="Slips, legs, and board">
            <header className="optimizer-preview-header">
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Optimizer cards</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>
                  {optimizerView === 'slips' ? (
                    <>
                      Rows from <code>data/prizepicks-cards.csv</code> and <code>data/underdog-cards.csv</code>. Run time
                      from <code>data/last_fresh_run.json</code>. Counts reflect the merged list below (not raw CSV row
                      totals). Site, leg-count, and left-column board/game filters plus text search narrow the loaded
                      rows; sort reorders that subset. Board/game uses the same leg-export buckets as the Board tab. All
                      fields come from exports — no new analytics.
                    </>
                  ) : optimizerView === 'legs' ? (
                    <>
                      Rows from <code>data/prizepicks-legs.csv</code> and <code>data/underdog-legs.csv</code> as exported.
                      Site, sport, search, and sort only filter or reorder loaded rows — no new analytics.
                    </>
                  ) : (
                    <>
                      Board groups exported leg rows by <strong>sport</strong> and <strong>parsed game start time</strong>.
                      Team codes are taken from each leg&apos;s <code>team</code> field — not a separate schedule file.
                    </>
                  )}
                </div>
              </div>
              <div
                className="optimizer-preview-tabs"
                role="group"
                aria-label="Optimizer data view — Slips, Legs, and Board"
              >
                <button
                  type="button"
                  className="optimizer-preview-tab"
                  aria-pressed={optimizerView === 'slips'}
                  onClick={() => setOptimizerView('slips')}
                >
                  Slips
                </button>
                <button
                  type="button"
                  className="optimizer-preview-tab"
                  aria-pressed={optimizerView === 'legs'}
                  onClick={() => setOptimizerView('legs')}
                >
                  Legs
                </button>
                <button
                  type="button"
                  className="optimizer-preview-tab"
                  aria-pressed={optimizerView === 'board'}
                  onClick={() => setOptimizerView('board')}
                >
                  Board
                </button>
              </div>
            </header>

            {optimizerView === 'slips' ? (
              <>
                <div
                  className="legs-view-toolbar"
                  aria-label="Slips view — filter, search, and sort loaded card rows only"
                >
                  <div className="field">
                    <label htmlFor="slipstrength-slips-site">Site</label>
                    <select
                      id="slipstrength-slips-site"
                      value={slipsSiteFilter}
                      onChange={(e) => setSlipsSiteFilter(e.target.value as LegsSiteFilter)}
                      disabled={loading}
                    >
                      <option value="all">All</option>
                      <option value="PP">PrizePicks</option>
                      <option value="UD">Underdog</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="slipstrength-slips-leg-count">Leg count</label>
                    <select
                      id="slipstrength-slips-leg-count"
                      value={slipsLegCountFilter === 'all' ? 'all' : String(slipsLegCountFilter)}
                      onChange={(e) => {
                        const v = e.target.value
                        setSlipsLegCountFilter(v === 'all' ? 'all' : Number(v))
                      }}
                      disabled={loading || cards.length === 0}
                    >
                      <option value="all">All leg counts in data</option>
                      {slipsLegCountOptions.map((n) => (
                        <option key={n} value={String(n)}>
                          {n}-leg
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="slipstrength-slips-sort">Sort</label>
                    <select
                      id="slipstrength-slips-sort"
                      value={slipsSort}
                      onChange={(e) => setSlipsSort(e.target.value as SlipsSort)}
                      disabled={loading}
                    >
                      <option value="export">Export order</option>
                      <option value="runNewest">Run timestamp (newest first)</option>
                      <option value="runOldest">Run timestamp (oldest first)</option>
                    </select>
                  </div>
                  <div className="field legs-view-toolbar-search">
                    <label htmlFor="slipstrength-slips-search">Search</label>
                    <input
                      id="slipstrength-slips-search"
                      type="search"
                      value={slipsSearch}
                      onChange={(e) => setSlipsSearch(e.target.value)}
                      placeholder="Slip summary, props, parlay strength, win rate…"
                      autoComplete="off"
                      disabled={loading}
                      spellCheck={false}
                    />
                  </div>
                  {slipsToolbarNarrowingActive ? (
                    <div
                      className="slips-active-filters"
                      role="group"
                      aria-label="Active filters on loaded slips"
                    >
                      {slipsSiteFilter !== 'all' ? (
                        <button
                          type="button"
                          className="slips-filter-chip"
                          onClick={() => setSlipsSiteFilter('all')}
                          aria-label={`Remove site filter, currently ${siteLabel(slipsSiteFilter)}`}
                        >
                          <span className="slips-filter-chip-text">
                            Site: {siteLabel(slipsSiteFilter)}
                          </span>
                          <span className="slips-filter-chip-remove" aria-hidden>
                            ×
                          </span>
                        </button>
                      ) : null}
                      {slipsLegCountFilter !== 'all' ? (
                        <button
                          type="button"
                          className="slips-filter-chip"
                          onClick={() => setSlipsLegCountFilter('all')}
                          aria-label={`Remove leg count filter, currently ${slipsLegCountFilter}-leg`}
                        >
                          <span className="slips-filter-chip-text">
                            Leg count: {slipsLegCountFilter}-leg
                          </span>
                          <span className="slips-filter-chip-remove" aria-hidden>
                            ×
                          </span>
                        </button>
                      ) : null}
                      {slipsBoardGameFilter !== 'all' && slipsBoardGameChipLabel ? (
                        <button
                          type="button"
                          className="slips-filter-chip"
                          onClick={() => setSlipsBoardGameFilter('all')}
                          title={slipsBoardGameChipLabel}
                          aria-label={`Remove board or game filter: ${slipsBoardGameChipLabel}`}
                        >
                          <span className="slips-filter-chip-text">
                            Game: {slipsBoardGameChipLabel}
                          </span>
                          <span className="slips-filter-chip-remove" aria-hidden>
                            ×
                          </span>
                        </button>
                      ) : null}
                      {slipsSearchActive ? (
                        <button
                          type="button"
                          className="slips-filter-chip slips-filter-chip--search"
                          onClick={() => setSlipsSearch('')}
                          aria-label={`Remove search filter, query ${compactSlipsSearchChipText(slipsSearch)}`}
                        >
                          <span className="slips-filter-chip-text">
                            Search: “{compactSlipsSearchChipText(slipsSearch)}”
                          </span>
                          <span className="slips-filter-chip-remove" aria-hidden>
                            ×
                          </span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="slips-filter-clear-all"
                        onClick={() => {
                          setSlipsSiteFilter('all')
                          setSlipsLegCountFilter('all')
                          setSlipsBoardGameFilter('all')
                          setSlipsSearch('')
                        }}
                        aria-label="Clear all slip filters: site, leg count, board or game, and search"
                      >
                        Clear all filters
                      </button>
                    </div>
                  ) : null}
                  {!loading && cards.length > 0 ? (
                    <p className="legs-view-toolbar-hint hint" role="status">
                      {!slipsToolbarNarrowingActive && slipsSort === 'export' ? (
                        <>Showing all {cards.length} loaded card row(s).</>
                      ) : (
                        <>
                          Showing {displaySlips.length} of {cards.length} loaded card row(s)
                          {slipsToolbarNarrowingActive ? (
                            <>
                              {' '}
                              after{' '}
                              {[
                                slipsSiteFilter !== 'all' ? 'site filter' : null,
                                slipsLegCountFilter !== 'all' ? 'leg-count filter' : null,
                                slipsBoardGameFilter !== 'all' ? 'board/game filter' : null,
                                slipsSearchActive ? 'search' : null,
                              ]
                                .filter(Boolean)
                                .join(', ') || 'filters'}
                            </>
                          ) : null}
                          {slipsSort !== 'export' ? (
                            <>
                              {slipsToolbarNarrowingActive ? '; ' : ' — '}
                              order:{' '}
                              {slipsSort === 'runNewest'
                                ? 'run timestamp, newest first'
                                : 'run timestamp, oldest first'}{' '}
                              (rows without a parseable <code>runTimestamp</code> sort last)
                            </>
                          ) : null}
                          .
                        </>
                      )}
                    </p>
                  ) : null}
                </div>
                <div id="slipstrength-root" className="lineups-table-shell" aria-label="Optimizer cards from data">
                  <div className="lineups-table-header">
                    <span>Slip</span>
                    <span>Parlay strength</span>
                    <span>Win rate vs BE</span>
                    <span>Best leg</span>
                    <span>Deep link</span>
                  </div>
                  {loading ? (
                    <div className="lineups-table-row" role="status">
                      <span>Loading optimizer cards…</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                    </div>
                  ) : cards.length === 0 ? (
                    <div className="lineups-table-row" role="status">
                      <span>No cards in data yet.</span>
                      <span>—</span>
                      <span>—</span>
                      <span>Run the optimizer and sync CSVs into /data.</span>
                      <span>—</span>
                    </div>
                  ) : displaySlips.length === 0 ? (
                    <div className="lineups-table-row" role="status">
                      <span>
                        {slipsSiteFiltered.length === 0
                          ? 'No cards match the current site filter.'
                          : slipsFiltered.length === 0
                            ? 'No cards match the current leg-count filter (with the current site filter).'
                            : slipsBoardFiltered.length === 0
                              ? 'No cards match the current board/game filter — no slip has a leg in that inferred game (with the current site and leg-count filters). Cards whose legs are missing from leg exports or lack parseable gameTime cannot match a specific game.'
                              : slipsSearchActive
                                ? 'No cards match the current search (with the current site, leg-count, and board/game filters).'
                                : 'No cards to show.'}
                      </span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                    </div>
                  ) : (
                    displaySlips.map((c, i) => {
                      const link = deepLinkFor(c)
                      return (
                        <div className="lineups-table-row" key={`${slipSummary(c)}-${i}`}>
                          <span>{slipSummary(c)}</span>
                          <span>{parlayStrengthCell(c)}</span>
                          <span>{formatWinRateVsBe(c)}</span>
                          <span>{bestLegPreview(c)}</span>
                          <span>
                            <a className="btn-link-icon" href={link.href} target="_blank" rel="noopener noreferrer">
                              {link.label}
                            </a>
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </>
            ) : optimizerView === 'legs' ? (
              <>
                <div
                  className="legs-view-toolbar"
                  aria-label="Legs view — filter and sort loaded rows only"
                >
                  <div className="field">
                    <label htmlFor="slipstrength-legs-site">Site</label>
                    <select
                      id="slipstrength-legs-site"
                      value={legsSiteFilter}
                      onChange={(e) => setLegsSiteFilter(e.target.value as LegsSiteFilter)}
                      disabled={loading}
                    >
                      <option value="all">All</option>
                      <option value="PP">PrizePicks</option>
                      <option value="UD">Underdog</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="slipstrength-legs-sport">Sport</label>
                    <select
                      id="slipstrength-legs-sport"
                      value={legsSportFilter}
                      onChange={(e) => setLegsSportFilter(e.target.value)}
                      disabled={loading || legs.length === 0}
                    >
                      <option value="all">All sports</option>
                      {sportOptions.map((s) => (
                        <option key={s.length ? s : '__empty'} value={s}>
                          {s.length ? s : '(no sport)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field legs-view-toolbar-search">
                    <label htmlFor="slipstrength-legs-search">Search</label>
                    <input
                      id="slipstrength-legs-search"
                      type="search"
                      value={legsSearch}
                      onChange={(e) => setLegsSearch(e.target.value)}
                      placeholder="Player, leg label, stat, sport…"
                      autoComplete="off"
                      disabled={loading}
                      spellCheck={false}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="slipstrength-legs-sort">Sort</label>
                    <select
                      id="slipstrength-legs-sort"
                      value={legsSort}
                      onChange={(e) => setLegsSort(e.target.value as LegsSort)}
                      disabled={loading}
                    >
                      <option value="export">Export order</option>
                      <option value="edge">Edge (high → low)</option>
                      <option value="legEv">Leg EV (high → low)</option>
                      <option value="trueProb">p* (high → low)</option>
                    </select>
                  </div>
                  {legsFiltersActive ? (
                    <div
                      className="slips-active-filters"
                      role="group"
                      aria-label="Active filters on loaded legs"
                    >
                      {legsSiteFilter !== 'all' ? (
                        <button
                          type="button"
                          className="slips-filter-chip"
                          onClick={() => setLegsSiteFilter('all')}
                          aria-label={`Remove site filter, currently ${siteLabel(legsSiteFilter)}`}
                        >
                          <span className="slips-filter-chip-text">
                            Site: {siteLabel(legsSiteFilter)}
                          </span>
                          <span className="slips-filter-chip-remove" aria-hidden>
                            ×
                          </span>
                        </button>
                      ) : null}
                      {legsSportFilter !== 'all' ? (
                        <button
                          type="button"
                          className="slips-filter-chip"
                          onClick={() => setLegsSportFilter('all')}
                          aria-label={`Remove sport filter, currently ${legsSportFilter.length ? legsSportFilter : '(no sport)'}`}
                        >
                          <span className="slips-filter-chip-text">
                            Sport: {legsSportFilter.length ? legsSportFilter : '(no sport)'}
                          </span>
                          <span className="slips-filter-chip-remove" aria-hidden>
                            ×
                          </span>
                        </button>
                      ) : null}
                      {searchQueryLower ? (
                        <button
                          type="button"
                          className="slips-filter-chip slips-filter-chip--search"
                          onClick={() => setLegsSearch('')}
                          aria-label={`Remove search filter, query ${compactSlipsSearchChipText(legsSearch)}`}
                        >
                          <span className="slips-filter-chip-text">
                            Search: “{compactSlipsSearchChipText(legsSearch)}”
                          </span>
                          <span className="slips-filter-chip-remove" aria-hidden>
                            ×
                          </span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="slips-filter-clear-all"
                        onClick={() => {
                          setLegsSiteFilter('all')
                          setLegsSportFilter('all')
                          setLegsSearch('')
                        }}
                        aria-label="Clear all leg filters: site, sport, and search"
                      >
                        Clear all filters
                      </button>
                    </div>
                  ) : null}
                  {!loading && legs.length > 0 ? (
                    <p className="legs-view-toolbar-hint hint" role="status">
                      {!legsFiltersActive ? (
                        <>Showing all {legs.length} loaded rows.</>
                      ) : (
                        <>
                          Showing {displayLegs.length} of {legs.length} loaded rows after{' '}
                          {[
                            legsSiteFilter !== 'all' ? 'site filter' : null,
                            legsSportFilter !== 'all' ? 'sport filter' : null,
                            searchQueryLower ? 'search' : null,
                          ]
                            .filter(Boolean)
                            .join(', ') || 'filters'}
                          .
                        </>
                      )}
                    </p>
                  ) : null}
                </div>
              <div
                id="slipstrength-legs-root"
                className="lineups-table-shell lineups-table-shell--legs"
                aria-label="Optimizer legs from exported CSVs"
              >
                <div className="lineups-table-header">
                  <span>Leg</span>
                  <span>Site</span>
                  <span>Sport</span>
                  <span>Player</span>
                  <span>Stat</span>
                  <span>Line</span>
                  <span>Book</span>
                  <span>Edge</span>
                  <span>Leg EV</span>
                  <span>p*</span>
                  <span>Game</span>
                </div>
                {loading ? (
                  <div className="lineups-table-row" role="status">
                    <span>Loading leg CSVs…</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                  </div>
                ) : legs.length === 0 && !legsError ? (
                  <div className="lineups-table-row" role="status">
                    <span>No leg rows in data yet.</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                  </div>
                ) : legs.length === 0 && legsError ? (
                  <div className="lineups-table-row" role="status">
                    <span>Could not load leg CSVs.</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                  </div>
                ) : displayLegs.length === 0 ? (
                  <div className="lineups-table-row" role="status">
                    <span>
                      {siteFilteredLegs.length === 0
                        ? 'No legs match the current site filter.'
                        : sportFilteredLegs.length === 0
                          ? 'No legs match the current sport filter (with the current site filter).'
                          : 'No legs match the current search (player, leg label, stat, sport).'}
                    </span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                  </div>
                ) : (
                  displayLegs.map((row: OptimizerLegRow) => (
                    <div className="lineups-table-row" key={row.id}>
                      <span title={row.legLabel}>{row.legLabel}</span>
                      <span>{row.site ? siteLabel(row.site) : '—'}</span>
                      <span>{row.sport || '—'}</span>
                      <span>{row.player || '—'}</span>
                      <span>{row.stat || '—'}</span>
                      <span>{row.line || '—'}</span>
                      <span>{row.book || '—'}</span>
                      <span>{fmtEdge01(row.edge)}</span>
                      <span>{fmtEdge01(row.legEv)}</span>
                      <span>{fmtProb01(row.trueProb)}</span>
                      <span>{row.gameTime ?? '—'}</span>
                    </div>
                  ))
                )}
              </div>
              </>
            ) : (
              <>
                <div
                  id="slipstrength-board-root"
                  className="lineups-table-shell lineups-table-shell--board"
                  aria-label="Games inferred from exported leg rows"
                >
                  <div className="lineups-table-header">
                    <span>Start (local)</span>
                    <span>Sport</span>
                    <span>Teams (from props)</span>
                    <span>Leg rows</span>
                    <span>PP</span>
                    <span>UD</span>
                    <span>Window</span>
                  </div>
                  {loading ? (
                    <div className="lineups-table-row" role="status">
                      <span>Loading leg data…</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                    </div>
                  ) : legs.length === 0 && !legsError ? (
                    <div className="lineups-table-row" role="status">
                      <span>No leg rows in data yet — board needs leg CSVs.</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                    </div>
                  ) : legs.length === 0 && legsError ? (
                    <div className="lineups-table-row" role="status">
                      <span>Could not load leg CSVs — board unavailable.</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                    </div>
                  ) : boardGames.rows.length === 0 ? (
                    <div className="lineups-table-row" role="status">
                      <span>No board rows: no loaded leg includes a parseable game time.</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                    </div>
                  ) : (
                    boardGames.rows.map((g) => {
                      const started = g.startMs <= Date.now()
                      return (
                        <div className="lineups-table-row" key={g.key}>
                          <span>{formatBoardStartLocal(g.startMs)}</span>
                          <span>{g.sport || '—'}</span>
                          <span>{g.teams.length ? g.teams.join(' · ') : '—'}</span>
                          <span>{g.legCount}</span>
                          <span>{g.ppLegs}</span>
                          <span>{g.udLegs}</span>
                          <span>{started ? 'Started' : 'Upcoming'}</span>
                        </div>
                      )
                    })
                  )}
                </div>
                {!loading && legs.length > 0 && boardGames.skippedLegsWithoutGameTime > 0 ? (
                  <p className="hint" role="status" style={{ marginTop: 'var(--space-3)' }}>
                    {boardGames.skippedLegsWithoutGameTime} leg row(s) omitted — missing or unparseable{' '}
                    <code>gameTime</code> in export.
                  </p>
                ) : null}
                {!loading && legs.length > 0 && boardGames.rows.length > 0 && legsError ? (
                  <p className="hint" role="status" style={{ marginTop: 'var(--space-3)' }}>
                    Partial leg load: {legsError}
                  </p>
                ) : null}
              </>
            )}
            <LiveDataAdapterPlaceholder />
          </section>
        </div>
      </div>
    </section>
  )
}
