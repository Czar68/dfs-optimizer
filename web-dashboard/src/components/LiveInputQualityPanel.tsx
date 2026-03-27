import {
  severityBadgeClass,
  type LatestMergeQualityDashboard,
  type MergePlatformQualityByPassDashboard,
  type MergeQualityStatusDashboard,
} from '@repo/live-input-quality-dashboard'
import type { RunStatusArtifact } from '../lib/dashboardArtifacts'

interface Props {
  fetchDone: boolean
  status: MergeQualityStatusDashboard | null
  statusError: string | null
  byPass: MergePlatformQualityByPassDashboard | null
  byPassError: string | null
  fullQuality: LatestMergeQualityDashboard | null
  runStatus: RunStatusArtifact | null
}

function fmtRate(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—'
  return `${(x * 100).toFixed(1)}%`
}

function fmtNum(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—'
  return String(x)
}

function severityUi(s: string): { label: string; cls: string } {
  const b = severityBadgeClass(s)
  if (b === 'ok') return { label: s, cls: 'text-emerald-300 border-emerald-800/60 bg-emerald-950/40' }
  if (b === 'warn') return { label: s, cls: 'text-amber-300 border-amber-800/50 bg-amber-950/35' }
  if (b === 'fail') return { label: s, cls: 'text-rose-300 border-rose-800/50 bg-rose-950/35' }
  return { label: s, cls: 'text-gray-400 border-gray-700 bg-black/30' }
}

function PassBlock({
  title,
  snap,
}: {
  title: string
  snap: NonNullable<MergePlatformQualityByPassDashboard['prizepicks']>
}) {
  return (
    <div className="p-2 bg-black/35 rounded border border-gray-800/80 space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-teal-500/90">{title}</div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-gray-500">match_rate</dt>
        <dd className="text-gray-100 text-right font-mono">{fmtRate(snap.match_rate)}</dd>
        <dt className="text-gray-500">unmatched_legs</dt>
        <dd className="text-gray-100 text-right font-mono">{fmtNum(snap.unmatched_legs_count)}</dd>
        <dt className="text-gray-500">alias_rate</dt>
        <dd className="text-gray-100 text-right font-mono">{fmtRate(snap.alias_resolution_rate)}</dd>
        <dt className="text-gray-500">drop no_market</dt>
        <dd className="text-gray-100 text-right font-mono">{fmtNum(snap.dropped_due_to_missing_market)}</dd>
        <dt className="text-gray-500">drop line_diff</dt>
        <dd className="text-gray-100 text-right font-mono">{fmtNum(snap.dropped_due_to_line_diff)}</dd>
        <dt className="text-gray-500">odds age (m)</dt>
        <dd className="text-gray-100 text-right font-mono">{fmtNum(snap.oddsSnapshotAgeMinutes)}</dd>
      </dl>
    </div>
  )
}

