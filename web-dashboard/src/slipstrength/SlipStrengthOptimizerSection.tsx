import { useEffect, useMemo, useState } from 'react'
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
import { buildBoardGamesFromLegs, getLegIds, type OptimizerLegRow } from '../lib/optimizerCsvCards'

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

export default function SlipStrengthOptimizerSection() {
  const [optimizerView, setOptimizerView] = useState<'slips' | 'legs' | 'board'>('slips')
  const [slipsSiteFilter, setSlipsSiteFilter] = useState<LegsSiteFilter>('all')
  /** `'all'` or a leg count that appears on at least one loaded card. */
  const [slipsLegCountFilter, setSlipsLegCountFilter] = useState<number | 'all'>('all')
  const [slipsSort, setSlipsSort] = useState<SlipsSort>('export')
  const [legsSiteFilter, setLegsSiteFilter] = useState<LegsSiteFilter>('all')
  /** `'all'` = all sports; otherwise exact `row.sport.trim()` from loaded data. */
  const [legsSportFilter, setLegsSportFilter] = useState<string>('all')
  const [legsSort, setLegsSort] = useState<LegsSort>('export')
  const [legsSearch, setLegsSearch] = useState('')
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

  const slipsLegCountOptions = useMemo(() => {
    const seen = new Set<number>()
    for (const c of cards) {
      seen.add(getLegIds(c).length)
    }
    return Array.from(seen).sort((a, b) => a - b)
  }, [cards])

  useEffect(() => {
    if (slipsLegCountFilter === 'all') return
    if (!slipsLegCountOptions.includes(slipsLegCountFilter)) setSlipsLegCountFilter('all')
  }, [slipsLegCountOptions, slipsLegCountFilter])

  const sportOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const r of legs) {
      seen.add(normalizedSport(r))
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [legs])

  useEffect(() => {
    if (legsSportFilter === 'all') return
    if (!sportOptions.includes(legsSportFilter)) setLegsSportFilter('all')
  }, [sportOptions, legsSportFilter])

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

  const displaySlips = useMemo(
    () => sortSlipsRows(slipsFiltered, slipsSort),
    [slipsFiltered, slipsSort]
  )

  const slipsFiltersActive = slipsSiteFilter !== 'all' || slipsLegCountFilter !== 'all'

  const legsFiltersActive =
    legsSiteFilter !== 'all' || legsSportFilter !== 'all' || Boolean(searchQueryLower)

  const boardGames = useMemo(() => buildBoardGamesFromLegs(legs), [legs])

  return (
    <section id="optimizer" className="section">
      <div className="container">
        <header className="section-header">
          <h2>Pick&apos;em optimizer</h2>
          <p>
            The card table is live from published <code>./data/</code> exports. The left column is a static layout
            preview only — it does not run the engine or change what you see here.
          </p>
        </header>

        <div className="optimizer-shell" aria-label="Optimizer layout shell">
          <aside className="optimizer-panel" aria-label="Slip layout preview (inert)">
            <h3>Slip configuration</h3>
            <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
              <strong>Preview only — not wired.</strong> Controls below are disabled placeholders for a future
              interactive flow. Refresh the table by running the optimizer pipeline and publishing CSVs to this host.
            </p>

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
                      totals). Site and leg-count filters only narrow the loaded rows; sort reorders the filtered rows.
                      All use fields from the export — no new analytics.
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
                  aria-label="Slips view — filter and sort loaded card rows only"
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
                  {!loading && cards.length > 0 ? (
                    <p className="legs-view-toolbar-hint hint" role="status">
                      {!slipsFiltersActive && slipsSort === 'export' ? (
                        <>Showing all {cards.length} loaded card row(s).</>
                      ) : (
                        <>
                          Showing {displaySlips.length} of {cards.length} loaded card row(s)
                          {slipsFiltersActive ? (
                            <>
                              {' '}
                              after{' '}
                              {[
                                slipsSiteFilter !== 'all' ? 'site filter' : null,
                                slipsLegCountFilter !== 'all' ? 'leg-count filter' : null,
                              ]
                                .filter(Boolean)
                                .join(' and ') || 'filters'}
                            </>
                          ) : null}
                          {slipsSort !== 'export' ? (
                            <>
                              {slipsFiltersActive ? '; ' : ' — '}
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
                          : 'No cards match the current leg-count filter (with the current site filter).'}
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
