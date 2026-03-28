import { useEffect, useMemo, useState } from 'react'
import type {
  RunStatusArtifact,
  PreDiversificationDiagnosisArtifact,
  CardEvViabilityArtifact,
  HistoricalFeatureRegistryArtifact,
} from '../lib/dashboardArtifacts'
import { fetchDashboardJson } from '../lib/dashboardArtifacts'
import {
  parseFeatureValidationOverviewDashboardJson,
  type FeatureValidationOverviewDashboard,
} from '@repo/feature-validation-overview-dashboard'
import {
  parseValidationReportingFreshnessJson,
  type ValidationReportingFreshnessDashboard,
} from '@repo/validation-reporting-freshness-dashboard'
import {
  parseLatestMergeQualityJsonForDashboard,
  parseMergePlatformQualityByPassJson,
  parseMergeQualityStatusJson,
  type LatestMergeQualityDashboard,
  type MergePlatformQualityByPassDashboard,
  type MergeQualityStatusDashboard,
} from '@repo/live-input-quality-dashboard'
import FeatureValidationOverviewPanel from './FeatureValidationOverviewPanel'
import LiveInputQualityPanel from './LiveInputQualityPanel'
import {
  deriveOperatorDecision,
  type LegsWindowSnapshot,
} from '../lib/dashboardDecisionClarity'
import {
  parseOptimizerEdgeQualityDashboardJson,
  type OptimizerEdgeQualityDashboardSlice,
} from '../lib/optimizerEdgeQualityAudit'
import type { Card, LegsLookup } from '../types'
import OpportunitySurfacePanel, { type OpportunityTopCardRow } from './OpportunitySurfacePanel'
import EdgeConcentrationPanel from './EdgeConcentrationPanel'
import OperatorActionPanel from './OperatorActionPanel'
import { topNearMissStructures } from '../lib/opportunitySurface'

export type { LegsWindowSnapshot }
export type { OpportunityTopCardRow }

function fmtPct(x: number | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—'
  return `${(x * 100).toFixed(1)}%`
}

function shortStage(stage: string | undefined): string {
  if (!stage) return '—'
  return stage.replace(/^pp:/, 'PP: ').replace(/^ud:/, 'UD: ').replace(/_/g, ' ')
}

function uiRunHealthLabel(runHealth: string | undefined): string {
  if (!runHealth) return 'Unknown'
  if (runHealth === 'success') return 'Success'
  if (runHealth === 'degraded_success') return 'Degraded Success'
  if (runHealth === 'partial_completion') return 'Partial Completion'
  if (runHealth === 'hard_failure') return 'Hard Failure'
  return runHealth.replace(/_/g, ' ')
}

function runHealthChipClass(runHealth: string | undefined): string {
  if (runHealth === 'success') return 'bg-emerald-950/50 text-emerald-300 border-emerald-800/60'
  if (runHealth === 'degraded_success') return 'bg-amber-950/50 text-amber-300 border-amber-800/60'
  if (runHealth === 'partial_completion') return 'bg-orange-950/50 text-orange-300 border-orange-800/60'
  if (runHealth === 'hard_failure') return 'bg-rose-950/50 text-rose-300 border-rose-800/60'
  return 'bg-gray-900 text-gray-300 border-gray-700'
}

function humanizeCode(code: string): string {
  return code.replace(/_/g, ' ')
}

export type OptimizerStatePanelsVariant = 'overview' | 'diagnostics'

interface Props {
  dataBase: string
  legsWindow?: LegsWindowSnapshot | null
  /** Top cards from synced CSV (parent sorts by EV); used when verdict is PLAYABLE */
  opportunityTopCards?: OpportunityTopCardRow[]
  /** Same top-EV slice as opportunity surface — for edge concentration */
  concentrationCards?: Card[]
  legsForConcentration?: LegsLookup
  /** Split IA: high-signal landing vs full audit panels */
  variant: OptimizerStatePanelsVariant
  /** Manifest `fresh_run_completed_at` (humanized) — Overview strip */
  dataFreshnessLabel?: string | null
  /** Live CSV card counts from browser fetch — Overview strip */
  csvSnapshotCounts?: { pp: number; ud: number } | null
  /** Live dashboard data from useDashboardData hook */
  liveData?: {
    status: any
    pp: any
    ud: any
    merge: any
  } | null
}