export default function LiveInputQualityPanel({
  fetchDone,
  status,
  statusError,
  byPass,
  byPassError,
  fullQuality,
  runStatus,
}: Props) {
  const shell =
    'p-3 bg-gray-900 border border-teal-900/45 rounded-lg text-xs space-y-2 min-w-0'

  const fromRun = runStatus?.liveMergeInput

  const degraded =
    status?.liveInputDegraded ??
    (fromRun?.liveInputDegraded != null ? fromRun.liveInputDegraded : null)

  const summaryLine = status?.liveMergeQualityLine ?? fromRun?.liveMergeQualityLine ?? null

  const ppConsensusLine =
    status?.ppConsensusOperatorLine?.trim() ||
    fullQuality?.ppConsensusOperatorLine?.trim() ||
    null

  const ppDispersion = fullQuality?.ppConsensusDispersion ?? null

  const hasAny =
    status != null ||
    byPass != null ||
    fullQuality != null ||
    fromRun != null ||
    statusError != null ||
    byPassError != null

  if (!fetchDone) {
    return (
      <section className={shell} data-testid="live-input-quality-panel">
        <div className="text-teal-300 font-semibold text-[13px]">Live input quality</div>
        <div className="text-gray-500">Loading…</div>
      </section>
    )
  }

  if (!hasAny && !statusError && !byPassError) {
    return (
      <section className={shell} data-testid="live-input-quality-panel">
        <div className="text-teal-300 font-semibold text-[13px]">Live input quality</div>
        <div className="text-amber-200/90 border border-amber-900/40 rounded px-2 py-1.5 bg-amber-950/25 leading-snug">
          No merge-quality artifacts are synced. Run `npm run sync:dashboard-reports` after a pipeline run
          (optional: merge_quality_status.json, merge_platform_quality_by_pass.json, latest_merge_quality.json).
        </div>
      </section>
    )
  }

  const sev = status?.overallSeverity ?? fromRun?.qualitySeverity ?? '—'
  const badge = severityUi(String(sev))

  return (
    <section className={shell} data-testid="live-input-quality-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-teal-300 font-semibold text-[13px]">Live input quality</div>
        <div className="text-[10px] text-gray-500">Phase 115–116 · P–Q · read-only</div>
      </div>

      {(statusError || byPassError) && (
        <div className="text-[10px] text-amber-200/90 space-y-1">
          {statusError && <div data-testid="liq-status-err">{statusError}</div>}
          {byPassError && <div data-testid="liq-bypass-err">{byPassError}</div>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${badge.cls}`}
          data-testid="liq-severity"
        >
          {badge.label}
        </span>
        {degraded != null && (
          <span
            className={`text-[11px] font-medium ${degraded ? 'text-rose-300' : 'text-emerald-400/90'}`}
            data-testid="liq-degraded"
          >
            {degraded ? 'Degraded input detected - review merge artifacts before trusting card output' : 'Input quality OK'}
          </span>
        )}
      </div>

      {summaryLine && (
        <div
          className="text-[11px] text-gray-200 font-mono leading-snug break-all border border-gray-800 rounded px-2 py-1 bg-black/40"
          data-testid="liq-summary-line"
        >
          {summaryLine}
        </div>
      )}

      {(ppConsensusLine || ppDispersion) && (
        <div
          className="space-y-1.5 border border-cyan-950/60 rounded px-2 py-1.5 bg-cyan-950/15"
          data-testid="liq-pp-consensus"
        >
          <div className="text-[10px] uppercase tracking-wide text-cyan-500/90">
            PP consensus dispersion
          </div>
          <p className="text-[10px] text-gray-500 leading-snug">
            Low de-vig spread over · many books on merged rows → tight cross-book clustering (flat slate).
          </p>
          {ppConsensusLine && (
            <div className="text-[11px] text-gray-200 font-mono leading-snug break-all bg-black/35 rounded px-1.5 py-1 border border-gray-800/80">
              {ppConsensusLine}
            </div>
          )}
          {ppDispersion && (
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-1 text-[11px]">
              <div>
                <dt className="text-gray-500">PP merged (n)</dt>
                <dd className="text-gray-100 font-mono text-right sm:text-left">{fmtNum(ppDispersion.nPpMerged)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Mean books</dt>
                <dd className="text-gray-100 font-mono text-right sm:text-left">
                  {ppDispersion.meanConsensusBookCount.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Mean spread (over)</dt>
                <dd className="text-gray-100 font-mono text-right sm:text-left">
                  {ppDispersion.meanDevigSpreadOver.toFixed(4)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">p95 spread</dt>
                <dd className="text-gray-100 font-mono text-right sm:text-left">
                  {ppDispersion.p95DevigSpreadOver != null
                    ? ppDispersion.p95DevigSpreadOver.toFixed(4)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Multi-book share</dt>
                <dd className="text-gray-100 font-mono text-right sm:text-left">
                  {(ppDispersion.shareMultiBookConsensus * 100).toFixed(1)}%
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {status?.keyMetrics && (
        <dl className="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <dt className="text-gray-500">mergeCoverage</dt>
            <dd className="text-gray-100 font-mono">{fmtRate(status.keyMetrics.mergeCoverage)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">fallbackRate</dt>
            <dd className="text-gray-100 font-mono">{fmtRate(status.keyMetrics.fallbackRate)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">dropRate</dt>
            <dd className="text-gray-100 font-mono">{fmtRate(status.keyMetrics.dropRate)}</dd>
          </div>
        </dl>
      )}

      {status?.driftNote && (
        <div className="text-[10px] text-gray-400" data-testid="liq-drift">
          Drift: {status.driftNote}
        </div>
      )}

      {(byPass?.prizepicks || byPass?.underdog) && (
        <div className="space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Per-pass (both mode)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {byPass.prizepicks && <PassBlock title="PrizePicks" snap={byPass.prizepicks} />}
            {byPass.underdog && <PassBlock title="Underdog" snap={byPass.underdog} />}
          </div>
          {byPass.note && <p className="text-[10px] text-gray-500 leading-snug">{byPass.note}</p>}
        </div>
      )}

      {fullQuality?.liveMergeQuality && !byPass?.prizepicks && !byPass?.underdog && (
        <div className="text-[10px] text-gray-400 space-y-0.5" data-testid="liq-lmq-fallback">
          <div>
            PP rate: {fmtRate(fullQuality.liveMergeQuality.match_rate_pp)} · UD rate:{' '}
            {fmtRate(fullQuality.liveMergeQuality.match_rate_ud)}
          </div>
          <div>
            Unmatched legs: {fmtNum(fullQuality.liveMergeQuality.unmatched_legs_count)} · Alias rate:{' '}
            {fmtRate(fullQuality.liveMergeQuality.alias_resolution_rate)}
          </div>
        </div>
      )}

      {fullQuality?.freshness?.stalenessNote && (
        <div
          className="text-[10px] text-gray-400 leading-snug border-t border-gray-800 pt-2"
          data-testid="liq-staleness"
        >
          {fullQuality.freshness.stalenessNote}
        </div>
      )}

      {fullQuality?.identityNote && (
        <div className="text-[10px] text-gray-500 leading-snug" data-testid="liq-identity">
          {fullQuality.identityNote}
        </div>
      )}

      <p className="text-[10px] text-gray-600 border-t border-gray-800 pt-2">
        Sources: merge_quality_status.json, merge_platform_quality_by_pass.json, optional latest_merge_quality.json,
        latest_run_status.json (liveMergeInput).
      </p>
    </section>
  )
}
