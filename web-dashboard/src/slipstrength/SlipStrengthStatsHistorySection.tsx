import { useMemo } from 'react'
import { useSlipStrengthOptimizerData } from './SlipStrengthOptimizerDataContext'
import {
  STALE_RUN_MS,
  parlayStrengthCell,
  runFreshnessLine,
  slipSummary,
} from './optimizerDisplayUtils'

function tierCounts(cards: { bestBetTier?: string }[]): { tier: string; count: number }[] {
  const m: Record<string, number> = {}
  for (const c of cards) {
    const t = (c.bestBetTier && c.bestBetTier.trim()) || 'unset'
    m[t] = (m[t] || 0) + 1
  }
  return Object.entries(m)
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count)
}

export default function SlipStrengthStatsHistorySection() {
  const { cards, loading, loadError, manifest, manifestError, ppCount, udCount, staleRun } =
    useSlipStrengthOptimizerData()

  const tiers = useMemo(() => tierCounts(cards), [cards])
  const top = cards[0] ?? null
  const csvStats = manifest?.csv_stats

  return (
    <section id="stats-history" className="section">
      <div className="container">
        <header className="section-header">
          <h2>Snapshot status</h2>
          <p>
            This section summarizes the <strong>current published export</strong> only. It does not show historical win
            / loss, ROI, or long-term hit rates — those require a separate results source not wired here yet.
          </p>
        </header>

        <div className="history-grid">
          <div className="history-card" aria-label="Run and manifest">
            <h3>Last run &amp; load health</h3>
            {loading ? (
              <p className="history-note">Loading…</p>
            ) : (
              <>
                <div className="history-metrics">
                  <div>
                    <div className="history-metric-label">Optimizer run (manifest)</div>
                    <div className="history-metric-value" style={{ fontSize: 'var(--text-sm)', lineHeight: 1.45 }}>
                      {runFreshnessLine(manifest, manifestError, loading)}
                    </div>
                  </div>
                  {manifest?.bankroll != null ? (
                    <div>
                      <div className="history-metric-label">Bankroll (manifest)</div>
                      <div className="history-metric-value">${Number(manifest.bankroll).toLocaleString()}</div>
                    </div>
                  ) : null}
                  <div>
                    <div className="history-metric-label">Cards in table (merged)</div>
                    <div className="history-metric-value">
                      PP {ppCount} · UD {udCount} · total {cards.length}
                    </div>
                  </div>
                  <div>
                    <div className="history-metric-label">Underdog cards</div>
                    <div className="history-metric-value">
                      {udCount === 0
                        ? 'None after filter (0 UD rows or all below EV gate)'
                        : `${udCount} in merged list`}
                    </div>
                  </div>
                </div>
                {staleRun ? (
                  <p className="history-note">
                    Warning: last manifest run is older than {STALE_RUN_MS / 3600000} hours — treat as potentially stale.
                  </p>
                ) : null}
                {loadError ? <p className="history-note">Partial CSV load: {loadError}</p> : null}
                {manifestError ? <p className="history-note">Manifest fetch: {manifestError}</p> : null}
              </>
            )}
          </div>

          <div className="history-card" aria-label="Manifest CSV row counts and tier mix">
            <h3>Export file rows &amp; tier mix</h3>
            <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
              Row counts below come from <code>last_fresh_run.json</code> → <code>csv_stats</code> (recorded when the
              run finished). Merged table totals can differ due to dedupe and UD filtering.
            </p>
            {csvStats && Object.keys(csvStats).length > 0 ? (
              <div className="history-table-shell" style={{ marginBottom: 'var(--space-4)' }}>
                <div className="history-table-header">
                  <span>File</span>
                  <span>Rows (manifest)</span>
                  <span>Modified</span>
                </div>
                {(['prizepicks-cards.csv', 'underdog-cards.csv', 'prizepicks-legs.csv', 'underdog-legs.csv'] as const).map(
                  (name) => {
                    const s = csvStats[name]
                    if (!s) return null
                    return (
                      <div className="history-table-row" key={name}>
                        <span>
                          <code>{name}</code>
                        </span>
                        <span>{s.rows}</span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          {s.modified ?? '—'}
                        </span>
                      </div>
                    )
                  }
                )}
              </div>
            ) : (
              <p className="history-note" style={{ marginBottom: 'var(--space-4)' }}>
                No <code>csv_stats</code> in manifest (or manifest missing).
              </p>
            )}

            <h4 style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>bestBetTier in current list</h4>
            {loading ? (
              <p className="hint">…</p>
            ) : tiers.length === 0 ? (
              <p className="hint">No cards loaded.</p>
            ) : (
              <div className="history-table-shell">
                <div className="history-table-header">
                  <span>Tier</span>
                  <span>Count</span>
                </div>
                {tiers.map(({ tier, count }) => (
                  <div className="history-table-row" key={tier}>
                    <span>{tier.replace(/_/g, ' ')}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            )}

            {top ? (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <h4 style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>First merged card (list order)</h4>
                <p className="hint" style={{ margin: 0 }}>
                  <strong>{slipSummary(top)}</strong>
                  <br />
                  {parlayStrengthCell(top)}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
