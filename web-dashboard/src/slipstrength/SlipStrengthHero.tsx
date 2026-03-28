import { useSlipStrengthOptimizerData } from './SlipStrengthOptimizerDataContext'
import {
  STALE_RUN_MS,
  bestLegPreview,
  formatWinRateVsBe,
  parlayStrengthCell,
  runFreshnessLine,
  slipSummary,
} from './optimizerDisplayUtils'

export default function SlipStrengthHero() {
  const { cards, loading, loadError, manifest, manifestError, ppCount, udCount, staleRun } =
    useSlipStrengthOptimizerData()

  const top = cards[0] ?? null
  const previewRows = cards.slice(0, 3)

  const pillText = loading
    ? 'Loading live snapshot…'
    : top
      ? `Top listed card · ${slipSummary(top)}`
      : 'No optimizer cards in /data yet'

  return (
    <section className="hero">
      <div className="container hero-grid">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Pick&apos;em parlays, quantified
          </div>
          <h1>
            Build stronger PrizePicks &amp; Underdog slips
            <span> with visible leg and parlay strength.</span>
          </h1>
          <p>
            SlipStrength is a front-end shell for your PrizePicks, Underdog, Betr and Pick6 engines. Rank legs by edge,
            see real W/L%, and send full slips directly to the board.
          </p>
          <div className="hero-cta">
            <a href="#optimizer" className="btn btn-primary">
              Open parlay optimizer
            </a>
            <a href="#automations" className="btn btn-ghost">
              Deep link &amp; autofill
            </a>
          </div>
          <div className="hero-meta">
            <div>
              <strong>Pick&apos;em native</strong>
              Built around fixed-multiplier slips, not sportsbook odds or DFS salaries.
            </div>
            <div>
              <strong>Edge-first</strong>
              Surfaces line value, hit rates and implied leg odds by default.
            </div>
          </div>
        </div>

        <aside className="hero-panel" aria-label="Live optimizer snapshot">
          <header className="hero-panel-header">
            <div>
              <div className="pill">
                <span className="pill-dot" />
                {pillText}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>Live snapshot</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Same CSVs as the table below.
              </div>
            </div>
          </header>

          <div className="hero-strength-row">
            <div className="strength-card">
              <div className="strength-label">Run &amp; freshness</div>
              <div className="strength-value" style={{ fontSize: 'var(--text-sm)', lineHeight: 1.4 }}>
                {runFreshnessLine(manifest, manifestError, loading)}
              </div>
              <div className="hero-record-row">
                <span>
                  {loading
                    ? '…'
                    : `Cards loaded: PrizePicks ${ppCount}, Underdog ${udCount} — ${cards.length} total (merged).`}
                </span>
                {loadError ? <span> Partial CSV load: {loadError}</span> : null}
                {staleRun ? (
                  <span>
                    {' '}
                    Warning: run older than {STALE_RUN_MS / 3600000}h — data may be stale.
                  </span>
                ) : null}
              </div>
            </div>
            <div className="strength-card">
              <div className="strength-label">Top card (list order)</div>
              <div className="hero-record-row">
                {loading ? (
                  <div>Loading…</div>
                ) : top ? (
                  <>
                    <div>
                      <strong>{slipSummary(top)}</strong>
                      <div>{parlayStrengthCell(top)}</div>
                    </div>
                    <div>
                      <strong>{formatWinRateVsBe(top)}</strong>
                      <div>From exported card CSV fields (not simulated).</div>
                    </div>
                  </>
                ) : (
                  <div>No cards to summarize. Publish data to /data or run the optimizer.</div>
                )}
              </div>
            </div>
          </div>

          <div className="hero-table-shell" aria-label="First rows from live card list">
            <div className="hero-table-header">
              <span>Leg (first prop)</span>
              <span>Parlay strength</span>
              <span>Win rate vs BE</span>
              <span>Tier / note</span>
            </div>
            {loading ? (
              <div className="hero-table-row">
                <span>Loading…</span>
                <span>—</span>
                <span>—</span>
                <span>—</span>
              </div>
            ) : previewRows.length === 0 ? (
              <div className="hero-table-row">
                <span>No rows</span>
                <span>—</span>
                <span>—</span>
                <span>—</span>
              </div>
            ) : (
              previewRows.map((c, i) => (
                <div className="hero-table-row" key={`hero-${slipSummary(c)}-${i}`}>
                  <span>{bestLegPreview(c)}</span>
                  <span>{parlayStrengthCell(c)}</span>
                  <span>{formatWinRateVsBe(c)}</span>
                  <span className="hero-leg-meta">
                    {c.bestBetTier ? (
                      <span className="hero-leg-badge">{c.bestBetTier.replace(/_/g, ' ')}</span>
                    ) : (
                      <span className="hero-leg-badge">—</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
