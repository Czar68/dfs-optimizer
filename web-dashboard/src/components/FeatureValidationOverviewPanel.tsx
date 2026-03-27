import type { FeatureValidationOverviewDashboard } from '@repo/feature-validation-overview-dashboard'
import type { ValidationReportingFreshnessDashboard } from '@repo/validation-reporting-freshness-dashboard'

interface Props {
  fetchDone: boolean
  artifact: FeatureValidationOverviewDashboard | null
  /** Missing file, fetch failure, or parse failure — no mock fallback. */
  error: string | null
  freshness: ValidationReportingFreshnessDashboard | null
  freshnessError: string | null
}

function ratio(a: number, b: number): string {
  if (b <= 0) return '—'
  return `${a}/${b}`
}

function freshnessBadgeClass(c: ValidationReportingFreshnessDashboard['classification']): string {
  if (c === 'fresh') return 'text-emerald-400 border-emerald-800/60 bg-emerald-950/40'
  if (c === 'stale') return 'text-amber-300 border-amber-800/50 bg-amber-950/35'
  return 'text-gray-400 border-gray-700 bg-black/30'
}

export default function FeatureValidationOverviewPanel({
  fetchDone,
  artifact,
  error,
  freshness,
  freshnessError,
}: Props) {
  const shell =
    'p-3 bg-gray-900 border border-violet-900/40 rounded-lg text-xs space-y-2 min-w-0'

  const freshnessStrip = () => {
    if (freshnessError) {
      return (
        <div
          className="text-[10px] text-amber-200/90 border border-amber-900/40 rounded px-2 py-1 bg-amber-950/25"
          data-testid="fv-freshness-error"
        >
          Dashboard freshness: {freshnessError}
        </div>
      )
    }
    if (!freshness) {
      return (
        <div className="text-[10px] text-gray-500" data-testid="fv-freshness-unknown">
          Dashboard freshness: unknown (no freshness artifact — run `npm run refresh:validation-reporting` then sync).
        </div>
      )
    }
    return (
      <div className="flex flex-wrap items-center gap-2 text-[10px]" data-testid="fv-freshness-strip">
        <span
          className={`font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${freshnessBadgeClass(freshness.classification)}`}
          data-testid="fv-freshness-status"
        >
          {freshness.classification}
        </span>
        <span className="text-gray-400">
          last refresh {freshness.lastValidationReportingRefreshUtc} · {freshness.reason}
        </span>
      </div>
    )
  }

  if (!fetchDone) {
    return (
      <section className={shell} data-testid="feature-validation-overview-panel">
        <div className="text-violet-300 font-semibold text-[13px]">Feature validation overview</div>
        <div className="text-gray-500">Loading…</div>
      </section>
    )
  }

  if (error || !artifact) {
    return (
      <section className={shell} data-testid="feature-validation-overview-panel">
        <div className="text-violet-300 font-semibold text-[13px]">Feature validation overview</div>
        {freshnessStrip()}
        <div className="text-amber-300/95 border border-amber-900/50 rounded px-2 py-1.5 bg-amber-950/30 leading-snug">
          {error ??
            'Overview artifact unavailable — run `npm run export:feature-validation-overview` then `npm run sync:dashboard-reports`.'}
        </div>
      </section>
    )
  }

  const g = artifact.replayReadiness.gradedRows
  const c = artifact.replayReadiness.counts
  const sa = artifact.snapshotAdoption
  const blocked =
    artifact.newRowEnforcement == null ? 'na' : String(artifact.newRowEnforcement.blockedMissingLegsSnapshotId)
  const override =
    artifact.newRowEnforcement == null
      ? 'na'
      : String(artifact.newRowEnforcement.appendedWithoutLegsSnapshotIdOverride)

  return (
    <section className={shell} data-testid="feature-validation-overview-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-violet-300 font-semibold text-[13px]">Feature validation overview</div>
        <div className="text-[10px] text-gray-500">Phase 108 · read-only</div>
      </div>
      <div className="mb-1">{freshnessStrip()}</div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
        <div>
          <dt className="text-gray-500">Effective policy</dt>
          <dd className="text-gray-100 font-mono" data-testid="fv-overview-policy">
            {artifact.effectivePolicy}
          </dd>
        </div>
        {artifact.lastExportPolicy != null && (
          <div>
            <dt className="text-gray-500">Last export policy (artifact)</dt>
            <dd className="text-gray-200 font-mono">{artifact.lastExportPolicy}</dd>
          </div>
        )}
        <div>
          <dt className="text-gray-500">Graded rows (deduped)</dt>
          <dd className="text-gray-100" data-testid="fv-overview-graded">
            {g}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Replay-ready (snapshot-bound)</dt>
          <dd className="text-gray-100">{ratio(c.replayReadySnapshotBound, g)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Strict-eligible</dt>
          <dd className="text-gray-100">{ratio(c.strictValidationEligible, g)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Legacy rows (no snapshot id)</dt>
          <dd className="text-gray-100">{c.legacyWithoutSnapshotId}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Missing snapshot dir</dt>
          <dd className="text-gray-100">{c.snapshotBoundMissingSnapshotDir}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Snapshot-bound (all rows)</dt>
          <dd className="text-gray-100">
            {sa.rowsWithLegsSnapshotId}/{sa.totalRows}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Snapshot-bound (graded)</dt>
          <dd className="text-gray-100">
            {sa.gradedWithLegsSnapshotId}/{sa.gradedTotal}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Blocked new rows (no snapshot id)</dt>
          <dd className="text-gray-100" data-testid="fv-overview-blocked">
            {blocked}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Override appends</dt>
          <dd className="text-gray-100" data-testid="fv-overview-override">
            {override}
          </dd>
        </div>
      </dl>

      <div className="border-t border-gray-800 pt-2 mt-1">
        <div className="text-[10px] text-gray-500 mb-0.5">Summary</div>
        <code className="text-[10px] text-gray-300 break-all leading-snug block" data-testid="fv-overview-summary">
          {artifact.summaryLine}
        </code>
      </div>

      <p className="text-[10px] text-gray-600 border-t border-gray-800 pt-2">
        Source: latest_feature_validation_overview.json (synced under public/data/reports/).
      </p>
    </section>
  )
}
