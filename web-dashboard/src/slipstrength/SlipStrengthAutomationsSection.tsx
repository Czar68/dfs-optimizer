export default function SlipStrengthAutomationsSection() {
  return (
    <section id="automations" className="section">
      <div className="container">
        <header className="section-header">
          <h2>Data publish &amp; integrations</h2>
          <p>
            This page reflects what the <strong>dfs-optimizer</strong> repo supports today. It does not perform
            one-click bet placement or guaranteed slip prefills for third-party apps.
          </p>
        </header>

        <div className="automation-grid">
          <div className="automation-card" aria-label="Live snapshot publishing">
            <h3>Live snapshot (what SlipStrength reads)</h3>
            <p>
              The default view loads optimizer exports from <code>./data/</code> in this deployment: card CSVs, leg CSVs,
              and <code>last_fresh_run.json</code>. Refreshing what users see means running your pipeline and uploading
              those files to the host (for example the repo&apos;s <code>publish:fresh-data-live</code> /
              <code>upload:data:ftp</code> flow) — not a button on this page.
            </p>
            <p className="automation-note">
              Freshness and counts in the sections above come from that same snapshot; there is no separate live API in
              this UI yet.
            </p>
          </div>

          <div className="automation-card" aria-label="Deep links in the optimizer table">
            <h3>Links in the optimizer table (current)</h3>
            <p>
              Each slip row can include outbound links derived from exported leg IDs: typically{' '}
              <strong>PrizePicks</strong> opens the projections/board URL (legs are not guaranteed to pre-fill from our
              internal IDs), and <strong>Underdog</strong> may include a <code>?legs=</code> query where supported. That
              behavior is shared with the legacy dashboard pattern — not a new automation layer in this section.
            </p>
            <p className="automation-note">
              <strong>Not in this app today:</strong> Betr / Pick6 entry builders, clipboard copy for a full slip from
              this shell, or site-specific URL schemes beyond what the table links provide.
            </p>
          </div>

          <div className="automation-card" aria-label="Planned vs not wired">
            <h3>Planned / not wired here</h3>
            <ul style={{ listStyle: 'disc', paddingLeft: '1.2rem', marginTop: 'var(--space-2)' }}>
              <li>
                <strong>Automations UI on this page:</strong> any future &quot;one-click&quot; or bulk actions would need
                explicit wiring; nothing in this block executes integrations.
              </li>
              <li>
                <strong>Server-side rules:</strong> optimizer math and exports stay in the pipeline; this dashboard is
                display-only for SlipStrength.
              </li>
              <li>
                <strong>Third-party tools:</strong> other products may offer direct-to-slip flows; this project does not
                claim parity with them in the SlipStrength shell.
              </li>
            </ul>
            <p className="automation-note">
              Use platform ToS and official APIs when adding real automation; this section is documentation only.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