export default function OptimizerStatePanels({
  dataBase,
  legsWindow,
  opportunityTopCards = [],
  concentrationCards = [],
  legsForConcentration = new Map(),
  variant,
  dataFreshnessLabel = null,
  csvSnapshotCounts = null,
  liveData = null,
}: Props) {
  const [runStatus, setRunStatus] = useState<RunStatusArtifact | null>(null)
  const [preDiv, setPreDiv] = useState<PreDiversificationDiagnosisArtifact | null>(null)
  const [cardEv, setCardEv] = useState<CardEvViabilityArtifact | null>(null)
  const [featReg, setFeatReg] = useState<HistoricalFeatureRegistryArtifact | null>(null)
  const [fvOverview, setFvOverview] = useState<FeatureValidationOverviewDashboard | null>(null)
  const [fvOverviewError, setFvOverviewError] = useState<string | null>(null)
  const [fvFreshness, setFvFreshness] = useState<ValidationReportingFreshnessDashboard | null>(null)
  const [fvFreshnessError, setFvFreshnessError] = useState<string | null>(null)
  const [liqStatus, setLiqStatus] = useState<MergeQualityStatusDashboard | null>(null)
  const [liqStatusError, setLiqStatusError] = useState<string | null>(null)
  const [liqByPass, setLiqByPass] = useState<MergePlatformQualityByPassDashboard | null>(null)
  const [liqByPassError, setLiqByPassError] = useState<string | null>(null)
  const [liqFull, setLiqFull] = useState<LatestMergeQualityDashboard | null>(null)
  const [edgeQualityAudit, setEdgeQualityAudit] = useState<OptimizerEdgeQualityDashboardSlice | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fetchDone, setFetchDone] = useState(false)

  useEffect(() => {
    const bust = `?t=${Date.now()}`
    const base = `${dataBase.replace(/\/+$/, '')}/reports`
    let cancelled = false
    ;(async () => {
      try {
        const [a, b, c, d, e, f, g, h, i, j] = await Promise.all([
          fetchDashboardJson<RunStatusArtifact>(`${base}/latest_run_status.json${bust}`),
          fetchDashboardJson<PreDiversificationDiagnosisArtifact>(
            `${base}/latest_pre_diversification_card_diagnosis.json${bust}`
          ),
          fetchDashboardJson<CardEvViabilityArtifact>(`${base}/latest_card_ev_viability.json${bust}`),
          fetchDashboardJson<HistoricalFeatureRegistryArtifact>(
            `${base}/latest_historical_feature_registry.json${bust}`
          ),
          fetchDashboardJson<unknown>(`${base}/latest_feature_validation_overview.json${bust}`),
          fetchDashboardJson<unknown>(`${base}/latest_validation_reporting_freshness.json${bust}`),
          fetchDashboardJson<unknown>(`${base}/merge_quality_status.json${bust}`),
          fetchDashboardJson<unknown>(`${base}/merge_platform_quality_by_pass.json${bust}`),
          fetchDashboardJson<unknown>(`${base}/latest_merge_quality.json${bust}`),
          fetchDashboardJson<unknown>(`${base}/latest_optimizer_edge_quality.json${bust}`),
        ])
        if (cancelled) return
        setRunStatus(a)
        setPreDiv(b)
        setCardEv(c)
        setFeatReg(d)
        if (e == null) {
          setFvOverview(null)
          setFvOverviewError(
            'latest_feature_validation_overview.json missing — run `npm run export:feature-validation-overview` then `npm run sync:dashboard-reports`.'
          )
        } else {
          const parsed = parseFeatureValidationOverviewDashboardJson(e)
          if (parsed == null) {
            setFvOverview(null)
            setFvOverviewError(
              'latest_feature_validation_overview.json invalid or incomplete — re-run `npm run export:feature-validation-overview` then sync.'
            )
          } else {
            setFvOverview(parsed)
            setFvOverviewError(null)
          }
        }
        if (f == null) {
          setFvFreshness(null)
          setFvFreshnessError(
            'latest_validation_reporting_freshness.json missing — run `npm run refresh:validation-reporting` then `npm run sync:dashboard-reports`.'
          )
        } else {
          const pf = parseValidationReportingFreshnessJson(f)
          if (pf == null) {
            setFvFreshness(null)
            setFvFreshnessError('latest_validation_reporting_freshness.json invalid — re-run refresh pipeline.')
          } else {
            setFvFreshness(pf)
            setFvFreshnessError(null)
          }
        }

        if (g == null) {
          setLiqStatus(null)
          setLiqStatusError(null)
        } else {
          const ps = parseMergeQualityStatusJson(g)
          if (ps == null) {
            setLiqStatus(null)
            setLiqStatusError('merge_quality_status.json present but unrecognized shape — re-export merge quality.')
          } else {
            setLiqStatus(ps)
            setLiqStatusError(null)
          }
        }
        if (h == null) {
          setLiqByPass(null)
          setLiqByPassError(null)
        } else {
          const pb = parseMergePlatformQualityByPassJson(h)
          if (pb == null) {
            setLiqByPass(null)
            setLiqByPassError('merge_platform_quality_by_pass.json present but invalid.')
          } else {
            setLiqByPass(pb)
            setLiqByPassError(null)
          }
        }
        if (i == null) {
          setLiqFull(null)
        } else {
          setLiqFull(parseLatestMergeQualityJsonForDashboard(i))
        }

        if (j == null) {
          setEdgeQualityAudit(null)
        } else {
          setEdgeQualityAudit(parseOptimizerEdgeQualityDashboardJson(j))
        }

        if (!a && !b && !c && !d) {
          setLoadError('No dashboard report JSON found. Run `npm run sync:dashboard-reports` after pipeline exports.')
        } else {
          setLoadError(null)
        }
      } finally {
        if (!cancelled) setFetchDone(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dataBase])

  const decision = useMemo(
    () => deriveOperatorDecision(runStatus, preDiv, cardEv, legsWindow ?? null),
    [runStatus, preDiv, cardEv, legsWindow]
  )

  const nearMissFlexTypes = useMemo(
    () => topNearMissStructures(cardEv, 5).map((r) => r.flexType),
    [cardEv]
  )

  const nearMissRowsCompact = useMemo(() => topNearMissStructures(cardEv, 5), [cardEv])

  const snapshotTopCardLine = useMemo(() => {
    if (decision.verdict !== 'PLAYABLE') return null
    const r = opportunityTopCards[0]
    if (!r) return null
    const sum =
      r.summaryLine.length > 200 ? `${r.summaryLine.slice(0, 199)}…` : r.summaryLine
    return `${r.site} · ${r.flexType} · EV ${(r.cardEv * 100).toFixed(2)}% — ${sum}`
  }, [decision.verdict, opportunityTopCards])

  const snapshotNearMissLine = useMemo(() => {
    if (decision.verdict !== 'NOT PLAYABLE') return null
    const r = topNearMissStructures(cardEv, 1)[0]
    if (!r) return null
    return `PP · ${r.flexType} · gap ${r.gapPct} (EV ${r.evPct} vs req ${r.thresholdPct})`
  }, [decision.verdict, cardEv])

  const coverageTop = useMemo(() => {
    const rows = featReg?.coverage ?? []
    return [...rows]
      .filter((r) => r.field)
      .sort((a, b) => (b.fraction ?? 0) - (a.fraction ?? 0))
      .slice(0, 6)
  }, [featReg])

  const cardShell =
    'p-3 bg-zinc-900/35 border border-zinc-800/50 rounded-lg text-xs space-y-2 min-w-0'
  const decisionShell =
    'p-4 rounded-lg border border-zinc-700/50 bg-zinc-900/35 text-xs shadow-sm shadow-black/20'
  const runHealthShell =
    'p-3 rounded-lg border border-zinc-700/40 bg-zinc-900/30 text-xs space-y-2'

  const slateShort = useMemo(() => {
    const w = legsWindow
    if (!w?.loaded) return 'Legs CSV: loading…'
    return `${w.totalLegRows} leg row(s) · ${w.ppNotStarted + w.udNotStarted} not-started (future game time)`
  }, [legsWindow])

  const decisionCard = (
    <section className={decisionShell} data-testid="optimizer-decision-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Card Export Verdict</div>
          {!fetchDone ? (
            <div className="text-lg text-zinc-400 mt-1">Loading…</div>
          ) : (
            <div
              data-testid="optimizer-verdict"
              className={`text-2xl font-semibold tracking-tight mt-0.5 ${
                decision.verdict === 'PLAYABLE' ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {decision.verdict}
            </div>
          )}
        </div>
        <div
          className="text-[11px] text-zinc-300 text-right max-w-[min(100%,28rem)] leading-snug"
          data-testid="optimizer-slate-status"
        >
          {decision.slate.line}
        </div>
      </div>

      {loadError && (
        <div className="mt-2 text-amber-200/90 text-xs border border-amber-900/30 rounded-md px-2 py-1.5 bg-amber-950/20">
          {loadError}
        </div>
      )}

      {fetchDone && !loadError && (
        <>
          <p
            className="mt-3 text-sm text-zinc-100 font-medium leading-snug border-t border-zinc-800/60 pt-3"
            data-testid="optimizer-primary-reason"
          >
            {decision.primaryReason}
          </p>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            {decision.viability.hasFullRow ? (
              <>
                <div className="p-2.5 bg-zinc-950/50 rounded-md">
                  <div className="text-zinc-500 text-[10px] uppercase">Best EV (sampled)</div>
                  <div className="text-zinc-100 text-base font-semibold" data-testid="optimizer-viability-best">
                    {decision.viability.bestEvPct}
                  </div>
                </div>
                <div className="p-2.5 bg-zinc-950/50 rounded-md">
                  <div className="text-zinc-500 text-[10px] uppercase">Required (threshold)</div>
                  <div className="text-zinc-100 text-base font-semibold" data-testid="optimizer-viability-req">
                    {decision.viability.requiredPct}
                  </div>
                </div>
                <div className="p-2.5 bg-zinc-950/50 rounded-md">
                  <div className="text-zinc-500 text-[10px] uppercase">Gap</div>
                  <div
                    className={`text-base font-semibold ${
                      (decision.viability.gapNumeric ?? 0) >= 0 ? 'text-emerald-300/90' : 'text-orange-300/90'
                    }`}
                    data-testid="optimizer-viability-gap"
                  >
                    {decision.viability.gapPct}
                  </div>
                </div>
              </>
            ) : (
              <div className="sm:col-span-3 text-[11px] text-amber-200/90 rounded-md p-2 bg-zinc-950/40">
                Viability gap row not available: need both global raw EV max and sport threshold in{' '}
                <code className="text-zinc-500">latest_card_ev_viability.json</code> (run export + sync).
              </div>
            )}
          </div>

          <p className="text-[10px] text-zinc-500 mt-2">{slateShort}</p>
        </>
      )}
    </section>
  )

  const runHealthSection = (
    <section className={runHealthShell} data-testid="run-health-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-zinc-200 font-medium text-[13px]">Latest run health summary</div>
        <div
          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide ${runHealthChipClass(runStatus?.runHealth)}`}
          data-testid="run-health-chip"
        >
          {uiRunHealthLabel(runStatus?.runHealth)}
        </div>
      </div>
      {!fetchDone ? (
        <div className="text-zinc-500">Loading latest run status…</div>
      ) : runStatus == null ? (
        <div className="text-amber-200/90 border border-amber-900/30 rounded-md px-2 py-1.5 bg-amber-950/20">
          latest_run_status.json is missing or not synced. Run `npm run sync:dashboard-reports`.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="p-2 bg-zinc-950/40 rounded-md">
              <div className="text-zinc-500 text-[10px] uppercase">Run timestamp</div>
              <div className="text-zinc-200">{runStatus.runTimestamp ?? '—'}</div>
            </div>
            <div className="p-2 bg-zinc-950/40 rounded-md">
              <div className="text-zinc-500 text-[10px] uppercase">Outcome</div>
              <div className="text-zinc-200">
                {runStatus.outcome ? humanizeCode(runStatus.outcome) : '—'}
              </div>
            </div>
          </div>

          {(runStatus.degradationReasons?.length ?? 0) > 0 && (
            <div className="rounded-md p-2 bg-amber-950/15 space-y-1">
              <div className="text-amber-200/90 text-[11px] font-medium">Degradation reasons</div>
              <ul className="list-disc pl-4 text-[11px] text-amber-100/85 space-y-0.5">
                {runStatus.degradationReasons?.slice(0, 6).map((reason) => (
                  <li key={reason}>{humanizeCode(reason)}</li>
                ))}
              </ul>
            </div>
          )}

          {(runStatus.missingExpectedArtifacts?.length ?? 0) > 0 && (
            <div className="rounded-md p-2 bg-rose-950/15 space-y-1">
              <div className="text-rose-200/90 text-[11px] font-medium">Missing expected artifacts</div>
              <ul className="list-disc pl-4 text-[11px] text-rose-100/85 space-y-0.5">
                {runStatus.missingExpectedArtifacts?.slice(0, 6).map((artifact) => (
                  <li key={artifact}>
                    <code className="text-rose-100/80">{artifact}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(runStatus.degradationReasons?.length ?? 0) === 0 &&
            (runStatus.missingExpectedArtifacts?.length ?? 0) === 0 && (
              <div className="text-[11px] text-emerald-300/85 rounded-md px-2 py-1.5 bg-emerald-950/15">
                No degradation or missing expected artifacts reported for this run.
              </div>
            )}
        </>
      )}
    </section>
  )

  const degradationInline =
    fetchDone && runStatus && (runStatus.degradationReasons?.length ?? 0) > 0
      ? runStatus.degradationReasons!.slice(0, 6).map(humanizeCode).join(' · ')
      : null

  const missingArtifactsInline =
    fetchDone && runStatus && (runStatus.missingExpectedArtifacts?.length ?? 0) > 0
      ? runStatus.missingExpectedArtifacts!.slice(0, 4).join(', ')
      : null

  return (
    <div className="space-y-4 mb-4" data-testid="optimizer-state-panels">
      {decisionCard}

      {variant === 'overview' && (
        <section
          className="rounded-lg border border-zinc-800/50 bg-zinc-900/25 px-3 py-2.5 text-[11px] text-zinc-300 space-y-2"
          data-testid="overview-status-strip"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <span className="text-zinc-500">Dashboard data refreshed</span>{' '}
              <span className="text-zinc-200">{dataFreshnessLabel ?? '—'}</span>
            </span>
            <span className="text-zinc-600 hidden sm:inline">|</span>
            <span>
              <span className="text-zinc-500">Canonical run</span>{' '}
              <span className="text-zinc-200">{runStatus?.runTimestamp ?? (fetchDone ? '—' : '…')}</span>
            </span>
            <span className="text-zinc-600 hidden sm:inline">|</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wide ${runHealthChipClass(runStatus?.runHealth)}`}
            >
              {fetchDone ? uiRunHealthLabel(runStatus?.runHealth) : '…'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-zinc-400">
            <span>
              PP cards (status){' '}
              <span className="text-zinc-200 tabular-nums">{runStatus?.prizepicks?.cardsCount ?? '—'}</span>
              {' · '}
              UD cards{' '}
              <span className="text-zinc-200 tabular-nums">{runStatus?.underdog?.cardsCount ?? '—'}</span>
            </span>
            {csvSnapshotCounts != null && (
              <span className="text-zinc-500">
                CSV snapshot: PP <span className="text-zinc-300 tabular-nums">{csvSnapshotCounts.pp}</span> · UD{' '}
                <span className="text-zinc-300 tabular-nums">{csvSnapshotCounts.ud}</span>
              </span>
            )}
          </div>
          {degradationInline && (
            <p className="text-amber-200/85 leading-snug">
              <span className="text-zinc-500">Degraded: </span>
              {degradationInline}
            </p>
          )}
          {missingArtifactsInline && (
            <p className="text-rose-200/80 leading-snug">
              <span className="text-zinc-500">Missing artifacts: </span>
              {missingArtifactsInline}
              {(runStatus?.missingExpectedArtifacts?.length ?? 0) > 4 ? '…' : ''}
            </p>
          )}
          {fetchDone && runStatus == null && (
            <p className="text-amber-200/90">Sync latest_run_status.json (npm run sync:dashboard-reports).</p>
          )}
        </section>
      )}

      {variant === 'diagnostics' && runHealthSection}

      {variant === 'overview' && (
        <>
          <OperatorActionPanel
            fetchDone={fetchDone}
            loadError={loadError}
            runStatusPresent={runStatus != null}
            decision={decision}
            topCardCount={concentrationCards.length}
            hasNearMissStructures={nearMissFlexTypes.length > 0}
            historicalRegistryPresent={featReg != null}
            runTimestamp={runStatus?.runTimestamp}
            snapshotTopCardLine={snapshotTopCardLine}
            snapshotNearMissLine={snapshotNearMissLine}
          />

          {fetchDone && decision.verdict === 'NOT PLAYABLE' && (
            <section
              className="rounded-lg border border-zinc-800/50 bg-zinc-900/20 px-3 py-2 text-[11px]"
              data-testid="overview-near-miss-compact"
            >
              <div className="text-zinc-400 font-medium mb-1.5">Closest to viable (PP structures)</div>
              {nearMissRowsCompact.length === 0 ? (
                <p className="text-zinc-500">No near-miss rows in synced viability export.</p>
              ) : (
                <ul className="space-y-1 text-zinc-300">
                  {nearMissRowsCompact.map((row) => (
                    <li key={row.flexType} className="flex flex-wrap justify-between gap-2">
                      <span>{row.flexType}</span>
                      <span className="text-zinc-500">
                        gap {row.gapPct} · EV {row.evPct} vs req {row.thresholdPct}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {variant === 'diagnostics' && (
        <>
          <LiveInputQualityPanel
            fetchDone={fetchDone}
            status={liqStatus}
            statusError={liqStatusError}
            byPass={liqByPass}
            byPassError={liqByPassError}
            fullQuality={liqFull}
            runStatus={runStatus}
          />

          {fetchDone &&
            (runStatus?.optimizerEdgeQuality != null || edgeQualityAudit != null) && (
              <section
                className="p-3 rounded-lg border border-zinc-700/40 bg-zinc-900/30 text-xs space-y-2"
                data-testid="optimizer-edge-quality-strip"
              >
                <div className="text-zinc-200 font-medium text-[13px]">Optimizer edge quality (Phase 117)</div>
                {runStatus?.optimizerEdgeQuality || edgeQualityAudit?.outputQuality ? (
                  <div className="text-zinc-200 space-y-1">
                    <div>
                      <span className="text-zinc-500">Status:</span>{' '}
                      <span className="font-medium">
                        {runStatus?.optimizerEdgeQuality?.status ?? edgeQualityAudit?.outputQuality?.status ?? '—'}
                      </span>
                      {' · '}
                      <span className="text-zinc-500">degraded</span>{' '}
                      {(() => {
                        const d =
                          runStatus?.optimizerEdgeQuality?.degradedOutput ??
                          edgeQualityAudit?.outputQuality?.degradedOutput
                        if (d === true) return 'yes'
                        if (d === false) return 'no'
                        return '—'
                      })()}
                    </div>
                    {(runStatus?.optimizerEdgeQuality?.summaryLine ?? edgeQualityAudit?.outputQuality?.summaryLine) && (
                      <div className="text-[11px] text-zinc-400 font-mono leading-snug break-words">
                        {runStatus?.optimizerEdgeQuality?.summaryLine ?? edgeQualityAudit?.outputQuality?.summaryLine}
                      </div>
                    )}
                    {runStatus?.optimizerEdgeQuality?.artifactRel && (
                      <div className="text-[10px] text-zinc-600">
                        File: <code className="text-zinc-500">{runStatus.optimizerEdgeQuality.artifactRel}</code>
                      </div>
                    )}
                  </div>
                ) : null}
                {edgeQualityAudit?.explainability?.lines != null && edgeQualityAudit.explainability.lines.length > 0 && (
                  <ul className="list-disc pl-4 text-zinc-300 text-[11px] space-y-0.5 border-t border-zinc-700/30 pt-2">
                    {edgeQualityAudit.explainability.lines.slice(0, 6).map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                )}
                {edgeQualityAudit?.explainability?.fragilityFlags != null &&
                  edgeQualityAudit.explainability.fragilityFlags.length > 0 && (
                    <div className="text-[10px] text-amber-200/80 border-t border-zinc-700/30 pt-2">
                      Flags: {edgeQualityAudit.explainability.fragilityFlags.join(', ')}
                    </div>
                  )}
              </section>
            )}

          <OpportunitySurfacePanel
            fetchDone={fetchDone}
            verdict={decision.verdict}
            playableTopCards={opportunityTopCards}
            viabilityArtifact={cardEv}
          />

          <EdgeConcentrationPanel
            verdict={decision.verdict}
            concentrationCards={concentrationCards}
            legs={legsForConcentration}
            nearMissFlexTypes={nearMissFlexTypes}
          />

          <FeatureValidationOverviewPanel
            fetchDone={fetchDone}
            artifact={fvOverview}
            error={fvOverviewError}
            freshness={fvFreshness}
            freshnessError={fvFreshnessError}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <section className={cardShell}>
              <div className="text-zinc-200 font-medium text-[13px]">Run counters</div>
              <div className="text-zinc-500 text-[11px]">
                Generated (UTC): {runStatus?.generatedAtUtc ?? '—'}
              </div>
              <div className="text-zinc-300">Run time: {runStatus?.runTimestamp ?? '—'}</div>
              <div className="text-zinc-500">
                Outcome:{' '}
                <span className="text-zinc-200">{runStatus?.outcome ?? '—'}</span>
                {runStatus?.success === false && <span className="text-red-400/90 ml-1">(success=false)</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 bg-zinc-950/40 rounded-md">
                  <div className="text-zinc-500">PP picks</div>
                  <div className="text-lg text-zinc-100">{runStatus?.prizepicks?.picksCount ?? '—'}</div>
                </div>
                <div className="p-2 bg-zinc-950/40 rounded-md">
                  <div className="text-zinc-500">PP cards</div>
                  <div className="text-lg text-zinc-100">{runStatus?.prizepicks?.cardsCount ?? '—'}</div>
                </div>
                <div className="p-2 bg-zinc-950/40 rounded-md">
                  <div className="text-zinc-500">UD picks</div>
                  <div className="text-lg text-zinc-100">{runStatus?.underdog?.picksCount ?? '—'}</div>
                </div>
                <div className="p-2 bg-zinc-950/40 rounded-md">
                  <div className="text-zinc-500">UD cards</div>
                  <div className="text-lg text-zinc-100">{runStatus?.underdog?.cardsCount ?? '—'}</div>
                </div>
              </div>
              <p className="text-[10px] text-zinc-600 border-t border-zinc-800/60 pt-2">
                Source: latest_run_status.json (synced under public/data/reports/).
              </p>
            </section>

            <section className={cardShell}>
              <div className="text-zinc-200 font-medium text-[13px]">Pipeline diagnostics</div>
              <div className="text-[11px] text-zinc-500 space-y-1 border-b border-zinc-800/60 pb-2">
                <div>
                  <span className="text-zinc-600">Pre-diversification: </span>
                  {preDiv?.dominantDropStage ? shortStage(preDiv.dominantDropStage) : '—'}
                </div>
                <div>
                  <span className="text-zinc-600">UD pipeline: </span>
                  {preDiv?.ud?.cardsPostDedupe ?? '—'} post-dedupe → {preDiv?.ud?.cardsAfterSelectionEngine ?? '—'}{' '}
                  after selection engine
                </div>
              </div>
              <div className="text-[11px] text-zinc-300 space-y-1.5 max-h-40 overflow-y-auto">
                {fetchDone &&
                  decision.detailLines.map((line, i) => (
                    <p key={i} className="leading-snug">
                      {line}
                    </p>
                  ))}
                {fetchDone && decision.detailLines.length === 0 && (
                  <p className="text-zinc-500">
                    {decision.verdict === 'PLAYABLE'
                      ? 'No extra diagnostic lines — last run exported cards.'
                      : 'No extra diagnostic lines in artifacts.'}
                  </p>
                )}
              </div>
              <p className="text-[10px] text-zinc-600 border-t border-zinc-800/60 pt-2">
                Sources: latest_pre_diversification_card_diagnosis.json, latest_card_ev_viability.json.
              </p>
            </section>

            <section className={cardShell}>
              <div className="text-zinc-200 font-medium text-[13px]">Historical feature coverage</div>
              {featReg == null ? (
                <div className="text-zinc-500 text-[11px]">Registry artifact missing or empty.</div>
              ) : (
                <>
                  <div className="text-zinc-300">
                    Tracker rows: <span className="text-zinc-100">{featReg.rowCount}</span> · market groups:{' '}
                    <span className="text-zinc-100">{featReg.marketGroups ?? '—'}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 max-h-28 overflow-y-auto space-y-1">
                    {coverageTop.map((c) => (
                      <div key={c.field} className="flex justify-between gap-2 border-b border-zinc-800/50 pb-0.5">
                        <span className="text-zinc-500 truncate" title={c.field}>
                          {c.field}
                        </span>
                        <span className="text-zinc-200 shrink-0">{fmtPct(c.fraction)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-600">
                    Read-only backtest features. Source: latest_historical_feature_registry.json.
                  </p>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
