import { useMemo, useState } from 'react'
import type { Card } from '../types'
import { useSlipStrengthOptimizerData } from './SlipStrengthOptimizerDataContext'
import {
  bestLegPreview,
  parlayStrengthCell,
  siteLabel,
  slipSummary,
} from './optimizerDisplayUtils'

function breakevenGapOnly(c: Card): string {
  const bg = (c as Card & { breakevenGap?: number }).breakevenGap
  if (typeof bg === 'number' && Number.isFinite(bg)) {
    return `${(bg * 100).toFixed(2)} pts vs break-even (from CSV)`
  }
  return '—'
}

function cardEvPct(c: Card): string {
  if (c.cardEv == null || !Number.isFinite(c.cardEv)) return '—'
  return `${(c.cardEv * 100).toFixed(2)}%`
}

function winProbCashPct(c: Card): string {
  const w = c.winProbCash
  if (typeof w !== 'number' || !Number.isFinite(w)) return '—'
  return `${(w * 100).toFixed(2)}% (cash hit, from CSV)`
}

function avgEdgeLine(c: Card): string {
  if (c.avgEdgePct == null || !Number.isFinite(c.avgEdgePct)) return '—'
  return `${c.avgEdgePct.toFixed(2)}% avg edge across legs (from CSV)`
}

export default function SlipStrengthWhySection() {
  const { cards, loading, loadError } = useSlipStrengthOptimizerData()
  const [selected, setSelected] = useState(0)

  const safeIndex = useMemo(() => {
    if (cards.length === 0) return 0
    return Math.min(Math.max(0, selected), cards.length - 1)
  }, [cards.length, selected])

  const focus = cards[safeIndex] ?? null
  const listSlice = cards.slice(0, 5)

  return (
    <section id="why-these-picks" className="section">
      <div className="container">
        <header className="section-header">
          <h2>Why these picks</h2>
          <p>
            The fields below come from the same exported optimizer cards as the table above (CSV columns such as tier,
            EV, win probability, and breakeven gap). We do not show projection or hit-rate history here unless those
            columns are present in your export.
          </p>
        </header>

        <div className="why-shell">
          <div className="optimizer-panel" aria-label="Top exported cards">
            <h3>Top of exported list</h3>
            {loading ? (
              <p className="hint">Loading cards…</p>
            ) : listSlice.length === 0 ? (
              <p className="hint">No cards in /data yet — run the optimizer and publish the snapshot.</p>
            ) : (
              <div className="hero-leg-list">
                {listSlice.map((c, i) => (
                  <button
                    key={`${slipSummary(c)}-${i}`}
                    type="button"
                    className="hero-leg-item"
                    onClick={() => setSelected(i)}
                    style={{
                      cursor: 'pointer',
                      border: 'none',
                      background:
                        i === safeIndex
                          ? 'color-mix(in oklab, var(--color-accent) 12%, transparent)'
                          : 'transparent',
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    <span>
                      <strong>{slipSummary(c)}</strong>
                    </span>
                    <span className="hero-leg-meta">
                      {c.bestBetTier ? (
                        <span className="hero-leg-badge">{c.bestBetTier.replace(/_/g, ' ')}</span>
                      ) : (
                        <span className="hero-leg-badge">—</span>
                      )}
                      <span>EV {cardEvPct(c)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {loadError ? (
              <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
                Partial load: {loadError}
              </p>
            ) : null}
            <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
              Select a row to inspect fields from that card&apos;s CSV row. Order matches the merged list in the
              optimizer table.
            </p>
          </div>

          <aside className="why-panel" aria-label="Card fields from export">
            <h3>Exported fields for selected card</h3>
            {loading ? (
              <p className="hint">Loading…</p>
            ) : !focus ? (
              <p className="hint">Nothing to show until cards are available.</p>
            ) : (
              <>
                <div className="why-leg-header">
                  <strong>{bestLegPreview(focus)}</strong>
                  <span>
                    {siteLabel(focus.site)} · {focus.sport ?? '—'}
                  </span>
                </div>

                <div className="why-metric-grid">
                  <div className="why-metric">
                    <div className="why-metric-label">Structure</div>
                    <div className="why-metric-value">{slipSummary(focus)}</div>
                    <p className="hint">Sport, leg count, site, flex type from export.</p>
                  </div>
                  <div className="why-metric">
                    <div className="why-metric-label">Tier</div>
                    <div className="why-metric-value">
                      {focus.bestBetTier ? focus.bestBetTier.replace(/_/g, ' ') : '—'}
                    </div>
                    <p className="hint">bestBetTier when present in CSV.</p>
                  </div>
                  <div className="why-metric">
                    <div className="why-metric-label">Card EV</div>
                    <div className="why-metric-value">{cardEvPct(focus)}</div>
                    <p className="hint">cardEv from export (expected value of the parlay).</p>
                  </div>
                  <div className="why-metric">
                    <div className="why-metric-label">Win probability (cash)</div>
                    <div className="why-metric-value">{winProbCashPct(focus)}</div>
                    <p className="hint">winProbCash when present.</p>
                  </div>
                  <div className="why-metric">
                    <div className="why-metric-label">Breakeven gap</div>
                    <div className="why-metric-value">{breakevenGapOnly(focus)}</div>
                    <p className="hint">breakevenGap when present in CSV.</p>
                  </div>
                  <div className="why-metric">
                    <div className="why-metric-label">Avg edge %</div>
                    <div className="why-metric-value">{avgEdgeLine(focus)}</div>
                    <p className="hint">avgEdgePct across legs when exported.</p>
                  </div>
                  <div className="why-metric">
                    <div className="why-metric-label">Combined strength line</div>
                    <div className="why-metric-value">{parlayStrengthCell(focus)}</div>
                    <p className="hint">Same derived line as the optimizer table.</p>
                  </div>
                </div>

                <div className="why-callout">
                  <strong>Summary</strong>
                  <p>
                    This panel only reflects columns shipped in <code>prizepicks-cards.csv</code> /{' '}
                    <code>underdog-cards.csv</code>. It does not invent model projections, rolling hit rates, or book
                    consensus unless you add those fields to the export.
                  </p>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </section>
  )
}
